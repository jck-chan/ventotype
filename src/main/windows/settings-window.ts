import { BrowserWindow, app } from 'electron';
import { join } from 'node:path';

const SETTINGS_PRELOAD = join(__dirname, '../preload/settings.js');

export class SettingsWindow {
  private win: BrowserWindow | null = null;

  /** `onVisibilityChanged` fires when the window opens and when it closes. */
  constructor(private readonly onVisibilityChanged: () => void) {}

  show(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.setAlwaysOnTop(false);
      if (this.win.isMinimized()) this.win.restore();
      this.present(this.win);
      return;
    }

    const win = new BrowserWindow({
      width: 560,
      height: 620,
      minWidth: 480,
      minHeight: 520,
      show: false,
      title: 'VentoType',
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
      backgroundColor: '#0f0f11',
      autoHideMenuBar: true,
      alwaysOnTop: false,
      skipTaskbar: false,
      webPreferences: {
        preload: SETTINGS_PRELOAD,
        contextIsolation: true,
        sandbox: false   // must be false so preload can load its module chunks
      }
    });

    win.on('ready-to-show', () => this.present(win));

    win.on('closed', () => {
      this.win = null;
      if (process.platform === 'darwin') {
        // No visible windows → re-hide dock icon so the app returns to background.
        app.dock?.hide();
      }
      this.onVisibilityChanged();
    });

    if (process.env['ELECTRON_RENDERER_URL']) {
      win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/settings/index.html`);
    } else {
      win.loadFile(join(__dirname, '../renderer/settings/index.html'));
    }

    this.win = win;
    this.onVisibilityChanged();
  }

  /**
   * Brings the window in front of whatever the user is looking at. Showing and
   * focusing a window is not enough on macOS: an LSUIElement app is not the
   * active application merely because one of its windows appeared, so Settings
   * would open behind the frontmost app. `app.focus({ steal: true })` is what
   * activates it, and the dock icon has to go up first — until the process is a
   * regular one there is nothing for macOS to bring forward. Stealing focus is
   * the intent here: the only way in is the user clicking the menu bar icon.
   */
  private present(win: BrowserWindow): void {
    if (process.platform === 'darwin') app.dock?.show();
    win.show();
    win.focus();
    if (process.platform === 'darwin') app.focus({ steal: true });
  }

  isOpen(): boolean {
    return !!this.win && !this.win.isDestroyed();
  }

  /** Pushes to the settings renderer. No-op when the window isn't open. */
  send(channel: string, payload?: unknown): void {
    if (!this.isOpen()) return;
    this.win?.webContents.send(channel, payload);
  }
}
