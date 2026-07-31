import { existsSync, readFileSync } from 'node:fs';
import { USER_DATA_VERSION, UserDataManifest } from '@shared/user-data';
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

/**
 * No manifest but settings/profiles already exist on disk: this install
 * predates the manifest system, so treat it as version 0 and run every
 * migration. No settings/profiles either means a genuine fresh install —
 * there's nothing on disk yet to migrate from.
 */
export function inferUserDataVersion(electronUserDataDir: string): number {
  const paths = userDataPaths(electronUserDataDir);
  const hasExistingData = existsSync(paths.settings) || existsSync(paths.profiles);
  return hasExistingData ? 0 : USER_DATA_VERSION;
}
