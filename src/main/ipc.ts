import { ipcMain, IpcMainInvokeEvent, shell } from 'electron';
import { IPC } from '@shared/ipc-channels';
import { Settings } from '@shared/types';
import { SettingsStore } from './services/settings-store';
import { DictationController } from './services/dictation-controller';
import { log } from './services/logger';

export function registerIpcHandlers(
  store: SettingsStore,
  controller: DictationController
): void {
  // Settings
  ipcMain.handle(IPC.Settings.Get, () => store.value);
  ipcMain.handle(IPC.Settings.Set, (_e: IpcMainInvokeEvent, patch: Partial<Settings>) =>
    store.update(patch)
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

  // Open the log folder in Finder / Explorer
  ipcMain.handle(IPC.Shell.OpenLogFolder, () => shell.openPath(log.logDir));
}
