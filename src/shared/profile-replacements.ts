import type { ProfileRegexReplacement } from './types';

export const MAX_PROFILE_REPLACEMENTS = 100;

/** Validate data received over IPC and from profiles.json before it is applied. */
export function validateProfileReplacements(value: unknown): ProfileRegexReplacement[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_PROFILE_REPLACEMENTS) {
    throw new Error(`Profile replacements must contain at most ${MAX_PROFILE_REPLACEMENTS} rules.`);
  }

  return value.map((rule, index) => {
    if (!rule || typeof rule !== 'object' ||
        typeof rule.pattern !== 'string' || typeof rule.replacement !== 'string' ||
        !rule.pattern || rule.pattern.length > 500 || rule.replacement.length > 10_000) {
      throw new Error(`Profile replacement ${index + 1} needs a pattern and a valid replacement.`);
    }
    try {
      new RegExp(rule.pattern, 'g');
    } catch (error) {
      throw new Error(`Profile replacement ${index + 1} has an invalid regular expression: ${(error as Error).message}`);
    }
    return { pattern: rule.pattern, replacement: rule.replacement };
  });
}

/** Run each rule once, in list order. Empty replacement text removes a match. */
export function applyProfileReplacements(text: string, rules: ProfileRegexReplacement[] = []): string {
  for (const rule of rules) {
    text = text.replace(new RegExp(rule.pattern, 'g'), rule.replacement);
  }
  return text;
}
