/** Latest user-data schema version. Bump when adding a migration. */
export const USER_DATA_VERSION = 1;

/** Subfolder under Electron's userData where VentoType stores its files. */
export const USER_DATA_SUBDIR = 'data';

export interface UserDataManifest {
  version: number;
}

export const USER_DATA_MANIFEST_FILE = 'userdata-manifest.json';
export const SETTINGS_FILE = 'settings.json';
export const PROFILES_FILE = 'profiles.json';
