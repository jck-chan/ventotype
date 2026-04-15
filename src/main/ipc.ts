import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { IPC } from '@shared/ipc-channels';
import { Settings } from '@shared/types';
import { SettingsStore } from './services/settings-store';
import { DictationController } from './services/dictation-controller';

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
  ipcMain.on(IPC.Dictation.AudioBlob, (_e, audio: ArrayBuffer, mimeType: string) => {
    controller.handleAudio(audio, mimeType).catch(console.error);
  });

  // Recording error from renderer
  ipcMain.on(IPC.Dictation.RecordError, (_e, message: string) => {
    controller.handleRecordError(message);
  });
}
