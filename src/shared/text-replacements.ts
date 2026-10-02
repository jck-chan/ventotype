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
      item = { original: item.from, replacement: item.to, isRegex: item.isRegex };
    }
    if (typeof item.original !== 'string' || typeof item.replacement !== 'string') {
      throw new Error(`Rule ${index + 1} needs original and replacement text.`);
    }
    if (item.isRegex !== undefined && typeof item.isRegex !== 'boolean') {
      throw new Error(`Rule ${index + 1} needs a boolean isRegex value.`);
    }
    const original = item.isRegex ? item.original : item.original.trim();
    if (!original.trim() || original.length > 200 || item.replacement.length > 10_000) {
      throw new Error(`Rule ${index + 1} has an empty or overly long value.`);
    }
    if (item.isRegex) {
      try {
        new RegExp(original, 'g');
      } catch (error) {
        throw new Error(`Rule ${index + 1} has an invalid regular expression: ${(error as Error).message}`);
      }
    } else {
      for (const variant of original.split(',').map((part: string) => part.trim())) {
        if (!variant) throw new Error(`Rule ${index + 1} has an empty comma-separated variant.`);
        const key = variant.toLocaleLowerCase();
        if (seenSources.has(key)) throw new Error(`Duplicate text to find: ${variant}`);
        seenSources.add(key);
      }
    }
    return {
      original,
      replacement: item.replacement,
      ...(item.isRegex !== undefined && { isRegex: item.isRegex })
    };
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const wordChar = /[\p{L}\p{N}]/u;
const hanChar = /\p{Script=Han}/u;

/** One pass; Han characters can be replaced inside continuous Chinese text. */
function applyPlainReplacements(text: string, replacements: TextReplacement[]): string {
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

/** Apply regex rules in order, with each adjacent plain-rule group taking one pass. */
export function applyTextReplacements(text: string, replacements: TextReplacement[] = []): string {
  let plainRules: TextReplacement[] = [];
  for (const rule of replacements) {
    if (rule.isRegex) {
      text = applyPlainReplacements(text, plainRules);
      plainRules = [];
      text = text.replace(new RegExp(rule.original, 'g'), rule.replacement);
    } else {
      plainRules.push(rule);
    }
  }
  return applyPlainReplacements(text, plainRules);
}
