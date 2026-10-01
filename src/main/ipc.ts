import { ipcMain, IpcMainInvokeEvent, shell, app, dialog, BrowserWindow } from 'electron';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { IPC } from '@shared/ipc-channels';
import { ConnectionProfile, EndpointType, Settings } from '@shared/types';
import {
  parseTextReplacementsFile,
  TEXT_REPLACEMENTS_FORMAT_VERSION,
  validateTextReplacements
} from '@shared/text-replacements';
import { PermissionId } from '@shared/permissions';
import { SettingsStore } from './services/settings-store';
import { DictationController } from './services/dictation-controller';
import { Transcriber } from './services/transcriber';
import { ShortcutManager } from './services/shortcuts';
import {
  checkPermissions,
  openPermissionSettings,
  requestPermission
} from './services/permissions';
import { log } from './services/logger';

async function listOpenAiModels(baseURL: string, apiKey: string): Promise<string[]> {
  const url = `${baseURL.replace(/\/$/, '')}/models`;
  const res = await fetch(url, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as { data: { id: string }[] };
  return (data.data ?? []).map((m: { id: string }) => m.id).sort();
}

async function listOpenRouterModels(baseURL: string, apiKey: string): Promise<string[]> {
  const url = `${baseURL.replace(/\/$/, '')}/models?output_modalities=transcription`;
  const res = await fetch(url, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as { data: { id: string }[] };
  return (data.data ?? []).map((m: { id: string }) => m.id).sort();
}

function isOpenRouterBaseURL(baseURL: string): boolean {
  try {
    return new URL(baseURL).hostname.toLowerCase() === 'openrouter.ai';
  } catch {
    return false;
  }
}

function isOfficialOpenAIBaseURL(baseURL: string): boolean {
  try {
    const hostname = new URL(baseURL).hostname.toLowerCase();
    return hostname === 'api.openai.com' || hostname.endsWith('.api.openai.com');
  } catch {
    return false;
  }
}

function isOpenAITranscriptionModel(id: string): boolean {
  return id === 'whisper-1' ||
    id === 'gpt-transcribe' || id.startsWith('gpt-transcribe-') ||
    /^gpt-4o-(?:mini-)?transcribe(?:-|$)/.test(id);
}

export function registerIpcHandlers(
  store: SettingsStore,
  controller: DictationController,
  transcriber: Transcriber,
  shortcuts: ShortcutManager
): void {
  // Settings
  ipcMain.handle(IPC.Settings.Get, () => store.value);
  ipcMain.handle(IPC.Settings.Set, (_e: IpcMainInvokeEvent, patch: Partial<Settings>) =>
    store.update(patch)
  );
  ipcMain.handle(
    IPC.Settings.SaveActiveProfile,
    (_e: IpcMainInvokeEvent, profile: ConnectionProfile, activeProfileId: string) =>
      store.updateActiveProfile(profile, activeProfileId)
  );

  ipcMain.handle(IPC.TextReplacements.Import, async (event) => {
    const parent = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: 'Import text replacements',
      properties: ['openFile'] as Array<'openFile'>,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    };
    const selection = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options);
    if (selection.canceled || !selection.filePaths[0]) return null;
    const path = selection.filePaths[0];
    if ((await stat(path)).size > 1_000_000) throw new Error('JSON file is too large (1 MB maximum).');
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(path, 'utf8'));
    } catch {
      throw new Error('Could not read a valid JSON file.');
    }
    return parseTextReplacementsFile(parsed);
  });

  ipcMain.handle(IPC.TextReplacements.Export, async (event, value: unknown) => {
    const replacements = validateTextReplacements(value);
    const parent = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: 'Export text replacements',
      defaultPath: 'ventotype-replacements.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    };
    const selection = parent
      ? await dialog.showSaveDialog(parent, options)
      : await dialog.showSaveDialog(options);
    if (selection.canceled || !selection.filePath) return false;
    await writeFile(selection.filePath, JSON.stringify({
      version: TEXT_REPLACEMENTS_FORMAT_VERSION,
      replacements
    }, null, 2) + '\n', 'utf8');
    return true;
  });

  // Settings is recording a shortcut: the keys belong to that field, not to dictation.
  ipcMain.handle(IPC.Shortcuts.SetCapturing, (_e: IpcMainInvokeEvent, capturing: boolean) =>
    shortcuts.setSuspended(capturing)
  );

  // Audio blob from overlay renderer after recording stops
  ipcMain.on(IPC.Dictation.AudioBlob, (_e, audio: ArrayBuffer, mimeType: string, durationMs: number) => {
    log.info(`[record] stopped  duration: ${(durationMs / 1000).toFixed(2)}s`);
    controller.handleAudio(audio, mimeType).catch((err) => log.error('[ipc] handleAudio', err));
  });

  // Recording error from renderer
  ipcMain.on(IPC.Dictation.RecordError, (_e, message: string) => {
    controller.handleRecordError(message);
  });

  // Open troubleshooting files in the OS default editor/viewer.
  ipcMain.handle(IPC.Shell.OpenLogFile, () => shell.openPath(log.logFile));
  ipcMain.handle(IPC.Shell.OpenUserDataFolder, () => shell.openPath(store.dataDir));

  // Last dictation failure — the overlay only flashes it, Settings keeps it.
  ipcMain.handle(IPC.Dictation.GetLastError, () => controller.lastDictationError);
  ipcMain.handle(IPC.Dictation.DismissLastError, () => controller.clearLastError());

  // OS permissions
  ipcMain.handle(IPC.Permissions.GetAll, () => checkPermissions());
  ipcMain.handle(IPC.Permissions.Request, (_e: IpcMainInvokeEvent, id: PermissionId) =>
    requestPermission(id)
  );
  ipcMain.handle(IPC.Permissions.OpenSettings, (_e: IpcMainInvokeEvent, id: PermissionId) =>
    openPermissionSettings(id)
  );

  // Login item (open at login)
  ipcMain.handle(IPC.App.GetLoginItem, () =>
    app.getLoginItemSettings().openAtLogin
  );
  ipcMain.handle(IPC.App.SetLoginItem, (_e: IpcMainInvokeEvent, enable: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enable });
  });

  // OpenRouter filters the catalog server-side. OpenAI's /models response has
  // only IDs, so filter its known file-transcription family on the client.
  // Other compatible servers keep their full list: their IDs are not standardized.
  ipcMain.handle(
    IPC.Api.ListModels,
    async (_e: IpcMainInvokeEvent, baseURL: string, apiKey: string, type: EndpointType) => {
      if (type === 'openai-transcribe' && isOpenRouterBaseURL(baseURL)) {
        return listOpenRouterModels(baseURL, apiKey);
      }
      const models = await listOpenAiModels(baseURL, apiKey);
      if (type === 'openai-transcribe' && isOfficialOpenAIBaseURL(baseURL)) {
        return models.filter(isOpenAITranscriptionModel);
      }
      return models;
    }
  );

  // Playground: transcribe an in-app recording or dropped file against any
  // saved profile (not necessarily the active one) and hand back the raw
  // response for inspection.
  ipcMain.handle(
    IPC.Playground.Transcribe,
    (_e: IpcMainInvokeEvent, audio: ArrayBuffer, mimeType: string, profileId: string) => {
      const profile = store.value.profiles.find((p) => p.id === profileId);
      if (!profile) throw new Error('Profile not found. Save it in Profiles first.');
      return transcriber.transcribeInspect({ audio, mimeType }, profile);
    }
  );
}
