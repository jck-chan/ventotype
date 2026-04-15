import { globalShortcut } from 'electron';

export interface ShortcutBindings {
  start: string;
  stop: string;
}

export interface ShortcutHandlers {
  onStart: () => void;
  onStop: () => void;
}

export class ShortcutManager {
  private registered: string[] = [];

  constructor(private readonly handlers: ShortcutHandlers) {}

  apply(bindings: ShortcutBindings): void {
    this.unregisterAll();
    this.tryRegister(bindings.start, this.handlers.onStart);
    if (bindings.stop && bindings.stop !== bindings.start) {
      this.tryRegister(bindings.stop, this.handlers.onStop);
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
      else console.warn(`[shortcuts] failed to register: ${accelerator}`);
    } catch (err) {
      console.warn(`[shortcuts] invalid accelerator "${accelerator}":`, err);
    }
  }
}
