import { PermissionId, PermissionStatus } from '@shared/permissions';

/**
 * One platform's implementation of a single permission. Every method is
 * optional except `check`, so a platform only implements what it actually
 * gates — anything missing degrades to `unsupported`.
 */
export interface PermissionAdapter {
  check(): PermissionStatus | Promise<PermissionStatus>;

  /** Surfaces the OS prompt. Only meaningful when the status allows prompting. */
  request?(): Promise<PermissionStatus>;

  /** Deep-links into the OS settings pane for this permission. */
  openSettings?(): Promise<void>;

  /**
   * Whether `request()` can still raise a prompt *after* a denial.
   *
   * Most OS permission systems (macOS TCC, Windows capability prompts) fire
   * exactly once and are silent forever after — those leave this false, and the
   * UI sends the user to settings instead. macOS Accessibility is the exception:
   * its prompt can be raised again, so it opts in.
   */
  canRepromptAfterDenial?: boolean;
}

export type PermissionAdapters = Partial<Record<PermissionId, PermissionAdapter>>;
