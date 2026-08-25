# VentoType

Background dictation app for macOS and Windows; lives in your system tray/menu bar.
Supports OpenAI-like transcribe/chat-completions endpoints and OpenRouter transcribe endpoints.
Press the customizable shortcut to start dictation.

## How it works

After configuration in settings:

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
# you might need to run `xattr -dr com.apple.quarantine dist/mac-arm64/VentoType.app`

# Windows
npm run dist:win
```

## Configure

Open Settings (by clicking the system tray icon), fill in:

- **Endpoint type** — see below
- **Base URL** (e.g. `https://api.openai.com/v1`)
- **API key**
- **Model**
- **Language**
- **Shortcuts**

### Endpoint types

- **OpenAI (Transcribe)** — `/audio/transcriptions` (OpenAI, Groq, local Whisper servers)
- **OpenRouter (Transcribe)** — same route, base64 JSON body
- **OpenAI (Chat Completions)** — `/chat/completions`, for multimodal models
that transcribe well but have no transcription route

All three types have a **Prompt** field, but it means something different per type. For the  
chat type, the audio is sent as part of a normal chat message with an instruction to  
transcribe it — the field customises that instruction; leave it empty for the built-in one.  
For the two Whisper-style types, it's Whisper's own `prompt` parameter — a vocabulary/style  
hint (proper nouns, acronyms, jargon likely to appear), not an instruction — so leaving it  
empty sends nothing, with no built-in default.

### Playground

The **Playground** tab lets you test a profile without leaving Settings: record in-app
or drop in an audio file, pick which saved profile to send it to, and inspect the
transcript alongside the raw JSON the server returned (handy for debugging a
misbehaving endpoint).

## macOS permissions

On first run, macOS will prompt for:

1. **Microphone**
2. **Accessibility** - required for the auto-paste
  (System Settings > Privacy & Security > Accessibility)

If auto-paste doesn't work, check the Accessibility permission for VentoType (or your terminal/Electron process during development).