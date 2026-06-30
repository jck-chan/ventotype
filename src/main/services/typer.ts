import { clipboard } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Extra margin (ms) kept after the paste is dispatched before we restore the
// user's previous clipboard. The bulk of the settle happens inside sendPaste()
// (see SETTLE_SECONDS); this just adds a little headroom on top.
const RESTORE_MARGIN_MS = 80;
// How long to wait for the OS to reflect our clipboard write before pasting.
const CLIPBOARD_WRITE_TIMEOUT_MS = 500;

/**
 * Types arbitrary unicode text at the current cursor location by briefly
 * using the clipboard and dispatching a paste shortcut via OS-native tools.
 * Preserves the user's existing clipboard contents.
 */
export class Typer {
  async type(text: string): Promise<void> {
    if (!text) return;

    const prevText = clipboard.readText();
    const prevHtml = clipboard.readHTML();

    clipboard.writeText(text);
    // Wait until the OS actually reflects our write before pasting, so the
    // paste can never fire against stale clipboard contents.
    await waitForClipboardText(text, CLIPBOARD_WRITE_TIMEOUT_MS);

    try {
      // sendPaste() only resolves after the focused app has had a window to
      // consume the clipboard (the settle delay lives inside the OS command),
      // so the restore below can't race ahead of the paste.
      await sendPaste();
      await delay(RESTORE_MARGIN_MS);
    } finally {
      // Don't clobber the clipboard if the user copied something else while we
      // were pasting — only restore when our injected text is still present.
      if (clipboard.readText() === text) {
        if (prevHtml) {
          clipboard.write({ text: prevText, html: prevHtml });
        } else {
          clipboard.writeText(prevText);
        }
      }
    }
  }
}

// Seconds the synthetic-paste command sleeps *after* posting the keystroke.
// The key events are delivered up front, so the focused app processes the
// paste while the command sleeps — meaning the command only returns once the
// app has actually had time to read the clipboard.
const SETTLE_SECONDS = 0.12;

async function sendPaste(): Promise<void> {
  if (process.platform === 'darwin') {
    await execFileAsync('osascript', [
      '-e',
      'tell application "System Events" to keystroke "v" using command down',
      '-e',
      `delay ${SETTLE_SECONDS}`
    ]);
    return;
  }

  if (process.platform === 'win32') {
    await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-Command',
      "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v'); Start-Sleep -Milliseconds " +
        Math.round(SETTLE_SECONDS * 1000)
    ]);
    return;
  }

  // Linux fallback via xdotool if available.
  try {
    await execFileAsync('xdotool', [
      'key',
      '--clearmodifiers',
      'ctrl+v'
    ]);
    await delay(SETTLE_SECONDS * 1000);
  } catch (err) {
    throw new Error(
      `Auto-typing not supported on ${process.platform}: ${(err as Error).message}`
    );
  }
}

/** Polls until the clipboard text matches `text`, or the timeout elapses. */
async function waitForClipboardText(text: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (clipboard.readText() !== text) {
    if (Date.now() - start >= timeoutMs) return;
    await delay(10);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
