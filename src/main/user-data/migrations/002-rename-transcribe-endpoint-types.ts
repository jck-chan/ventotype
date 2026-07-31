import { PROFILES_FILE } from '@shared/user-data';
import { storeRelativePath } from '../paths';
import type { Migration } from '../types';

interface LegacyProfile {
  type?: string;
}

/** Old endpoint type value → its renamed replacement. */
const RENAMES: Record<string, string> = {
  openai: 'openai-transcribe',
  openrouter: 'openrouter-transcribe'
};

/**
 * Endpoint types were renamed so every value names its route, not just its
 * provider: 'openai' → 'openai-transcribe' (pairs with 'openai-chat'), and
 * 'openrouter' → 'openrouter-transcribe' for the same reason.
 */
export const renameTranscribeEndpointTypes: Migration = {
  version: 2,
  description: "rename endpoint types 'openai'/'openrouter' to their '-transcribe' forms",
  up(ctx) {
    const path = storeRelativePath(PROFILES_FILE);
    const data = ctx.readJson(path) as { profiles?: LegacyProfile[] } | null;
    if (!data?.profiles) return;

    let changed = 0;
    for (const profile of data.profiles) {
      const renamed = profile.type ? RENAMES[profile.type] : undefined;
      if (renamed) {
        profile.type = renamed;
        changed += 1;
      }
    }

    if (changed > 0) {
      ctx.writeJson(path, data);
      ctx.log(`renamed endpoint type on ${changed} profile(s) to their '-transcribe' form`);
    }
  }
};
