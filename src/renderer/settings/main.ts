import { Settings } from '@shared/types';

declare global {
  interface Window {
    settingsAPI: {
      get: () => Promise<Settings>;
      set: (patch: Partial<Settings>) => Promise<Settings>;
    };
  }
}

// ── Elements ──────────────────────────────────────────────────────────────────
const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const fields = {
  baseURL:       $<HTMLInputElement>('baseURL'),
  apiKey:        $<HTMLInputElement>('apiKey'),
  model:         $<HTMLInputElement>('model'),
  language:      $<HTMLInputElement>('language'),
  toggleShortcut: $<HTMLInputElement>('toggleShortcut'),
  cancelShortcut: $<HTMLInputElement>('cancelShortcut')
};

const saveBtn    = $<HTMLButtonElement>('saveBtn');
const statusEl   = $<HTMLSpanElement>('status');
const revealBtn  = $<HTMLButtonElement>('revealKey');
const eyeShow    = $('eye-show');
const eyeHide    = $('eye-hide');

// ── Load ──────────────────────────────────────────────────────────────────────
async function load(): Promise<void> {
  try {
    const s = await window.settingsAPI.get();
    fields.baseURL.value       = s.baseURL       ?? '';
    fields.apiKey.value        = s.apiKey        ?? '';
    fields.model.value         = s.model         ?? '';
    fields.language.value      = s.language      ?? '';
    fields.toggleShortcut.value = s.toggleShortcut ?? '';
    fields.cancelShortcut.value = s.cancelShortcut ?? '';
  } catch (err) {
    showStatus('Failed to load settings.', 'err');
    console.error(err);
  }
}

// ── Save ──────────────────────────────────────────────────────────────────────
async function save(): Promise<void> {
  saveBtn.disabled = true;
  try {
    await window.settingsAPI.set({
      baseURL:       fields.baseURL.value.trim(),
      apiKey:        fields.apiKey.value.trim(),
      model:         fields.model.value.trim() || 'whisper-1',
      language:      fields.language.value.trim(),
      toggleShortcut: fields.toggleShortcut.value.trim(),
      cancelShortcut: fields.cancelShortcut.value.trim()
    });
    showStatus('Settings saved.', 'ok');
  } catch (err) {
    showStatus((err as Error).message ?? 'Failed to save.', 'err');
    console.error(err);
  } finally {
    saveBtn.disabled = false;
  }
}

// ── Status flash ──────────────────────────────────────────────────────────────
let statusTimer: ReturnType<typeof setTimeout> | null = null;

function showStatus(msg: string, type: 'ok' | 'err'): void {
  statusEl.textContent = msg;
  statusEl.className = `status-msg ${type}`;
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    statusEl.textContent = '';
    statusEl.className = 'status-msg';
  }, 3000);
}

// ── Reveal password toggle ────────────────────────────────────────────────────
revealBtn.addEventListener('click', () => {
  const isHidden = fields.apiKey.type === 'password';
  fields.apiKey.type = isHidden ? 'text' : 'password';
  eyeShow.classList.toggle('hidden', isHidden);
  eyeHide.classList.toggle('hidden', !isHidden);
});

// ── Shortcut capture ──────────────────────────────────────────────────────────
const MODIFIER_KEYS = new Set(['Control', 'Meta', 'Shift', 'Alt']);
let capturingField: HTMLInputElement | null = null;

function formatAccelerator(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey)  parts.push('Control');
  if (e.metaKey)  parts.push('Command');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey)   parts.push('Alt');

  const key = e.key;
  if (!MODIFIER_KEYS.has(key)) {
    // Electron accelerator format
    const mapped = KEY_MAP[key] ?? capitalize(key);
    parts.push(mapped);
  }

  return parts.join('+');
}

const KEY_MAP: Record<string, string> = {
  ' ':           'Space',
  'ArrowLeft':   'Left',
  'ArrowRight':  'Right',
  'ArrowUp':     'Up',
  'ArrowDown':   'Down',
  '.':           '.',
  ',':           ',',
  '/':           '/',
  ';':           ';',
  "'":           "'",
  '[':           '[',
  ']':           ']',
  '\\':          '\\',
  '-':           '-',
  '=':           '='
};

function capitalize(s: string): string {
  if (s.length === 1) return s.toUpperCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function startCapture(input: HTMLInputElement): void {
  if (capturingField) stopCapture(capturingField);
  capturingField = input;
  input.classList.add('capturing');
  input.placeholder = 'Press shortcut…';
}

function stopCapture(input: HTMLInputElement): void {
  input.classList.remove('capturing');
  input.placeholder = 'Click to record…';
  if (capturingField === input) capturingField = null;
}

for (const inputId of ['toggleShortcut', 'cancelShortcut'] as const) {
  const input = fields[inputId];

  input.addEventListener('click', () => {
    if (capturingField === input) stopCapture(input);
    else startCapture(input);
  });

  input.addEventListener('blur', () => stopCapture(input));
}

document.addEventListener('keydown', (e) => {
  if (!capturingField) return;
  e.preventDefault();
  e.stopPropagation();

  if (e.key === 'Escape') {
    stopCapture(capturingField);
    return;
  }

  // Only commit when a non-modifier key is pressed
  if (!MODIFIER_KEYS.has(e.key)) {
    const accel = formatAccelerator(e);
    if (accel) {
      capturingField.value = accel;
      stopCapture(capturingField);
    }
  }
});

// ── Clear buttons ─────────────────────────────────────────────────────────────
document.querySelectorAll<HTMLButtonElement>('.clear-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset['target'] as keyof typeof fields;
    if (targetId && fields[targetId]) {
      fields[targetId].value = '';
    }
  });
});

// ── Save button ───────────────────────────────────────────────────────────────
saveBtn.addEventListener('click', save);

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault();
    save();
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────
load();
