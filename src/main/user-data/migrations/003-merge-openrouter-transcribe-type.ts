import { PROFILES_FILE } from '@shared/user-data';
import { storeRelativePath } from '../paths';
import type { Migration } from '../types';

interface LegacyProfile {
  type?: string;
}

/** Keep each profile's connection details while moving it to the shared route. */
export const mergeOpenRouterTranscribeType: Migration = {
  version: 3,
  description: "merge 'openrouter-transcribe' into 'openai-transcribe'",
  up(ctx) {
    const path = storeRelativePath(PROFILES_FILE);
    const data = ctx.readJson(path) as { profiles?: LegacyProfile[] } | null;
    if (!data?.profiles) return;

    let changed = 0;
    for (const profile of data.profiles) {
      if (profile.type !== 'openrouter-transcribe') continue;
      profile.type = 'openai-transcribe';
      changed += 1;
    }

    if (changed > 0) {
      ctx.writeJson(path, data);
      ctx.log(`merged ${changed} OpenRouter transcription profile(s) into the shared type`);
    }
  }
};
