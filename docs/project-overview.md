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
    transcriber.ts          — calls Whisper API with audio blob
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



## Key behaviours

- **Single instance** — second launch focuses the settings window
- **Dock hidden** — `app.dock?.hide()` on macOS; app lives entirely in tray
- **Recording overlay window** — `alwaysOnTop: 'floating'`, `visibleOnAllWorkspaces: true` so the mic indicator follows the cursor across macOS Spaces; `setIgnoreMouseEvents(true)` so it never steals focus
- **State machine** — `DictationController` emits `stateChanged`, `requestRecord`, `requestStopRecord`, `requestCancelRecord`
- **Cancel** — `cancelShortcut` discards the recording without transcribing
- **Quit guard** — overlay has `closable: false`; must call `overlayWindow.destroy()` before `app.quit()`



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

