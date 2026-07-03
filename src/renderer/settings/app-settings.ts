import { Settings } from '@shared/types';

const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const fields = {
  toggleShortcut: $<HTMLInputElement>('toggleShortcut'),
  cancelShortcut: $<HTMLInputElement>('cancelShortcut'),
  warmUpOnRecord: $<HTMLInputElement>('warmUpOnRecord'),
  openAtLogin: $<HTMLInputElement>('openAtLogin')
};

export type AppSettingsFieldId = keyof typeof fields;

export function isAppSettingsField(fieldId: string): fieldId is AppSettingsFieldId {
  return fieldId in fields;
}

const MODIFIER_KEYS = new Set(['Control', 'Meta', 'Shift', 'Alt']);

const KEY_MAP: Record<string, string> = {
  ' ': 'Space',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  '.': '.',
  ',': ',',
  '/': '/',
  ';': ';',
  "'": "'",
  '[': '[',
  ']': ']',
  '\\': '\\',
  '-': '-',
  '=': '='
};

let capturingField: HTMLInputElement | null = null;

function capitalize(s: string): string {
  if (s.length === 1) return s.toUpperCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatAccelerator(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Control');
  if (e.metaKey) parts.push('Command');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');

  const key = e.key;
  if (!MODIFIER_KEYS.has(key)) {
    const mapped = KEY_MAP[key] ?? capitalize(key);
    parts.push(mapped);
  }

  return parts.join('+');
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

export function initAppSettings(onDirty: () => void): void {
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

    if (!MODIFIER_KEYS.has(e.key)) {
      const accel = formatAccelerator(e);
      if (accel) {
        capturingField.value = accel;
        stopCapture(capturingField);
        onDirty();
      }
    }
  });

  document.querySelectorAll<HTMLButtonElement>('.clear-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset['target'];
      if (targetId && targetId in fields) {
        fields[targetId as AppSettingsFieldId].value = '';
        onDirty();
      }
    });
  });

  $<HTMLButtonElement>('openLogFile').addEventListener('click', () => {
    window.settingsAPI.openLogFile();
  });

  $<HTMLButtonElement>('openUserDataFolder').addEventListener('click', () => {
    window.settingsAPI.openUserDataFolder();
  });

  for (const el of Object.values(fields)) {
    el.addEventListener('input', onDirty);
    el.addEventListener('change', onDirty);
  }
}

export function loadAppSettings(s: Settings, openAtLogin: boolean): void {
  fields.toggleShortcut.value = s.toggleShortcut ?? '';
  fields.cancelShortcut.value = s.cancelShortcut ?? '';
  fields.warmUpOnRecord.checked = s.warmUpOnRecord ?? true;
  fields.openAtLogin.checked = openAtLogin;
}

export function appSettingsPatch(): Pick<Settings, 'toggleShortcut' | 'cancelShortcut' | 'warmUpOnRecord'> {
  return {
    toggleShortcut: fields.toggleShortcut.value.trim(),
    cancelShortcut: fields.cancelShortcut.value.trim(),
    warmUpOnRecord: fields.warmUpOnRecord.checked
  };
}

export function openAtLoginValue(): boolean {
  return fields.openAtLogin.checked;
}
