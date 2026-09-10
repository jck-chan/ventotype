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
  user-data/
    migrations/             — versioned, sequential on-disk schema migrations.
                              001 is a permanent no-op: USER_DATA_VERSION was set
                              to 1, and manifests started being written at that
                              version, before any real migration existed — so
                              every migration lands at version ≥ 2, never 1.
    runner.ts               — brings userData up to USER_DATA_VERSION on launch
    infer-version.ts        — version of on-disk data with no manifest yet

src/preload/                — contextBridge exposures for overlay and settings
src/renderer/
  overlay/                  — animated mic icon shown while recording
  settings/                 — settings UI, incl. the Playground tab (playground.ts)
  shared/                   — browser-only helpers shared by overlay + settings
                              (audio.ts: WAV re-encode, recorder mime-type pick)
src/shared/
  types.ts                  — Settings, DictationState, DEFAULT_SETTINGS
  ipc-channels.ts           — typed IPC channel names
```



## Connection types

A profile's `type` decides how the audio is sent. All three are configured the same way
(base URL, API key, model, language, prompt) — only the request shape, and what "prompt"
means, differs.

| Type | Endpoint | Request | Notes |
| --- | --- | --- | --- |
| `openai-transcribe` | `/audio/transcriptions` | multipart form-data | OpenAI, Groq, local Whisper servers |
| `openrouter-transcribe` | `/audio/transcriptions` | JSON, base64 `input_audio` | OpenRouter rejects multipart |
| `openai-chat` | `/chat/completions` | JSON, base64 `input_audio` content part | Multimodal chat models |

`openai-chat` exists for models that transcribe well but ship no transcription route —
Gemini being the motivating case. The request is two messages: a system message holding the
transcription rules, then a user turn whose content parts are a short instruction and the
base64 audio. The transcript comes back as `choices[0].message.content`. The rules are the
profile's **Prompt** field (`DEFAULT_TRANSCRIPTION_PROMPT` when empty), and since chat has
no `language` parameter, the profile's language is appended to them instead.

The user turn is the profile's **Execution message** field (`DEFAULT_CHAT_EXECUTION_MESSAGE`, "Please
output the result.", when empty). It exists because a system prompt reads as background
rules to most models — plenty won't carry out a task stated only there — so the cue to
produce the transcript now has to arrive in the human turn. See `transcriptionPrompt()` and
`chatExecutionMessage()` in `transcriber.ts`. The field is hidden for the Whisper-style types,
which have no chat turn to put it in.

Chat models tend to frame their answer ("Sure, here's the transcript:", a code fence), so the
built-in prompt asks for the transcript between two `<|t|>` tags and `extractTranscript()` in
`transcriber.ts` keeps only what's between them. A reply without both tags (a custom prompt, or
a model that ignored them) is used whole, so nothing breaks without them. It sits inside
`chatText()`, so the dictation path and the Playground both show the parsed transcript — the
Playground's Raw JSON still shows the untouched reply.

The Prompt field carries a copy button on its label row (`copyPrompt` in `profiles.ts`),
which copies `effectivePrompt()` — the typed text, or the built-in prompt a chat profile
would fall back to. It's disabled on the Whisper-style types while the field is empty,
since those send nothing at all then.

The `openai-transcribe` and `openrouter-transcribe` types also send **Prompt**, but as Whisper's own `prompt`
parameter — a vocabulary/style bias (proper nouns, acronyms, a continuation cue), not an
instruction. Unlike the chat type, an empty field sends nothing; there's no
`DEFAULT_TRANSCRIPTION_PROMPT`-style fallback, since a keyword hint has no sensible default.
See `whisperPrompt()` vs `transcriptionPrompt()` in `transcriber.ts`.

Chat Completions only accepts `wav`/`mp3` in `input_audio` (both OpenAI and Gemini), so
for these profiles the overlay renderer re-encodes its WebM/Opus take as 16 kHz mono WAV
via Web Audio before handing it to main — see `requiresWavAudio()` and the `RecordOptions`
passed with `dictation:start`. The Whisper-style types keep shipping WebM untouched.

## Playground tab

A Settings tab for testing a profile's request/response directly, without going through
the global-shortcut dictation flow. Source: `src/renderer/settings/playground.ts`.

- **Audio source** — record in-app (MediaRecorder, same mic-capture path as the overlay)
  or drop/browse an existing audio file.
- **Profile picker** — a plain `<select>` over the saved profile list (not the in-progress
  edits on the Profiles tab — switch tabs and Save first to test unsaved changes).
- **Send** — `Transcriber.transcribeInspect()` (`src/main/services/transcriber.ts`) runs
  the request against the chosen profile and, unlike the production `transcribe()` path,
  never throws for a non-2xx reply — `PlaygroundTranscribeResult` carries `ok`/`status`/
  `raw` either way, since inspecting exactly what the server sent back is the point.
- **Raw JSON** — the response body, pretty-printed in a dialog, with a Copy button.
- IPC: `playground:transcribe` (`IPC.Playground.Transcribe`), handled in `src/main/ipc.ts`
  by looking up the chosen profile from `SettingsStore` and delegating to the transcriber.

## Key behaviours

- **Single instance** — second launch focuses the settings window
- **Dock hidden** — `app.dock?.hide()` on macOS; app lives entirely in tray
- **Recording overlay window** — `alwaysOnTop: 'floating'`, `visibleOnAllWorkspaces: true` so the mic indicator follows the cursor across macOS Spaces; `setIgnoreMouseEvents(true)` so it never steals focus
- **State machine** — `DictationController` emits `stateChanged`, `requestRecord`, `requestStopRecord`, `requestCancelRecord`
- **fn shortcuts** — `globalShortcut` can't express them: macOS hot-keys are Carbon `RegisterEventHotKey`, which has no fn modifier. `native/fn-hook.swift` (built to `resources/fn-hook.dylib` by `scripts/build-fn-hook.mjs`, shipped via `extraResources`) watches fn through a `CGEventTap` and queues each accelerator it sees. `FnHook` loads it with koffi and drains that queue on a 25 ms timer — **in this process, not a spawned helper**: a tap needs Accessibility, macOS grants that per program, and a child process is a different program to TCC, so a helper binary is denied even though the app itself is trusted. The tap runs on its own thread inside the library, and events are polled rather than pushed because calling into Node from a foreign thread isn't safe; `ShortcutManager` routes bindings matching `isFnShortcut()` there instead of to Electron, and they also reach the Settings window over `IPC.Shortcuts.FnPressed` — the only way a shortcut field can capture a key the renderer never receives. The bound accelerators are passed to the helper as argv (`ShortcutManager.fnAccelerators()`), and changing them respawns it. The tap is an active one at the HID level (`kCGHIDEventTap`, head-insert, `kCGEventTapOptionDefault`, keyDown/keyUp/flagsChanged, plus `NX_SYSDEFINED` so media keys count). fn itself is tracked by the `maskSecondaryFn` flag, not by keycode. A solo fn tap emits four events: the flag going on and off (keycode 63), then a key press of **keycode 179**, the Globe key — which is the one "Press 🌐 to:" acts on, and which never appears when fn was held with something else. So a bound `Fn` swallows keycode 179 and nothing else: the flag keeps flowing, fn stays a working modifier for fn+arrows and the rest, and the input source stops switching. A bound `Fn+key` swallows that key instead, so its character isn't typed. Anything pressed while fn is held cancels the plain-Fn tap, media keys included: on a keyboard set to standard function keys fn+F11 is volume-down, and it arrives as a system-defined event rather than a `keyDown`, so the tap has to watch for those too or the fn release reads as a solo tap
- **No extra permission** — the tap is an active one (it swallows bound keys), and active taps run on Accessibility, which the app already holds in order to type. A *listen-only* tap would instead need Input Monitoring, and would be created happily while denied and then never fire; an active one simply fails at `tapCreate`, so the helper needs no permission probing of its own
- **Typing** — the transcript is posted as synthetic key events, so the clipboard is only touched when `copyToClipboard` is on (off by default; the toggle is under Settings → Behaviour). Both platforms let an event carry a unicode character in place of a keycode, which is what makes arbitrary text (CJK included) possible without keycode mapping. macOS: `CGEventKeyboardSetUnicodeString` via `native/typer.swift`, loaded with koffi like the fn tap, in runs of 20 UTF-16 units because the system truncates longer ones, flags cleared so a modifier still held from the shortcut can't alter the text. Windows: `SendInput` with `KEYEVENTF_UNICODE` called straight out of `user32.dll` through koffi — no native code of our own, the `INPUT` struct is declared in `typer.ts` (its tail padding is what makes `cbSize` come out at 40 on x64). Linux keeps clipboard-and-paste: `XTest` only works under X11 and Wayland blocks synthetic input outright, which no input library gets around either — there the clipboard is used either way, so `copyToClipboard` decides whether the previous contents are put back once the paste has landed (a failed paste keeps the transcript, since it's then the only copy left)
- **Cancel** — `cancelShortcut` discards the recording without transcribing, and while the state is `transcribing` it aborts the request in flight (an `AbortController` per call in `handleAudio`, its signal passed down to `fetch`). An aborted request is not a failure: the catch returns quietly, so nothing lands in `lastError`. Typing isn't cancellable — the paste is already going into the focused app
- **Quit guard** — overlay has `closable: false`; must call `overlayWindow.destroy()` before `app.quit()`
- **Profile picker** — a custom listbox, not a `<select>`, so each row can carry a drag handle plus its own rename/delete buttons (`rowAction()` in `profiles.ts`), which act on the row you point at rather than the active profile. Dragging reorders the `profiles` array (the DOM leads during the drag, the array is resynced on `dragend`) and marks the form dirty, so the new order lands on Save — same as adding or deleting a profile. The active row is marked by its accent tint alone, so row hover uses a neutral background



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

