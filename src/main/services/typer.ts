import { clipboard } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

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

    try {
      clipboard.writeText(text);
      // Give the OS a moment to register the clipboard change before pasting.
      await delay(40);
      await sendPaste();
      // Let the paste consume the clipboard before we restore it.
      await delay(120);
    } finally {
      if (prevHtml) {
        clipboard.write({ text: prevText, html: prevHtml });
      } else {
        clipboard.writeText(prevText);
      }
    }
  }
}

async function sendPaste(): Promise<void> {
  if (process.platform === 'darwin') {
    await execFileAsync('osascript', [
      '-e',
      'tell application "System Events" to keystroke "v" using command down'
    ]);
    return;
  }

  if (process.platform === 'win32') {
    await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-Command',
      "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')"
    ]);
    return;
  }

  // Linux fallback via xdotool if available.
  try {
    await execFileAsync('xdotool', ['key', '--clearmodifiers', 'ctrl+v']);
  } catch (err) {
    throw new Error(
      `Auto-typing not supported on ${process.platform}: ${(err as Error).message}`
    );
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
