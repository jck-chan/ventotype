import { BrowserWindow, app } from 'electron';
import { join } from 'node:path';

const SETTINGS_PRELOAD = join(__dirname, '../preload/settings.js');

export class SettingsWindow {
  private win: BrowserWindow | null = null;

  show(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.show();
      this.win.focus();
      if (process.platform === 'darwin') app.dock?.show();
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
      skipTaskbar: false,
      webPreferences: {
        preload: SETTINGS_PRELOAD,
        contextIsolation: true,
        sandbox: false   // must be false so preload can load its module chunks
      }
    });

    win.on('ready-to-show', () => {
      win.show();
      if (process.platform === 'darwin') app.dock?.show();
    });

    win.on('closed', () => {
      this.win = null;
      if (process.platform === 'darwin') {
        // No visible windows → re-hide dock icon so the app returns to background.
        app.dock?.hide();
      }
    });

    if (process.env['ELECTRON_RENDERER_URL']) {
      win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/settings/index.html`);
    } else {
      win.loadFile(join(__dirname, '../renderer/settings/index.html'));
    }

    this.win = win;
  }

  isOpen(): boolean {
    return !!this.win && !this.win.isDestroyed();
  }
}
