import { globalShortcut } from 'electron';
import { FnHook } from './fn-hook';
import { log } from './logger';

export interface ShortcutBindings {
  toggle: string;
  cancel: string;
}

export interface ShortcutHandlers {
  onToggle: () => void;
  onCancel: () => void;
}

/** Bindings built on the fn (Globe) key, which only `FnHook` can deliver. */
export function isFnShortcut(accelerator: string): boolean {
  return /^Fn(\+|$)/.test(accelerator);
}

/**
 * Cancelling with Esc is the convention everywhere, so it works without being
 * bound. It can't be a normal binding though: a registered accelerator is
 * swallowed before any app sees it, and taking Esc away from dialogs, vim and
 * fullscreen video for the sake of a shortcut that does nothing outside a take
 * is a bad trade. So it's held only while one is in flight — see
 * `setDictationActive` — and handed straight back.
 */
const ESCAPE = 'Escape';

export class ShortcutManager {
  private registered: string[] = [];
  private fnBindings = new Map<string, () => void>();
  private bindings: ShortcutBindings = { toggle: '', cancel: '' };
  private suspended = false;
  private dictationActive = false;
  private escapeHeld = false;

  constructor(
    private readonly handlers: ShortcutHandlers,
    fnHook: FnHook
  ) {
    fnHook.on('shortcut', (accelerator) => this.fnBindings.get(accelerator)?.());
  }

  apply(bindings: ShortcutBindings): void {
    this.bindings = bindings;
    this.unregisterAll();
    if (this.suspended) return;

    this.bind(bindings.toggle, this.handlers.onToggle);
    if (bindings.cancel && bindings.cancel !== bindings.toggle) {
      this.bind(bindings.cancel, this.handlers.onCancel);
    }
  }

  /**
   * The bound fn accelerators, for the helper to swallow. Taken from the saved
   * bindings rather than the live handlers, so a shortcut stays swallowed while
   * Settings is recording — the press still reaches the field, just without
   * macOS acting on it as well.
   */
  fnAccelerators(): string[] {
    return [...new Set([this.bindings.toggle, this.bindings.cancel])].filter(isFnShortcut);
  }

  /**
   * Held off while Settings is recording a shortcut. A registered accelerator is
   * swallowed by the OS before any window sees it, so without this the field
   * could never capture the key it is already bound to — and pressing it would
   * start dictating instead.
   */
  setSuspended(suspended: boolean): void {
    if (suspended === this.suspended) return;
    this.suspended = suspended;
    this.apply(this.bindings);
    this.syncEscape();
  }

  /**
   * Whether a take is in flight, i.e. whether cancelling means anything right
   * now. Drives the temporary Esc binding; the states passed here should stay in
   * step with the ones `DictationController.cancel()` acts on.
   */
  setDictationActive(active: boolean): void {
    if (active === this.dictationActive) return;
    this.dictationActive = active;
    this.syncEscape();
  }

  unregisterAll(): void {
    for (const accel of this.registered) {
      globalShortcut.unregister(accel);
    }
    this.registered = [];
    this.fnBindings.clear();
  }

  /**
   * Kept out of `registered` so `apply()` — which tears every binding down and
   * rebuilds it — doesn't drop Esc out from under a take that's still running.
   */
  private syncEscape(): void {
    // Not while Settings is recording a shortcut: the field needs Esc to back out.
    const want = this.dictationActive && !this.suspended;
    if (want === this.escapeHeld) return;

    if (!want) {
      globalShortcut.unregister(ESCAPE);
      this.escapeHeld = false;
      return;
    }

    try {
      this.escapeHeld = globalShortcut.register(ESCAPE, this.handlers.onCancel);
      if (!this.escapeHeld) log.warn('[shortcuts] failed to register Escape to cancel');
    } catch (err) {
      log.warn('[shortcuts] failed to register Escape to cancel:', err);
      this.escapeHeld = false;
    }
  }

  private bind(accelerator: string, cb: () => void): void {
    if (!accelerator) return;
    // Esc is handled by `syncEscape` — a saved binding for it (only reachable by
    // hand-editing settings, since the recorder uses Esc to back out) would be
    // torn down the first time a take ended.
    if (accelerator === ESCAPE) return;
    if (isFnShortcut(accelerator)) this.fnBindings.set(accelerator, cb);
    else this.tryRegister(accelerator, cb);
  }

  private tryRegister(accelerator: string, cb: () => void): void {
    try {
      const ok = globalShortcut.register(accelerator, cb);
      if (ok) this.registered.push(accelerator);
      else log.warn(`[shortcuts] failed to register: ${accelerator}`);
    } catch (err) {
      log.warn(`[shortcuts] invalid accelerator "${accelerator}":`, err);
    }
  }
}
