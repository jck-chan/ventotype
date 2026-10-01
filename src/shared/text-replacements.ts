import type { TextReplacement } from './types';

const LEGACY_FORMAT_VERSION = 1;
const MAX_RULES = 10_000;

/** Spokenly uses seconds since 2001-01-01 for createdAt. */
export function newTextReplacement(original = '', replacement = ''): TextReplacement {
  return {
    id: globalThis.crypto.randomUUID().toUpperCase(),
    createdAt: Date.now() / 1000 - 978307200,
    isRegex: false,
    original,
    replacement,
    timing: 'beforeAI'
  };
}

/** Preserve Spokenly metadata when editing and exporting plain replacement rules. */
export function validateTextReplacements(value: unknown): TextReplacement[] {
  if (!Array.isArray(value) || value.length > MAX_RULES) {
    throw new Error(`Text replacements must be an array of at most ${MAX_RULES} rules.`);
  }

  const seenSources = new Set<string>();
  const seenIds = new Set<string>();
  return value.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`Rule ${index + 1} is not an object.`);
    }

    // Keep settings written by VentoType's earlier version usable.
    if (typeof item.from === 'string' && typeof item.to === 'string') {
      item = newTextReplacement(item.from, item.to);
    }
    if (typeof item.id !== 'string' || !item.id ||
        typeof item.createdAt !== 'number' || !Number.isFinite(item.createdAt) ||
        typeof item.isRegex !== 'boolean' ||
        typeof item.original !== 'string' || typeof item.replacement !== 'string' ||
        !['beforeAI', 'afterAI', 'both'].includes(item.timing)) {
      throw new Error(`Rule ${index + 1} is missing Spokenly replacement fields.`);
    }
    if (item.isRegex) {
      throw new Error(`Rule ${index + 1} uses a regular expression, which VentoType cannot apply yet.`);
    }
    const original = item.original.trim();
    if (!original || original.length > 200 || item.replacement.length > 10_000) {
      throw new Error(`Rule ${index + 1} has an empty or overly long value.`);
    }
    if (seenIds.has(item.id)) throw new Error(`Duplicate rule ID: ${item.id}`);
    seenIds.add(item.id);
    for (const variant of original.split(',').map((part: string) => part.trim())) {
      if (!variant) throw new Error(`Rule ${index + 1} has an empty comma-separated variant.`);
      const key = variant.toLocaleLowerCase();
      if (seenSources.has(key)) throw new Error(`Duplicate text to find: ${variant}`);
      seenSources.add(key);
    }
    return {
      id: item.id,
      createdAt: item.createdAt,
      isRegex: false,
      original,
      replacement: item.replacement,
      timing: item.timing
    };
  });
}

export function parseTextReplacementsFile(value: unknown): TextReplacement[] {
  if (Array.isArray(value)) return validateTextReplacements(value);
  if (value && typeof value === 'object' &&
      'version' in value && value.version === LEGACY_FORMAT_VERSION &&
      'replacements' in value) {
    return validateTextReplacements(value.replacements);
  }
  throw new Error('Expected a Spokenly Word Replacements JSON array.');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const wordChar = /[\p{L}\p{N}]/u;
const hanChar = /\p{Script=Han}/u;

/** One pass; Han characters can be replaced inside continuous Chinese text. */
export function applyTextReplacements(text: string, replacements: TextReplacement[] = []): string {
  if (!replacements.length) return text;
  const ordered = replacements.flatMap((item) =>
    item.original.split(',').map((part) => ({ original: part.trim(), replacement: item.replacement }))
  ).filter((item) => item.original).sort((a, b) => b.original.length - a.original.length);
  const pattern = ordered.map((item) => {
    const chars = Array.from(item.original);
    const first = chars[0];
    const last = chars[chars.length - 1];
    const before = wordChar.test(first) && !hanChar.test(first) ? '(?<![\\p{L}\\p{N}])' : '';
    const after = wordChar.test(last) && !hanChar.test(last) ? '(?![\\p{L}\\p{N}])' : '';
    return `${before}${escapeRegExp(item.original)}${after}`;
  }).join('|');
  const regex = new RegExp(`(?:${pattern})`, 'giu');
  const lookup = new Map(ordered.map((item) => [item.original.toLocaleLowerCase(), item.replacement]));
  return text.replace(regex, (match) => lookup.get(match.toLocaleLowerCase()) ?? match);
}
