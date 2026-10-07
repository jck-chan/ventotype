import { randomUUID } from 'node:crypto';
import { SETTINGS_FILE, TEXT_REPLACEMENTS_DIR, TEXT_REPLACEMENTS_METADATA_FILE } from '@shared/user-data';
import { storeRelativePath } from '../paths';
import type { Migration } from '../types';

export const moveTextReplacementsToFiles: Migration = {
  version: 5,
  description: 'move text replacements into named rule set files',
  up(ctx) {
    const settingsPath = storeRelativePath(SETTINGS_FILE);
    const legacyDefaultPath = storeRelativePath(`${TEXT_REPLACEMENTS_DIR}/default.json`);
    const metadataPath = storeRelativePath(TEXT_REPLACEMENTS_METADATA_FILE);
    const settings = ctx.readJson(settingsPath) ?? {};
    const legacyRules = settings.textReplacements;
    if (!ctx.fileExists(legacyDefaultPath) && Array.isArray(legacyRules) && legacyRules.length > 0) {
      let filename = 'untitled.json';
      for (let number = 1; ctx.fileExists(storeRelativePath(`${TEXT_REPLACEMENTS_DIR}/${filename}`)); number++) {
        filename = `untitled ${number}.json`;
      }
      const id = randomUUID();
      ctx.writeJson(storeRelativePath(`${TEXT_REPLACEMENTS_DIR}/${filename}`), {
        id,
        replacements: legacyRules
      });
      if (!ctx.fileExists(metadataPath)) ctx.writeJson(metadataPath, { order: [{ id, enabled: true }] });
    }
    if (ctx.fileExists(settingsPath)) {
      delete settings.textReplacements;
      ctx.writeJson(settingsPath, settings);
    }
  }
};
