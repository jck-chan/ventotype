import type { TextReplacement } from './types';

const MAX_RULES = 10_000;

export function newTextReplacement(original = '', replacement = ''): TextReplacement {
  return { original, replacement };
}

export function validateTextReplacements(value: unknown): TextReplacement[] {
  if (!Array.isArray(value) || value.length > MAX_RULES) {
    throw new Error(`Text replacements must be an array of at most ${MAX_RULES} rules.`);
  }

  const seenSources = new Set<string>();
  return value.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`Rule ${index + 1} is not an object.`);
    }

    // Keep settings and files written by earlier VentoType versions usable.
    if (typeof item.from === 'string' && typeof item.to === 'string') {
      item = newTextReplacement(item.from, item.to);
    }
    if (typeof item.original !== 'string' || typeof item.replacement !== 'string') {
      throw new Error(`Rule ${index + 1} needs original and replacement text.`);
    }
    if (item.isRegex) {
      throw new Error(`Rule ${index + 1} uses a regular expression, which VentoType cannot apply yet.`);
    }
    const original = item.original.trim();
    if (!original || original.length > 200 || item.replacement.length > 10_000) {
      throw new Error(`Rule ${index + 1} has an empty or overly long value.`);
    }
    for (const variant of original.split(',').map((part: string) => part.trim())) {
      if (!variant) throw new Error(`Rule ${index + 1} has an empty comma-separated variant.`);
      const key = variant.toLocaleLowerCase();
      if (seenSources.has(key)) throw new Error(`Duplicate text to find: ${variant}`);
      seenSources.add(key);
    }
    return {
      original,
      replacement: item.replacement
    };
  });
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
