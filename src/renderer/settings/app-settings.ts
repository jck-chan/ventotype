import { Settings } from '@shared/types';

const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const fields = {
  toggleShortcut: $<HTMLInputElement>('toggleShortcut'),
  cancelShortcut: $<HTMLInputElement>('cancelShortcut'),
  warmUpOnRecord: $<HTMLInputElement>('warmUpOnRecord'),
  copyToClipboard: $<HTMLInputElement>('copyToClipboard'),
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

/**
 * What each shortcut field says when it holds nothing, taken from the markup so
 * the two do not have to agree: the toggle has to be set, while an empty cancel
 * field still cancels on Esc and says so.
 */
const restingPlaceholders = new WeakMap<HTMLInputElement, string>();

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
  // The bound keys are held off in main, so they reach this field instead of
  // starting a dictation.
  window.settingsAPI.setCapturingShortcut(true);
}

function stopCapture(input: HTMLInputElement): void {
  input.classList.remove('capturing');
  input.placeholder = restingPlaceholders.get(input) ?? '';
  if (capturingField !== input) return;

  capturingField = null;
  window.settingsAPI.setCapturingShortcut(false);
}

export function initAppSettings(onDirty: () => void): void {
  for (const inputId of ['toggleShortcut', 'cancelShortcut'] as const) {
    const input = fields[inputId];
    restingPlaceholders.set(input, input.placeholder);

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

  // fn never reaches the renderer as a key event — the main process hears it
  // through the fn helper and forwards what it saw, ready-made.
  window.settingsAPI.onFnShortcut((accelerator) => {
    if (!capturingField) return;
    capturingField.value = accelerator;
    stopCapture(capturingField);
    onDirty();
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
  fields.copyToClipboard.checked = s.copyToClipboard ?? false;
  fields.openAtLogin.checked = openAtLogin;
}

export function appSettingsPatch(): Pick<
  Settings,
  'toggleShortcut' | 'cancelShortcut' | 'warmUpOnRecord' | 'copyToClipboard'
> {
  return {
    toggleShortcut: fields.toggleShortcut.value.trim(),
    cancelShortcut: fields.cancelShortcut.value.trim(),
    warmUpOnRecord: fields.warmUpOnRecord.checked,
    copyToClipboard: fields.copyToClipboard.checked
  };
}

export function openAtLoginValue(): boolean {
  return fields.openAtLogin.checked;
}
