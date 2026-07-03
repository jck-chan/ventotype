/**
 * Preload for the settings window.
 * Intentionally avoids @shared imports so Rollup emits a single self-contained
 * file — sandboxed preloads cannot require() split chunk files.
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('settingsAPI', {
  get: () => ipcRenderer.invoke('settings:get'),
  set: (patch: unknown) => ipcRenderer.invoke('settings:set', patch),
  openLogFile: () => ipcRenderer.invoke('shell:open-log-file'),
  openSettingsFile: () => ipcRenderer.invoke('shell:open-settings-file'),
  listModels: (baseURL: string, apiKey: string, type: string) =>
    ipcRenderer.invoke('api:list-models', baseURL, apiKey, type),
  getLoginItem: () => ipcRenderer.invoke('app:get-login-item'),
  setLoginItem: (enable: boolean) => ipcRenderer.invoke('app:set-login-item', enable)
});
