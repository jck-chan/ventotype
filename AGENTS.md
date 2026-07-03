# Agent Instructions

- Read docs folder for project overviews.
- Prefer the existing Electron + TypeScript patterns in `src/main`, `src/preload`, `src/renderer`, and `src/shared`.
- Keep VentoType menu-bar first on macOS: no dock icon, overlay windows must not steal focus, and quit flow must destroy the overlay before app quit.
