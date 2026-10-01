import type { TextReplacement } from './types';

export const TEXT_REPLACEMENTS_FORMAT_VERSION = 1;

/** Validate both imported files and changes arriving across IPC. */
export function validateTextReplacements(value: unknown): TextReplacement[] {
  if (!Array.isArray(value) || value.length > 1000) {
    throw new Error('Text replacements must be an array of at most 1000 rules.');
  }

  const seen = new Set<string>();
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' ||
        typeof item.from !== 'string' || typeof item.to !== 'string') {
      throw new Error(`Rule ${index + 1} needs text to find and replacement text.`);
    }
    const from = item.from.trim();
    if (!from || from.length > 200 || item.to.length > 10000) {
      throw new Error(`Rule ${index + 1} has an empty or overly long value.`);
    }
    const key = from.toLocaleLowerCase();
    if (seen.has(key)) throw new Error(`Duplicate text to find: ${from}`);
    seen.add(key);
    return { from, to: item.to };
  });
}

export function parseTextReplacementsFile(value: unknown): TextReplacement[] {
  if (!value || typeof value !== 'object' ||
      !('version' in value) || value.version !== TEXT_REPLACEMENTS_FORMAT_VERSION ||
      !('replacements' in value)) {
    throw new Error('Expected a VentoType text replacements JSON file (version 1).');
  }
  return validateTextReplacements(value.replacements);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** One pass: inserted text is never fed through another rule. */
export function applyTextReplacements(text: string, replacements: TextReplacement[] = []): string {
  if (!replacements.length) return text;
  const ordered = [...replacements].sort((a, b) => b.from.length - a.from.length);
  const pattern = ordered.map((item) => escapeRegExp(item.from)).join('|');
  const regex = new RegExp(`(?<![\\p{L}\\p{N}])(?:${pattern})(?![\\p{L}\\p{N}])`, 'giu');
  const lookup = new Map(ordered.map((item) => [item.from.toLocaleLowerCase(), item.to]));
  return text.replace(regex, (match) => lookup.get(match.toLocaleLowerCase()) ?? match);
}
