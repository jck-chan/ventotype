import { app } from 'electron';
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import koffi from 'koffi';
import { log } from './logger';

type FnHookEvents = {
  /** An fn accelerator the tap saw — "Fn", "Fn+Space", "Fn+H". */
  shortcut: (accelerator: string) => void;
};

/** How often the tap's queue is drained. Short enough to feel immediate. */
const POLL_MS = 25;

/** The Swift library, an extra resource beside the app bundle once packaged. */
function libraryPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'fn-hook.dylib')
    : join(app.getAppPath(), 'resources/fn-hook.dylib');
}

/**
 * macOS-only bridge to `native/fn-hook.swift`. The fn (Globe) key is invisible to
 * Electron's globalShortcut — Carbon's hot-key API has no fn modifier — so the
 * library watches it through an event tap and queues each accelerator it sees.
 *
 * It is loaded into this process rather than spawned: a tap needs Accessibility,
 * macOS grants that per program, and a child process counts as a different
 * program. In-process, it runs on the grant the app already has to type.
 */
export class FnHook extends EventEmitter {
  private lib: { start: (swallow: string) => number; stop: () => void; poll: () => string | null } | null = null;
  private timer: NodeJS.Timeout | null = null;
  private bound = '';

  /**
   * `bound` names the accelerators to swallow, so macOS doesn't switch input
   * source on the same press that starts a dictation. Everything else the tap
   * sees is reported and passed through untouched.
   */
  start(bound: string[]): void {
    if (process.platform !== 'darwin') return;

    const swallow = bound.join('\n');
    if (this.timer && swallow === this.bound) return;
    this.stop();
    this.bound = swallow;

    const lib = this.load();
    if (!lib) return;

    if (!lib.start(swallow)) {
      log.warn('[fn-hook] could not create the event tap — accessibility not granted?');
      return;
    }

    this.timer = setInterval(() => {
      // Drained rather than pushed: the tap runs on its own thread, and calling
      // into Node from a foreign thread isn't safe.
      for (let accelerator = lib.poll(); accelerator; accelerator = lib.poll()) {
        this.emit('shortcut', accelerator);
      }
    }, POLL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.bound = '';
    this.lib?.stop();
  }

  on<K extends keyof FnHookEvents>(event: K, listener: FnHookEvents[K]): this {
    return super.on(event, listener);
  }

  private load(): FnHook['lib'] {
    if (this.lib) return this.lib;

    try {
      const lib = koffi.load(libraryPath());
      this.lib = {
        start: lib.func('int fn_hook_start(const char *swallow)') as (s: string) => number,
        stop: lib.func('void fn_hook_stop()') as () => void,
        poll: lib.func('const char *fn_hook_poll()') as () => string | null
      };
    } catch (err) {
      log.warn('[fn-hook] could not load the library', err);
    }
    return this.lib;
  }
}
