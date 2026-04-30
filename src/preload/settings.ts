/**
 * Preload for the settings window.
 * Intentionally avoids @shared imports so Rollup emits a single self-contained
 * file — sandboxed preloads cannot require() split chunk files.
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('settingsAPI', {
  get: () => ipcRenderer.invoke('settings:get'),
  set: (patch: unknown) => ipcRenderer.invoke('settings:set', patch),
  openLogFolder: () => ipcRenderer.invoke('shell:open-log-folder')
});
