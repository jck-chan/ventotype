import { app, globalShortcut, type Tray } from 'electron';
import { SettingsStore } from './services/settings-store';
import { ShortcutManager } from './services/shortcuts';
import { Transcriber } from './services/transcriber';
import { Typer } from './services/typer';
import { DictationController } from './services/dictation-controller';
import { createMenuBarTray } from './services/menu-bar-tray';
import { SettingsWindow } from './windows/settings-window';
import { OverlayWindow } from './windows/overlay-window';
import { registerIpcHandlers } from './ipc';

// ── Single-instance lock ─────────────────────────────────────────────────────
const isPrimary = app.requestSingleInstanceLock();

if (!isPrimary) {
  // A second launch attempt: the running instance handles it via second-instance.
  app.quit();
}

// ── Boot ──────────────────────────────────────────────────────────────────────
const store = new SettingsStore();
const transcriber = new Transcriber(() => store.value);
const typer = new Typer();
const controller = new DictationController(transcriber, typer);
const settingsWindow = new SettingsWindow();
const overlayWindow = new OverlayWindow();
let menuBarTray: Tray | null = null;

app.on('second-instance', () => {
  settingsWindow.show();
});

app.whenReady().then(() => {
  // Hide dock/taskbar — this app lives entirely in the background.
  if (process.platform === 'darwin') app.dock?.hide();

  // Pre-create the overlay so it's ready on first shortcut press.
  overlayWindow.create();

  menuBarTray = createMenuBarTray(() => settingsWindow.show());

  // Wire IPC.
  registerIpcHandlers(store, controller);

  // Wire controller events → overlay.
  controller.on('stateChanged', (state, message) => {
    overlayWindow.setState(state, message);

    if (state === 'recording') {
      overlayWindow.showAndFollow();
    } else if (state === 'idle') {
      overlayWindow.hide();
    }
  });

  controller.on('requestRecord', () => overlayWindow.sendStart());
  controller.on('requestStopRecord', () => overlayWindow.sendStop());
  controller.on('requestCancelRecord', () => overlayWindow.sendCancel());

  // Register shortcuts from settings, re-register on change.
  applyShortcuts();
  store.on('change', applyShortcuts);
});

app.on('before-quit', () => {
  overlayWindow.destroy();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  menuBarTray?.destroy();
  menuBarTray = null;
});

// On macOS, prevent quit when all windows close (app lives in background).
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // On Windows/Linux, keep running unless explicitly quitting.
    // app.quit() would be called only via system tray (future) or OS session end.
  }
});

// ── Shortcut wiring ──────────────────────────────────────────────────────────
let shortcuts: ShortcutManager | null = null;

function applyShortcuts(): void {
  const { toggleShortcut, cancelShortcut } = store.value;

  if (!shortcuts) {
    shortcuts = new ShortcutManager({
      onToggle: () => controller.toggle(),
      onCancel: () => controller.cancel()
    });
  }

  shortcuts.apply({ toggle: toggleShortcut, cancel: cancelShortcut });
}
