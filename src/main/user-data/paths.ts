import { join } from 'node:path';
import {
  PROFILES_FILE,
  SETTINGS_FILE,
  TEXT_REPLACEMENTS_DIR,
  TEXT_REPLACEMENTS_METADATA_FILE,
  USER_DATA_MANIFEST_FILE,
  USER_DATA_SUBDIR
} from '@shared/user-data';


export function userDataStoreDir(electronUserDataDir: string): string {
  return join(electronUserDataDir, USER_DATA_SUBDIR);
}

export function userDataPaths(electronUserDataDir: string) {
  const storeDir = userDataStoreDir(electronUserDataDir);
  return {
    storeDir,
    manifest: join(storeDir, USER_DATA_MANIFEST_FILE),
    settings: join(storeDir, SETTINGS_FILE),
    profiles: join(storeDir, PROFILES_FILE),
    textReplacementsDir: join(storeDir, TEXT_REPLACEMENTS_DIR),
    textReplacementsMetadata: join(storeDir, TEXT_REPLACEMENTS_METADATA_FILE)
  };
}

export function storeRelativePath(filename: string): string {
  return `${USER_DATA_SUBDIR}/${filename}`;
}
