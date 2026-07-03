import { existsSync, readFileSync } from 'node:fs';
import { USER_DATA_VERSION, USER_DATA_MANIFEST_FILE, UserDataManifest } from '@shared/user-data';
import { userDataPaths } from './paths';

function readManifestFile(path: string): UserDataManifest | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as UserDataManifest;
    if (typeof parsed.version === 'number' && parsed.version >= 0) return parsed;
  } catch {
    // Ignore parse errors — fall through.
  }
  return null;
}

export function readManifest(electronUserDataDir: string): UserDataManifest | null {
  return readManifestFile(userDataPaths(electronUserDataDir).manifest);
}

/** Fresh install or unknown state: treat as current version. */
export function inferUserDataVersion(_electronUserDataDir: string): number {
  return USER_DATA_VERSION;
}
