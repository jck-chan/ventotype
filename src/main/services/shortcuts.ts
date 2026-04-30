import { globalShortcut } from 'electron';
import { log } from './logger';

export interface ShortcutBindings {
  toggle: string;
  cancel: string;
}

export interface ShortcutHandlers {
  onToggle: () => void;
  onCancel: () => void;
}

export class ShortcutManager {
  private registered: string[] = [];

  constructor(private readonly handlers: ShortcutHandlers) {}

  apply(bindings: ShortcutBindings): void {
    this.unregisterAll();
    this.tryRegister(bindings.toggle, this.handlers.onToggle);
    if (bindings.cancel && bindings.cancel !== bindings.toggle) {
      this.tryRegister(bindings.cancel, this.handlers.onCancel);
    }
  }

  unregisterAll(): void {
    for (const accel of this.registered) {
      globalShortcut.unregister(accel);
    }
    this.registered = [];
  }

  private tryRegister(accelerator: string, cb: () => void): void {
    if (!accelerator) return;
    try {
      const ok = globalShortcut.register(accelerator, cb);
      if (ok) this.registered.push(accelerator);
      else log.warn(`[shortcuts] failed to register: ${accelerator}`);
    } catch (err) {
      log.warn(`[shortcuts] invalid accelerator "${accelerator}":`, err);
    }
  }
}
