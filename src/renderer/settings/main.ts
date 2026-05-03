import { Settings } from '@shared/types';

declare global {
  interface Window {
    settingsAPI: {
      get: () => Promise<Settings>;
      set: (patch: Partial<Settings>) => Promise<Settings>;
      openLogFolder: () => Promise<void>;
      listModels: (baseURL: string, apiKey: string) => Promise<string[]>;
      getLoginItem: () => Promise<boolean>;
      setLoginItem: (enable: boolean) => Promise<void>;
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
  cancelShortcut: $<HTMLInputElement>('cancelShortcut'),
  warmUpOnRecord: $<HTMLInputElement>('warmUpOnRecord'),
  openAtLogin:   $<HTMLInputElement>('openAtLogin')
};

const saveBtn        = $<HTMLButtonElement>('saveBtn');
const statusEl       = $<HTMLSpanElement>('status');
const revealBtn      = $<HTMLButtonElement>('revealKey');
const eyeShow        = $('eye-show');
const eyeHide        = $('eye-hide');
const refreshModels  = $<HTMLButtonElement>('refreshModels');
const modelDropdown  = $<HTMLUListElement>('model-dropdown');
const refreshIcon    = $('refresh-icon');

// ── Load ──────────────────────────────────────────────────────────────────────
async function load(): Promise<void> {
  try {
    const [s, openAtLogin] = await Promise.all([
      window.settingsAPI.get(),
      window.settingsAPI.getLoginItem()
    ]);
    fields.baseURL.value        = s.baseURL        ?? '';
    fields.apiKey.value         = s.apiKey         ?? '';
    fields.model.value          = s.model          ?? '';
    fields.language.value       = s.language       ?? '';
    fields.toggleShortcut.value = s.toggleShortcut ?? '';
    fields.cancelShortcut.value = s.cancelShortcut ?? '';
    fields.warmUpOnRecord.checked = s.warmUpOnRecord ?? true;
    fields.openAtLogin.checked    = openAtLogin;
  } catch (err) {
    showStatus('Failed to load settings.', 'err');
    console.error(err);
  }
}

// ── Save ──────────────────────────────────────────────────────────────────────
async function save(): Promise<void> {
  saveBtn.disabled = true;
  try {
    await Promise.all([
      window.settingsAPI.set({
        baseURL:        fields.baseURL.value.trim(),
        apiKey:         fields.apiKey.value.trim(),
        model:          fields.model.value.trim() || 'whisper-1',
        language:       fields.language.value.trim(),
        toggleShortcut: fields.toggleShortcut.value.trim(),
        cancelShortcut: fields.cancelShortcut.value.trim(),
        warmUpOnRecord: fields.warmUpOnRecord.checked
      }),
      window.settingsAPI.setLoginItem(fields.openAtLogin.checked)
    ]);
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

// ── Model dropdown ────────────────────────────────────────────────────────────
let allModels: string[] = [];
let activeIdx = -1;

function renderDropdown(filter: string): void {
  const f = filter.toLowerCase();
  const matches = allModels.filter(m => m.toLowerCase().includes(f));

  modelDropdown.innerHTML = '';
  activeIdx = -1;

  if (matches.length === 0) { hideDropdown(); return; }

  for (const id of matches) {
    const li = document.createElement('li');
    li.className = 'model-option';
    li.textContent = id;
    li.addEventListener('mousedown', (e) => {
      e.preventDefault(); // keep focus on input
      fields.model.value = id;
      hideDropdown();
    });
    modelDropdown.appendChild(li);
  }

  modelDropdown.classList.add('open');
}

function hideDropdown(): void {
  modelDropdown.classList.remove('open');
  activeIdx = -1;
}

function moveActive(delta: number): void {
  const items = modelDropdown.querySelectorAll<HTMLLIElement>('.model-option');
  if (!items.length) return;
  activeIdx = Math.max(0, Math.min(activeIdx + delta, items.length - 1));
  items.forEach((el, i) => el.classList.toggle('active', i === activeIdx));
  items[activeIdx]?.scrollIntoView({ block: 'nearest' });
}

fields.model.addEventListener('focus', () => {
  if (allModels.length > 0) renderDropdown(fields.model.value);
  else fetchModels();
});

fields.model.addEventListener('blur', () => setTimeout(hideDropdown, 120));

fields.model.addEventListener('input', () => {
  if (allModels.length > 0) renderDropdown(fields.model.value);
});

fields.model.addEventListener('keydown', (e) => {
  if (!modelDropdown.classList.contains('open')) return;
  if (e.key === 'ArrowDown')  { e.preventDefault(); moveActive(+1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); moveActive(-1); }
  else if (e.key === 'Enter' && activeIdx >= 0) {
    e.preventDefault();
    const item = modelDropdown.querySelectorAll<HTMLLIElement>('.model-option')[activeIdx];
    if (item) { fields.model.value = item.textContent ?? ''; hideDropdown(); }
  } else if (e.key === 'Escape') hideDropdown();
});

async function fetchModels(): Promise<void> {
  const baseURL = fields.baseURL.value.trim();
  const apiKey  = fields.apiKey.value.trim();
  if (!baseURL) return;

  refreshIcon.classList.add('spinning');
  refreshModels.disabled = true;

  try {
    allModels = await window.settingsAPI.listModels(baseURL, apiKey);
    renderDropdown(fields.model.value);
  } catch {
    // silently ignore — user can still type manually
  } finally {
    refreshIcon.classList.remove('spinning');
    refreshModels.disabled = false;
  }
}

refreshModels.addEventListener('click', () => {
  allModels = [];
  fetchModels();
});

// ── Open log folder ───────────────────────────────────────────────────────────
$<HTMLButtonElement>('openLogFolder').addEventListener('click', () => {
  window.settingsAPI.openLogFolder();
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
