import { app, clipboard } from 'electron';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import koffi from 'koffi';
import { Settings } from '@shared/types';

const execFileAsync = promisify(execFile);

/**
 * Types transcribed text at the cursor.
 *
 * macOS and Windows both let a synthetic key event carry a unicode character
 * instead of a keycode, so the text goes straight in and the clipboard is only
 * involved if `copyToClipboard` asks for it. Linux has no equivalent that
 * survives Wayland, so it keeps the clipboard-and-paste route — there the
 * setting decides whether what was on the clipboard is put back afterwards.
 */
export class Typer {
  constructor(private readonly getSettings: () => Settings) {}

  async type(text: string): Promise<void> {
    if (!text) return;
    const { copyToClipboard } = this.getSettings();

    switch (process.platform) {
      case 'darwin':
        if (copyToClipboard) clipboard.writeText(text);
        typeMac(text);
        return;
      case 'win32':
        if (copyToClipboard) clipboard.writeText(text);
        typeWindows(text);
        return;
      default:
        await pasteViaClipboard(text, copyToClipboard);
    }
  }
}

// ── macOS ────────────────────────────────────────────────────────────────────
// CGEventKeyboardSetUnicodeString, wrapped by native/typer.swift. Loaded in
// this process because posting events needs the app's own Accessibility grant.

let macTypeText: ((text: string) => void) | null = null;

function typeMac(text: string): void {
  if (!macTypeText) {
    const path = app.isPackaged
      ? join(process.resourcesPath, 'typer.dylib')
      : join(app.getAppPath(), 'resources/typer.dylib');
    macTypeText = koffi.load(path).func('void type_text(const char *text)') as (t: string) => void;
  }
  macTypeText(text);
}

// ── Windows ──────────────────────────────────────────────────────────────────
// SendInput with KEYEVENTF_UNICODE: wScan carries the UTF-16 unit and wVk stays
// zero, so the character arrives whatever the keyboard layout is. Surrogate
// pairs work because both units go in the same call, in order.

const KEYEVENTF_KEYUP = 0x0002;
const KEYEVENTF_UNICODE = 0x0004;
const INPUT_KEYBOARD = 1;

type SendInput = (count: number, inputs: unknown[], size: number) => number;

let sendInput: SendInput | null = null;
let inputSize = 0;

function typeWindows(text: string): void {
  if (!sendInput) {
    const KEYBDINPUT = koffi.struct('KEYBDINPUT', {
      wVk: 'uint16',
      wScan: 'uint16',
      dwFlags: 'uint32',
      time: 'uint32',
      dwExtraInfo: 'uintptr'
    });
    // INPUT is a union whose largest member is the mouse one, so the tail
    // padding is what makes cbSize come out right.
    const INPUT = koffi.struct('INPUT', {
      type: 'uint32',
      ki: KEYBDINPUT,
      padding: koffi.array('uint8', 8)
    });
    inputSize = koffi.sizeof(INPUT);
    sendInput = koffi
      .load('user32.dll')
      .func('uint32 __stdcall SendInput(uint32 cInputs, INPUT *pInputs, int cbSize)') as unknown as SendInput;
  }

  const inputs = [];
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    for (const flags of [KEYEVENTF_UNICODE, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP]) {
      inputs.push({
        type: INPUT_KEYBOARD,
        ki: { wVk: 0, wScan: unit, dwFlags: flags, time: 0, dwExtraInfo: 0 },
        padding: []
      });
    }
  }

  sendInput!(inputs.length, inputs, inputSize);
}

// ── Linux ────────────────────────────────────────────────────────────────────

// How long to wait for the OS to reflect our clipboard write before pasting.
const CLIPBOARD_WRITE_TIMEOUT_MS = 500;
// Seconds the synthetic-paste command sleeps *after* posting the keystroke, so
// the focused app has read the clipboard before the command returns.
const SETTLE_SECONDS = 0.12;

async function pasteViaClipboard(text: string, keepOnClipboard: boolean): Promise<void> {
  const previous = keepOnClipboard ? null : clipboard.readText();
  clipboard.writeText(text);
  // Wait until the OS actually reflects our write before pasting, so the paste
  // can never fire against stale clipboard contents.
  await waitForClipboardText(text, CLIPBOARD_WRITE_TIMEOUT_MS);

  try {
    await execFileAsync('xdotool', ['key', '--clearmodifiers', 'ctrl+v']);
    await delay(SETTLE_SECONDS * 1000);
    // Only once the paste has landed, and only on success: if it failed, the
    // transcript on the clipboard is the user's one remaining copy of it.
    if (previous !== null) clipboard.writeText(previous);
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
