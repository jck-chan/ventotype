import { DictationError } from '@shared/types';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const banner = $('lastError');
const messageEl = $('lastErrorMessage');
const timeEl = $('lastErrorTime');
const dismissBtn = $<HTMLButtonElement>('dismissLastError');

/** Kept so the "how long ago" label can be refreshed without another IPC round-trip. */
let current: DictationError | null = null;

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

function formatAge(at: number): string {
  const seconds = Math.round((at - Date.now()) / 1000); // negative — in the past
  const abs = Math.abs(seconds);

  if (abs < 60) return 'just now';
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return relative.format(Math.round(seconds / 3600), 'hour');
  return relative.format(Math.round(seconds / 86_400), 'day');
}

function render(): void {
  if (!current) {
    banner.hidden = true;
    return;
  }
  messageEl.textContent = current.message;
  timeEl.textContent = formatAge(current.at);
  banner.hidden = false;
}

/** Replaces whatever is shown. A fresh error re-opens a dismissed banner. */
export function showLastError(error: DictationError | null): void {
  current = error;
  render();
}

export function initLastError(): void {
  // Dismiss forgets the error in the main process too, so reopening Settings
  // doesn't resurrect a banner the user has already acknowledged.
  dismissBtn.addEventListener('click', () => {
    showLastError(null);
    window.settingsAPI
      .dismissLastError()
      .catch((err) => console.error('[last-error] dismiss failed', err));
  });

  window.settingsAPI
    .getLastError()
    .then(showLastError)
    .catch((err) => console.error('[last-error] initial fetch failed', err));

  window.settingsAPI.onLastErrorChanged((error) => showLastError(error));

  // Keep the relative timestamp honest while the window sits open.
  setInterval(() => {
    if (current && !banner.hidden) timeEl.textContent = formatAge(current.at);
  }, 30_000);
}
