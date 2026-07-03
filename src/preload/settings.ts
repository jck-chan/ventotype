/**
 * Preload for the settings window.
 * Intentionally avoids @shared imports so Rollup emits a single self-contained
 * file — sandboxed preloads cannot require() split chunk files.
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('settingsAPI', {
  get: () => ipcRenderer.invoke('settings:get'),
  set: (patch: unknown) => ipcRenderer.invoke('settings:set', patch),
  saveActiveProfile: (profile: unknown, activeProfileId: unknown) =>
    ipcRenderer.invoke('settings:save-active-profile', profile, activeProfileId),
  openLogFile: () => ipcRenderer.invoke('shell:open-log-file'),
  openUserDataFolder: () => ipcRenderer.invoke('shell:open-user-data-folder'),
  listModels: (baseURL: string, apiKey: string, type: string) =>
    ipcRenderer.invoke('api:list-models', baseURL, apiKey, type),
  getLoginItem: () => ipcRenderer.invoke('app:get-login-item'),
  setLoginItem: (enable: boolean) => ipcRenderer.invoke('app:set-login-item', enable)
});
