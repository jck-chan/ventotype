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

export class ShortcutManager {
  private registered: string[] = [];
  private fnBindings = new Map<string, () => void>();
  private bindings: ShortcutBindings = { toggle: '', cancel: '' };
  private suspended = false;

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
  }

  unregisterAll(): void {
    for (const accel of this.registered) {
      globalShortcut.unregister(accel);
    }
    this.registered = [];
    this.fnBindings.clear();
  }

  private bind(accelerator: string, cb: () => void): void {
    if (!accelerator) return;
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
