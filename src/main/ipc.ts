import { ipcMain, IpcMainInvokeEvent, shell, app, BrowserWindow, dialog } from 'electron';
import { IPC } from '@shared/ipc-channels';
import { ConnectionProfile, EndpointType, Settings } from '@shared/types';
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

async function listVercelModels(baseURL: string, type: EndpointType): Promise<string[]> {
  const url = new URL('/v1/models', baseURL);
  // The model catalog is public. Sending an invalid profile key makes it return 401.
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as { data?: { id: string; type?: string }[] };
  const modelType = type === 'vercel-transcribe' ? 'transcription' : 'language';
  return (data.data ?? []).filter((model) => model.type === modelType).map((model) => model.id).sort();
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
  ipcMain.handle(
    IPC.Settings.SaveProfileStructure,
    (_e: IpcMainInvokeEvent, profiles: ConnectionProfile[], activeProfileId: string) =>
      store.updateProfileStructure(profiles, activeProfileId)
  );
  ipcMain.handle(IPC.Settings.SetActiveProfile, (_e: IpcMainInvokeEvent, id: string) =>
    store.setActiveProfileId(id)
  );
  ipcMain.handle(IPC.Settings.ConfirmDiscardProfile, (event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    return dialog.showMessageBoxSync(win, {
      type: 'warning',
      title: 'Unsaved profile',
      message: 'You have unsaved profile changes.',
      detail: 'Switch profiles and discard these changes?',
      buttons: ['Keep Editing', 'Discard Changes'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    }) === 1;
  });

  ipcMain.handle(IPC.TextReplacements.OpenFolder, () => shell.openPath(store.ruleSetsDir));
  ipcMain.handle(IPC.TextReplacements.CreateSet, () => store.createTextReplacementSet());
  ipcMain.handle(IPC.TextReplacements.Refresh, () => {
    store.refreshTextReplacementSets();
    return store.value;
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
      if (type === 'vercel-transcribe' || type === 'vercel-chat') {
        return listVercelModels(baseURL, type);
      }
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
      return transcriber.transcribe({ audio, mimeType }, profile);
    }
  );
}
