/**
 * Latest user-data schema version. Bump when adding a migration.
 * Version 1 is a historical no-op (see migrations/001-baseline.ts) — it was
 * stamped onto every install's manifest before any real migration existed,
 * so it can't carry one now without silently un-applying itself on installs
 * that already sit at "1".
 */
export const USER_DATA_VERSION = 2;

/** Subfolder under Electron's userData where VentoType stores its files. */
export const USER_DATA_SUBDIR = 'data';

export interface UserDataManifest {
  version: number;
}

export const USER_DATA_MANIFEST_FILE = 'userdata-manifest.json';
export const SETTINGS_FILE = 'settings.json';
export const PROFILES_FILE = 'profiles.json';
