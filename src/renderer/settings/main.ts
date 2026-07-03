import {
  ConnectionProfile,
  DEFAULT_PROFILE,
  EndpointType,
  ENDPOINT_DEFAULTS,
  Settings
} from '@shared/types';

declare global {
  interface Window {
    settingsAPI: {
      get: () => Promise<Settings>;
      set: (patch: Partial<Settings>) => Promise<Settings>;
      openLogFile: () => Promise<void>;
      openSettingsFile: () => Promise<void>;
      listModels: (baseURL: string, apiKey: string, type: EndpointType) => Promise<string[]>;
      getLoginItem: () => Promise<boolean>;
      setLoginItem: (enable: boolean) => Promise<void>;
    };
  }
}

// ── Elements ──────────────────────────────────────────────────────────────────
const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const fields = {
  profileName:   $<HTMLInputElement>('profileName'),
  endpointType:  $<HTMLSelectElement>('endpointType'),
  baseURL:       $<HTMLInputElement>('baseURL'),
  apiKey:        $<HTMLInputElement>('apiKey'),
  model:         $<HTMLInputElement>('model'),
  language:      $<HTMLInputElement>('language'),
  toggleShortcut: $<HTMLInputElement>('toggleShortcut'),
  cancelShortcut: $<HTMLInputElement>('cancelShortcut'),
  warmUpOnRecord: $<HTMLInputElement>('warmUpOnRecord'),
  openAtLogin:   $<HTMLInputElement>('openAtLogin')
};

const profileSelect  = $<HTMLSelectElement>('profileSelect');
const addProfileBtn  = $<HTMLButtonElement>('addProfile');
const delProfileBtn  = $<HTMLButtonElement>('deleteProfile');

const saveBtn        = $<HTMLButtonElement>('saveBtn');
const statusEl       = $<HTMLSpanElement>('status');
const revealBtn      = $<HTMLButtonElement>('revealKey');
const eyeShow        = $('eye-show');
const eyeHide        = $('eye-hide');
const refreshModels  = $<HTMLButtonElement>('refreshModels');
const modelDropdown  = $<HTMLUListElement>('model-dropdown');
const refreshIcon    = $('refresh-icon');

// ── Profiles state ──────────────────────────────────────────────────────────
// Profiles are held in memory; the form always reflects the active one. Edits
// are flushed into the active profile object before switching/adding/saving.
let profiles: ConnectionProfile[] = [];
let activeId = '';

const genId = (): string =>
  `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

function getActive(): ConnectionProfile {
  return profiles.find((p) => p.id === activeId) ?? profiles[0];
}

/** Flush the endpoint form fields back into the active profile object. */
function syncFormToActive(): void {
  const p = getActive();
  if (!p) return;
  p.name     = fields.profileName.value.trim() || 'Untitled';
  p.type     = fields.endpointType.value as EndpointType;
  p.baseURL  = fields.baseURL.value.trim();
  p.apiKey   = fields.apiKey.value.trim();
  p.model    = fields.model.value.trim() || DEFAULT_PROFILE.model;
  p.language = fields.language.value.trim();
}

/** Populate the endpoint form fields from the active profile. */
function loadActiveToForm(): void {
  const p = getActive();
  if (!p) return;
  fields.profileName.value  = p.name;
  fields.endpointType.value = p.type;
  fields.baseURL.value      = p.baseURL;
  fields.apiKey.value       = p.apiKey;
  fields.model.value        = p.model;
  fields.language.value     = p.language;
  allModels = []; // model list depends on the profile's endpoint/key
  hideDropdown();
}

function renderProfileSelect(): void {
  profileSelect.innerHTML = '';
  for (const p of profiles) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    profileSelect.appendChild(opt);
  }
  profileSelect.value = activeId;
  delProfileBtn.disabled = profiles.length <= 1;
}

// ── Load ──────────────────────────────────────────────────────────────────────
async function load(): Promise<void> {
  try {
    const [s, openAtLogin] = await Promise.all([
      window.settingsAPI.get(),
      window.settingsAPI.getLoginItem()
    ]);
    profiles = (s.profiles ?? []).map((p) => ({ ...p }));
    if (profiles.length === 0) profiles = [{ ...DEFAULT_PROFILE, id: genId() }];
    activeId = profiles.some((p) => p.id === s.activeProfileId)
      ? s.activeProfileId
      : profiles[0].id;

    renderProfileSelect();
    loadActiveToForm();

    fields.toggleShortcut.value = s.toggleShortcut ?? '';
    fields.cancelShortcut.value = s.cancelShortcut ?? '';
    fields.warmUpOnRecord.checked = s.warmUpOnRecord ?? true;
    fields.openAtLogin.checked    = openAtLogin;
    markClean();
  } catch (err) {
    showStatus('Failed to load settings.', 'err');
    console.error(err);
  }
}

// ── Save ──────────────────────────────────────────────────────────────────────
async function save(): Promise<void> {
  syncFormToActive();
  saveBtn.disabled = true;
  try {
    await Promise.all([
      window.settingsAPI.set({
        profiles,
        activeProfileId: activeId,
        toggleShortcut: fields.toggleShortcut.value.trim(),
        cancelShortcut: fields.cancelShortcut.value.trim(),
        warmUpOnRecord: fields.warmUpOnRecord.checked
      }),
      window.settingsAPI.setLoginItem(fields.openAtLogin.checked)
    ]);
    markClean();
    showStatus('Settings saved.', 'ok');
  } catch (err) {
    showStatus((err as Error).message ?? 'Failed to save.', 'err');
    console.error(err);
  } finally {
    saveBtn.disabled = false;
  }
}

// ── Profile actions ───────────────────────────────────────────────────────────
profileSelect.addEventListener('change', () => {
  syncFormToActive();
  activeId = profileSelect.value;
  renderProfileSelect();
  loadActiveToForm();
  markDirty();
});

addProfileBtn.addEventListener('click', () => {
  syncFormToActive();
  const profile: ConnectionProfile = {
    ...DEFAULT_PROFILE,
    id: genId(),
    name: `Profile ${profiles.length + 1}`
  };
  profiles.push(profile);
  activeId = profile.id;
  renderProfileSelect();
  loadActiveToForm();
  fields.profileName.focus();
  fields.profileName.select();
  markDirty();
});

delProfileBtn.addEventListener('click', () => {
  if (profiles.length <= 1) return;
  const name = getActive()?.name ?? 'this profile';
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
  profiles = profiles.filter((p) => p.id !== activeId);
  activeId = profiles[0].id;
  renderProfileSelect();
  loadActiveToForm();
  markDirty();
});

// Keep the dropdown label live as the name is typed.
fields.profileName.addEventListener('input', () => {
  const opt = profileSelect.querySelector<HTMLOptionElement>(`option[value="${activeId}"]`);
  if (opt) opt.textContent = fields.profileName.value.trim() || 'Untitled';
});

// Switching endpoint type swaps in that provider's defaults when the current
// URL/model are empty or still a known default (i.e. untouched by the user).
fields.endpointType.addEventListener('change', () => {
  const type = fields.endpointType.value as EndpointType;
  const knownURLs   = Object.values(ENDPOINT_DEFAULTS).map((d) => d.baseURL);
  const knownModels = Object.values(ENDPOINT_DEFAULTS).map((d) => d.model);
  if (!fields.baseURL.value.trim() || knownURLs.includes(fields.baseURL.value.trim())) {
    fields.baseURL.value = ENDPOINT_DEFAULTS[type].baseURL;
  }
  if (!fields.model.value.trim() || knownModels.includes(fields.model.value.trim())) {
    fields.model.value = ENDPOINT_DEFAULTS[type].model;
  }
});

// ── Dirty tracking ────────────────────────────────────────────────────────────
let isDirty = false;

function markDirty(): void {
  if (isDirty) return;
  isDirty = true;
  document.title = 'VentoType *';
  saveBtn.textContent = 'Save settings *';
}

function markClean(): void {
  isDirty = false;
  document.title = 'VentoType';
  saveBtn.textContent = 'Save settings';
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
      markDirty();
    }
  }
});

// ── Clear buttons ─────────────────────────────────────────────────────────────
document.querySelectorAll<HTMLButtonElement>('.clear-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset['target'] as keyof typeof fields;
    if (targetId && fields[targetId]) {
      fields[targetId].value = '';
      markDirty();
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
      markDirty();
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
    allModels = await window.settingsAPI.listModels(baseURL, apiKey, fields.endpointType.value as EndpointType);
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

// ── Open troubleshooting files ────────────────────────────────────────────────
$<HTMLButtonElement>('openLogFile').addEventListener('click', () => {
  window.settingsAPI.openLogFile();
});

$<HTMLButtonElement>('openSettingsFile').addEventListener('click', () => {
  window.settingsAPI.openSettingsFile();
});

// ── Field change listeners (covers direct typing + checkbox toggles) ───────────
document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select').forEach((el) => {
  el.addEventListener('input', markDirty);
  el.addEventListener('change', markDirty);
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
