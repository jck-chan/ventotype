import { ipcMain, IpcMainInvokeEvent, shell, app } from 'electron';
import { IPC } from '@shared/ipc-channels';
import { ConnectionProfile, EndpointType, Settings } from '@shared/types';
import { SettingsStore } from './services/settings-store';
import { DictationController } from './services/dictation-controller';
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

export function registerIpcHandlers(
  store: SettingsStore,
  controller: DictationController
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
  ipcMain.handle(IPC.Shell.OpenSettingsFile, () => shell.openPath(store.ensureFile()));

  // Login item (open at login)
  ipcMain.handle(IPC.App.GetLoginItem, () =>
    app.getLoginItemSettings().openAtLogin
  );
  ipcMain.handle(IPC.App.SetLoginItem, (_e: IpcMainInvokeEvent, enable: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enable });
  });

  // Fetch model list using provider-specific behavior. Keep providers separate
  // here even when their APIs look similar, since their capabilities will diverge.
  ipcMain.handle(
    IPC.Api.ListModels,
    async (_e: IpcMainInvokeEvent, baseURL: string, apiKey: string, type: EndpointType) => {
      switch (type) {
        case 'openai':
          return listOpenAiModels(baseURL, apiKey);
        case 'openrouter':
          return listOpenRouterModels(baseURL, apiKey);
      }
    }
  );
}
