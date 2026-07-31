/**
 * Platform-agnostic permission vocabulary, shared by main and renderer.
 *
 * The OS-specific plumbing lives in `src/main/services/permissions/` — one
 * adapter per platform. Everything here is pure data so the renderer can
 * import it without pulling in Electron or Node globals.
 */

/** Capabilities the app needs from the OS, named by what they do — not by OS API. */
export type PermissionId = 'microphone' | 'accessibility';

/**
 * Normalised across platforms:
 * - `granted`        — usable right now
 * - `denied`         — the user said no
 * - `restricted`     — blocked by policy (MDM, Screen Time); the user cannot change it
 * - `not-determined` — never asked, so a request will actually surface a prompt
 * - `unsupported`    — this platform has no such gate; treat as usable
 */
export type PermissionStatus =
  | 'granted'
  | 'denied'
  | 'restricted'
  | 'not-determined'
  | 'unsupported';

export interface PermissionState {
  id: PermissionId;
  status: PermissionStatus;
  /** True when calling request() can still surface an OS prompt. */
  canPrompt: boolean;
  /** True when the OS settings app is the only way to change this. */
  needsSettings: boolean;
}

/** Display copy. Kept beside the ids so the UI can render any permission generically. */
export const PERMISSION_META: Record<PermissionId, { label: string; why: string }> = {
  microphone: {
    label: 'Microphone',
    why: 'Required to record your voice for dictation.'
  },
  accessibility: {
    label: 'Accessibility',
    why: 'Required to type transcribed text into the app you are using.'
  }
};

/** Order used when checking and when rendering the list. */
export const PERMISSION_IDS: PermissionId[] = ['microphone', 'accessibility'];

/** A permission that is granted, or that this platform does not gate at all. */
export function isPermissionSatisfied(state: PermissionState): boolean {
  return state.status === 'granted' || state.status === 'unsupported';
}
