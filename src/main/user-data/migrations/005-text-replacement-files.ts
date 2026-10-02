import { randomUUID } from 'node:crypto';
import { SETTINGS_FILE, TEXT_REPLACEMENTS_DIR, TEXT_REPLACEMENTS_METADATA_FILE } from '@shared/user-data';
import { storeRelativePath } from '../paths';
import type { Migration } from '../types';

export const moveTextReplacementsToFiles: Migration = {
  version: 5,
  description: 'move text replacements into named rule set files',
  up(ctx) {
    const settingsPath = storeRelativePath(SETTINGS_FILE);
    const defaultPath = storeRelativePath(`${TEXT_REPLACEMENTS_DIR}/default.json`);
    const metadataPath = storeRelativePath(TEXT_REPLACEMENTS_METADATA_FILE);
    const settings = ctx.readJson(settingsPath) ?? {};
    const existing = ctx.readJson(defaultPath);
    const id = typeof existing?.id === 'string' ? existing.id : randomUUID();
    if (!existing) {
      ctx.writeJson(defaultPath, {
        id,
        replacements: Array.isArray(settings.textReplacements) ? settings.textReplacements : []
      });
    }
    if (!ctx.fileExists(metadataPath)) ctx.writeJson(metadataPath, { order: [{ id, enabled: true }] });
    if (ctx.fileExists(settingsPath)) {
      delete settings.textReplacements;
      ctx.writeJson(settingsPath, settings);
    }
  }
};
