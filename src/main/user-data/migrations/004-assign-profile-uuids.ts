import { randomUUID } from 'node:crypto';
import { PROFILES_FILE } from '@shared/user-data';
import { storeRelativePath } from '../paths';
import type { Migration } from '../types';

interface SavedProfile {
  id?: string;
  [key: string]: unknown;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Replace legacy profile IDs while keeping the active profile and all connection details. */
export const assignProfileUuids: Migration = {
  version: 4,
  description: 'assign UUIDs to connection profiles',
  up(ctx) {
    const path = storeRelativePath(PROFILES_FILE);
    const data = ctx.readJson(path) as { profiles?: SavedProfile[]; activeProfileId?: string } | null;
    if (!data || !Array.isArray(data.profiles)) return;

    const ids = new Map<string, string>();
    const used = new Set<string>();
    for (const profile of data.profiles) {
      const oldId = profile.id;
      const id = oldId && UUID.test(oldId) && !used.has(oldId) ? oldId : randomUUID();
      profile.id = id;
      used.add(id);
      if (oldId && !ids.has(oldId)) ids.set(oldId, id);
    }

    data.activeProfileId = ids.get(data.activeProfileId ?? '') ?? data.profiles[0]?.id ?? '';
    ctx.writeJson(path, data);
    ctx.log(`assigned UUIDs to ${data.profiles.length} connection profile(s)`);
  }
};
