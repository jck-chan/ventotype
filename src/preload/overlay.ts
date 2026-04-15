/**
 * Preload for the overlay window.
 * Intentionally avoids @shared imports so Rollup emits a single self-contained
 * file — sandboxed preloads cannot require() split chunk files.
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('overlayAPI', {
  onStart: (cb: () => void): void => {
    ipcRenderer.on('dictation:start', cb);
  },
  onStop: (cb: () => void): void => {
    ipcRenderer.on('dictation:stop', cb);
  },
  onStateChanged: (cb: (payload: unknown) => void): void => {
    ipcRenderer.on('dictation:state-changed', (_e, payload: unknown) => cb(payload));
  },
  sendAudio: (audio: ArrayBuffer, mimeType: string): void => {
    ipcRenderer.send('dictation:audio-blob', audio, mimeType);
  },
  sendError: (message: string): void => {
    ipcRenderer.send('dictation:record-error', message);
  }
});
