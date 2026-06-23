# VentoType

Background dictation app for macOS and Windows. \
Supports OpenAI/OpenRouter-compatible transcription endpoints. \
Press the shortcut, speak, and your words appear wherever the cursor is. \
It has moden UI and doesn't clutter your dock.

## How it works

After configurations in settings:
- Press the **dictation shortcut** to start/finish dictation.
- Press the **cancel shortcut** to cancel dictation.
- After transcribing, VentoType will copy the text result into the clipboard, paste it, and restore the original clipboard content.

## Set up

### 1. Install dependencies

```bash
npm install
```

### 2a. Development

```bash
npm run dev
```

### 2b. Production build

```bash
# macOS
npm run dist:mac

# Windows
npm run dist:win
```

## Configure

Open Settings (by clicking the system tray icon), fill in:

- **Base URL** (e.g. `https://api.openai.com/v1`)
- **API key**
- **Model**
- **Language**
- **Shortcuts**

## macOS permissions

On first run, macOS will prompt for:

1. **Microphone**
2. **Accessibility** - required for the auto-paste
  (System Settings > Privacy & Security > Accessibility)

If auto-paste doesn't work, check the Accessibility permission for VentoType (or your terminal/Electron process during development).

## Tech stack

- Electron 31 + TypeScript
- electron-vite
- OpenAI-compatible `/audio/transcriptions` endpoint
- OS-native paste simulation (osascript on macOS, PowerShell SendKeys on Windows)

