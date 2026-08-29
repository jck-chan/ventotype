import { app } from 'electron';
import { ChildProcess, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { log } from './logger';

type FnHookEvents = {
  /** An fn accelerator the helper saw — "Fn", "Fn+Space", "Fn+H". */
  shortcut: (accelerator: string) => void;
};

/** The Swift helper, an extra resource beside the app bundle once packaged. */
function fnHelperPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'fn-hook')
    : join(app.getAppPath(), 'resources/fn-hook');
}

/**
 * macOS-only bridge to `native/fn-hook.swift`. The fn (Globe) key is invisible to
 * Electron's globalShortcut — Carbon's hot-key API has no fn modifier — so the
 * helper watches it through a CGEventTap and prints each accelerator it sees.
 *
 * The tap is an active one so bound keys can be swallowed, which means it runs on
 * the same Accessibility grant the app already needs to type. Without it the
 * helper exits at once and says so in the log.
 */
export class FnHook extends EventEmitter {
  private child: ChildProcess | null = null;
  private bound = '';

  /**
   * `bound` names the accelerators the helper should swallow, so macOS doesn't
   * switch input source on the same press that starts a dictation. Everything
   * else it sees is reported and passed through untouched.
   */
  start(bound: string[]): void {
    if (process.platform !== 'darwin') return;

    const key = bound.join(' ');
    if (this.child && key === this.bound) return;
    this.stop();
    this.bound = key;

    const child = spawn(fnHelperPath(), bound, { stdio: ['ignore', 'pipe', 'pipe'] });
    this.child = child;

    createInterface({ input: child.stdout! }).on('line', (accelerator) => {
      this.emit('shortcut', accelerator);
    });
    child.stderr!.on('data', (chunk: Buffer) => log.warn(`[fn-hook] ${chunk.toString().trim()}`));
    child.on('error', (err) => log.warn('[fn-hook] could not start', err));
    child.on('exit', (code) => {
      this.child = null;
      log.info(`[fn-hook] exited (${code})`);
    });
  }

  stop(): void {
    this.child?.kill();
    this.child = null;
    this.bound = '';
  }

  on<K extends keyof FnHookEvents>(event: K, listener: FnHookEvents[K]): this {
    return super.on(event, listener);
  }
}
