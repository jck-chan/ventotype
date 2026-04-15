# VentoType

Background dictation app for macOS and Windows. Press a global shortcut, speak, and your words appear wherever the cursor is — powered by any OpenAI-compatible Whisper endpoint.

## How it works


| State        | Overlay icon           |
| ------------ | ---------------------- |
| Recording    | Pulsing red dot        |
| Transcribing | Spinning purple loader |
| Typing       | Green keyboard         |
| Error        | Red exclamation        |


Pressing the **toggle shortcut** starts recording, or — while recording — **stops** and sends audio to Whisper for transcription. The **cancel shortcut** **discards** the current take (no transcription, no paste) and returns to idle.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Development

```bash
npm run dev
```

Double-click the app icon (or run `npm run dev`, then activate with the shortcut) to open Settings.

### 3. Production build

```bash
# macOS
npm run dist:mac

# Windows
npm run dist:win
```

### 4. Configure

Open Settings (launch the app while it's already running), fill in:

- **Base URL** — e.g. `https://api.openai.com/v1` or your local server
- **API key** — your OpenAI or compatible key
- **Model** — default `whisper-1`
- **Language** — leave blank for auto-detect (e.g. `zh` for Chinese)
- **Shortcuts** — click the field, press your combo

## macOS permissions

On first run, macOS will prompt for:

1. **Microphone** — required for recording.
2. **Accessibility** — required for the auto-paste (simulated Cmd+V). Grant it in *System Settings → Privacy & Security → Accessibility*.

If auto-paste doesn't work, check the Accessibility permission for VentoType (or your terminal/Electron process during development).

## Typing approach

VentoType saves your clipboard, writes the transcript to it, simulates a paste keystroke (Cmd+V / Ctrl+V via OS-native tools), then restores your original clipboard. This works correctly for any language — Chinese, Japanese, Arabic, etc. — without needing to switch keyboard input method.

## No dock / taskbar icon

VentoType runs silently in the background. To open Settings:

- **Launch the app again** while it's already running (double-click the .app/.exe).
- During development: the Settings window opens automatically on `npm run dev`.

## Tech stack

- Electron 31 + TypeScript
- electron-vite
- OpenAI-compatible `/audio/transcriptions` endpoint
- OS-native paste simulation (osascript on macOS, PowerShell SendKeys on Windows)

