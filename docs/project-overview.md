# VentoType

Electron + TypeScript dictation app (macOS-first). Lives in the menu bar — no dock icon. Uses a global shortcut to start/stop recording, sends audio to a Whisper-compatible API, then types the result into the focused app.

## Stack

- **Electron** with `electron-vite` (builds to `out/`)
- **TypeScript** throughout — `src/main`, `src/preload`, `src/renderer`, `src/shared`
- **No UI framework** — vanilla TS/CSS for both overlay and settings windows

## Architecture

```
src/main/
  index.ts                  — app entry, wires everything together
  ipc.ts                    — IPC handler registration
  windows/
    overlay-window.ts       — floating cursor-following dictation icon (52×52, transparent)
    settings-window.ts      — settings panel
  services/
    dictation-controller.ts — state machine: idle → recording → transcribing → typing → idle
    shortcuts.ts            — global shortcut registration/unregistration
    transcriber.ts          — sends the audio to the active profile's endpoint
    typer.ts                — types transcribed text into focused app
    settings-store.ts       — persists settings (electron-store)
    menu-bar-tray.ts        — tray icon + context menu (Settings / Quit)

src/preload/                — contextBridge exposures for overlay and settings
src/renderer/
  overlay/                  — animated mic icon shown while recording
  settings/                 — settings UI
src/shared/
  types.ts                  — Settings, DictationState, DEFAULT_SETTINGS
  ipc-channels.ts           — typed IPC channel names
```



## Connection types

A profile's `type` decides how the audio is sent. All three are configured the same way
(base URL, API key, model, language) — only the request shape differs.

| Type | Endpoint | Request | Notes |
| --- | --- | --- | --- |
| `openai` | `/audio/transcriptions` | multipart form-data | OpenAI, Groq, local Whisper servers |
| `openrouter` | `/audio/transcriptions` | JSON, base64 `input_audio` | OpenRouter rejects multipart |
| `openai-chat` | `/chat/completions` | JSON, base64 `input_audio` content part | Multimodal chat models |

`openai-chat` exists for models that transcribe well but ship no transcription route —
Gemini being the motivating case. The audio goes in as one content part of a normal user
turn, next to a text part telling the model to transcribe; the transcript comes back as
`choices[0].message.content`. That instruction is the profile's **Prompt** field
(`DEFAULT_TRANSCRIPTION_PROMPT` when empty), and since chat has no `language` parameter,
the profile's language is appended to the prompt instead.

Chat Completions only accepts `wav`/`mp3` in `input_audio` (both OpenAI and Gemini), so
for these profiles the overlay renderer re-encodes its WebM/Opus take as 16 kHz mono WAV
via Web Audio before handing it to main — see `requiresWavAudio()` and the `RecordOptions`
passed with `dictation:start`. The Whisper-style types keep shipping WebM untouched.

## Key behaviours

- **Single instance** — second launch focuses the settings window
- **Dock hidden** — `app.dock?.hide()` on macOS; app lives entirely in tray
- **Recording overlay window** — `alwaysOnTop: 'floating'`, `visibleOnAllWorkspaces: true` so the mic indicator follows the cursor across macOS Spaces; `setIgnoreMouseEvents(true)` so it never steals focus
- **State machine** — `DictationController` emits `stateChanged`, `requestRecord`, `requestStopRecord`, `requestCancelRecord`
- **Cancel** — `cancelShortcut` discards the recording without transcribing
- **Quit guard** — overlay has `closable: false`; must call `overlayWindow.destroy()` before `app.quit()`
- **Profile picker** — a custom listbox, not a `<select>`, so each row can carry a drag handle. Dragging reorders the `profiles` array (the DOM leads during the drag, the array is resynced on `dragend`) and marks the form dirty, so the new order lands on Save — same as adding or deleting a profile



## Dev

```bash
npm run dev       # electron-vite dev server
npm run dist:mac  # macos build
npm run dist:win  # windows build
npm run preview   # run built app
```



## Resources

- `resources/icon.png` — dock/app icon
- `resources/icon-tray.png` — menu bar tray icon (~22×22 on macOS)

