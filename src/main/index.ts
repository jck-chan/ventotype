import { app, globalShortcut, type Tray } from 'electron';
import { IPC } from '@shared/ipc-channels';
import { log } from './services/logger';
import { requestPendingPermissions } from './services/permissions';
import { SettingsStore } from './services/settings-store';
import { FnHook } from './services/fn-hook';
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
const typer = new Typer(() => store.value);
const controller = new DictationController(transcriber, typer);
const fnHook = new FnHook();
const shortcuts = new ShortcutManager(
  {
    onToggle: () => controller.toggle(),
    onCancel: () => controller.cancel()
  },
  fnHook
);
const settingsWindow = new SettingsWindow(() => {
  syncFnHook();
  // Closing the window mid-capture would otherwise leave the shortcuts off.
  if (!settingsWindow.isOpen()) shortcuts.setSuspended(false);
});
const overlayWindow = new OverlayWindow();
let menuBarTray: Tray | null = null;

app.on('second-instance', () => {
  settingsWindow.show();
});

app.whenReady().then(() => {
  log.init();

  // Hide dock/taskbar — this app lives entirely in the background.
  if (process.platform === 'darwin') app.dock?.hide();

  // Pre-create the overlay so it's ready on first shortcut press.
  overlayWindow.create();

  menuBarTray = createMenuBarTray(() => settingsWindow.show());

  // Wire IPC.
  registerIpcHandlers(store, controller, transcriber, shortcuts);

  // Wire controller events → overlay.
  controller.on('stateChanged', (state, message) => {
    overlayWindow.setState(state, message);

    // Esc cancels for free, but only for as long as there's something to cancel.
    shortcuts.setDictationActive(state === 'recording' || state === 'transcribing');

    if (state === 'recording') {
      overlayWindow.showAndFollow();
    } else if (state === 'idle') {
      overlayWindow.hide();
    }
  });

  // Keep the Settings window's error banner live while it's open.
  controller.on('errorChanged', (error) => {
    settingsWindow.send(IPC.Dictation.LastErrorChanged, error);
  });

  controller.on('requestRecord', (options) => overlayWindow.sendStart(options));
  controller.on('requestStopRecord', () => overlayWindow.sendStop());
  controller.on('requestCancelRecord', () => overlayWindow.sendCancel());

  // Register shortcuts from settings, re-register on change.
  applyShortcuts();
  store.on('change', applyShortcuts);

  // Pressing fn in a shortcut field is how it gets bound, so the Settings window
  // hears the same events the ShortcutManager does.
  fnHook.on('shortcut', (accelerator) => {
    settingsWindow.send(IPC.Shortcuts.FnPressed, accelerator);
  });
  syncFnHook();

  // Prompt for anything never asked about before. Already-denied permissions are
  // left to the Settings window, which can explain them and link to System Settings.
  requestPendingPermissions().catch((err) => log.error('[permissions] startup check', err));
});

app.on('before-quit', () => {
  overlayWindow.destroy();
});

app.on('will-quit', () => {
  fnHook.stop();
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
function applyShortcuts(): void {
  const { toggleShortcut, cancelShortcut } = store.value;
  shortcuts.apply({ toggle: toggleShortcut, cancel: cancelShortcut });
  syncFnHook();
}

/**
 * The fn helper reads every keystroke through an event tap, so it only runs when
 * something actually needs it: an fn binding to listen for, or the Settings
 * window open and possibly about to capture one.
 */
function syncFnHook(): void {
  const bound = shortcuts.fnAccelerators();
  if (bound.length || settingsWindow.isOpen()) fnHook.start(bound);
  else fnHook.stop();
}
