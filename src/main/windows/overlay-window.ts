import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';
import { DictationState } from '@shared/types';
import { IPC } from '@shared/ipc-channels';

const OVERLAY_PRELOAD = join(__dirname, '../preload/overlay.js');
const FOLLOW_INTERVAL_MS = 4; // 125fps

export class OverlayWindow {
  private win: BrowserWindow | null = null;
  private followTimer: ReturnType<typeof setInterval> | null = null;

  create(): void {
    if (this.win && !this.win.isDestroyed()) return;

    const win = new BrowserWindow({
      width: 52,
      height: 52,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      closable: false,
      roundedCorners: true,
      hasShadow: false,
      webPreferences: {
        preload: OVERLAY_PRELOAD,
        contextIsolation: true,
        sandbox: false   // must be false so preload can load its module chunks
      }
    });

    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setIgnoreMouseEvents(true);

    if (process.env['ELECTRON_RENDERER_URL']) {
      win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/overlay/index.html`);
    } else {
      win.loadFile(join(__dirname, '../renderer/overlay/index.html'));
    }

    this.win = win;
  }

  /** Show overlay and start following cursor. */
  showAndFollow(): void {
    if (!this.win || this.win.isDestroyed()) this.create();
    this.snapToCursor();   // position correctly before the window is visible
    this.win!.showInactive();
    this.startFollowing();
  }

  /** Hide overlay and stop following cursor. */
  hide(): void {
    this.stopFollowing();
    this.win?.hide();
  }

  /**
   * Tear down the overlay. Required before quit: `closable: false` windows otherwise
   * block `app.quit()` on macOS.
   */
  destroy(): void {
    this.stopFollowing();
    if (this.win && !this.win.isDestroyed()) {
      this.win.destroy();
    }
    this.win = null;
  }

  /** Tell the overlay renderer to begin audio capture. */
  sendStart(): void {
    this.win?.webContents.send(IPC.Dictation.Start);
  }

  /** Tell the overlay renderer to stop audio capture and ship the blob for transcription. */
  sendStop(): void {
    this.win?.webContents.send(IPC.Dictation.Stop);
  }

  /** Tell the overlay renderer to stop capture and discard audio (cancel). */
  sendCancel(): void {
    this.win?.webContents.send(IPC.Dictation.Cancel);
  }

  /** Send dictation state to overlay renderer so it can update the icon. */
  setState(state: DictationState, message?: string): void {
    if (!this.win || this.win.isDestroyed()) return;
    this.win.webContents.send(IPC.Dictation.StateChanged, { state, message });
  }

  private startFollowing(): void {
    if (this.followTimer) return;
    this.followTimer = setInterval(() => this.snapToCursor(), FOLLOW_INTERVAL_MS);
  }

  private stopFollowing(): void {
    if (this.followTimer) {
      clearInterval(this.followTimer);
      this.followTimer = null;
    }
  }

  private snapToCursor(): void {
    if (!this.win || this.win.isDestroyed()) {
      this.stopFollowing();
      return;
    }
    const { x, y } = screen.getCursorScreenPoint();
    const offset = 18;
    this.win.setPosition(x + offset, y + offset, false);
  }
}
