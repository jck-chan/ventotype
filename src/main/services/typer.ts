import { app, clipboard } from 'electron';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import koffi from 'koffi';

const execFileAsync = promisify(execFile);

// How long to wait for the OS to reflect our clipboard write before pasting.
const CLIPBOARD_WRITE_TIMEOUT_MS = 500;

/**
 * Types transcribed text at the cursor.
 *
 * On macOS the text rides in on synthetic key events, so the clipboard is never
 * touched — see `native/typer.swift`. Elsewhere it goes via the clipboard and a
 * paste keystroke, which is the only route those platforms give us; the
 * transcript is left on the clipboard there.
 */
export class Typer {
  async type(text: string): Promise<void> {
    if (!text) return;

    if (process.platform === 'darwin') {
      typeText(text);
      return;
    }

    clipboard.writeText(text);
    // Wait until the OS actually reflects our write before pasting, so the
    // paste can never fire against stale clipboard contents.
    await waitForClipboardText(text, CLIPBOARD_WRITE_TIMEOUT_MS);
    await sendPaste();
  }
}

let typeText_: ((text: string) => void) | null = null;

/** Posts the text as key events. Loaded on first use and kept for the session. */
function typeText(text: string): void {
  if (!typeText_) {
    const path = app.isPackaged
      ? join(process.resourcesPath, 'typer.dylib')
      : join(app.getAppPath(), 'resources/typer.dylib');
    typeText_ = koffi.load(path).func('void type_text(const char *text)') as (t: string) => void;
  }
  typeText_(text);
}

// Seconds the synthetic-paste command sleeps *after* posting the keystroke.
// The key events are delivered up front, so the focused app processes the
// paste while the command sleeps — meaning the command only returns once the
// app has actually had time to read the clipboard.
const SETTLE_SECONDS = 0.12;

async function sendPaste(): Promise<void> {
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
