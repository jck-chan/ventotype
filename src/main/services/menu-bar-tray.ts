import { Menu, Tray, app, nativeImage } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const TRAY_ICON_FILE = 'tray-icon.png';

/** Electron docs: ~22×22 on macOS, 16×16 on Windows/Linux (including margin). */
function trayIconMaxPx(): number {
  return process.platform === 'darwin' ? 22 : 22;
}

function normalizeTrayIcon(img: Electron.NativeImage): Electron.NativeImage {
  if (img.isEmpty()) return img;
  const { width, height } = img.getSize();
  const maxPx = trayIconMaxPx();
  const maxDim = Math.max(width, height);
  if (maxDim <= maxPx) return img;
  const scale = maxPx / maxDim;
  return img.resize({
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  });
}

function trayIconPathCandidates(): string[] {
  return [
    join(app.getAppPath(), 'resources', TRAY_ICON_FILE),
    join(process.cwd(), 'resources', TRAY_ICON_FILE),
    join(__dirname, '../../resources', TRAY_ICON_FILE),
    join(__dirname, '../resources', TRAY_ICON_FILE)
  ];
}

function loadTrayIcon(): Electron.NativeImage {
  for (const p of trayIconPathCandidates()) {
    if (!existsSync(p)) continue;
    let img = nativeImage.createFromPath(p);
    if (img.isEmpty()) continue;
    img = normalizeTrayIcon(img);
    // Do not call setTemplateImage: that mode is for monochrome “template” PNGs (black on
    // transparent). Full-color artwork (e.g. white + teal) would collapse to a single mask
    // and colors like the “V” would not appear.
    return img;
  }
  throw new Error(
    `VentoType: tray icon not found (resources/${TRAY_ICON_FILE}). Tried:\n${trayIconPathCandidates().join('\n')}`
  );
}

/**
 * macOS menu bar (or Windows/Linux notification area) tray with Settings + Quit.
 */
export function createMenuBarTray(openSettings: () => void): Tray {
  const tray = new Tray(loadTrayIcon());
  tray.setToolTip('VentoType');
  const menu = Menu.buildFromTemplate([
    { label: 'Settings…', click: () => openSettings() },
    { type: 'separator' },
    { label: 'Quit VentoType', click: () => app.quit() }
  ]);
  tray.setContextMenu(menu);
  return tray;
}
