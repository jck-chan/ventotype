import { app } from 'electron';
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

type Level = 'INFO' | 'WARN' | 'ERROR';

const MAX_BYTES = 2 * 1024 * 1024; // rotate after 2 MB

class Logger {
  private readonly dir: string;
  private readonly file: string;
  private readonly oldFile: string;
  private ready = false;

  constructor() {
    this.dir = app.getPath('logs');
    this.file = join(this.dir, 'main.log');
    this.oldFile = join(this.dir, 'main.old.log');
  }

  /** Call once early in app.whenReady() to ensure the log file exists. */
  init(): void {
    if (this.ready) return;
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
    if (existsSync(this.file) && statSync(this.file).size > MAX_BYTES) {
      try { renameSync(this.file, this.oldFile); } catch { /* best-effort */ }
    }
    this.ready = true;
    this.info('──── session start ────');
  }

  get logDir(): string { return this.dir; }
  get logFile(): string { return this.file; }

  info(msg: string, ...args: unknown[]): void { this.write('INFO', msg, args); }
  warn(msg: string, ...args: unknown[]): void  { this.write('WARN', msg, args); }
  error(msg: string, ...args: unknown[]): void { this.write('ERROR', msg, args); }

  private write(level: Level, msg: string, args: unknown[]): void {
    const extra = args.length
      ? ' ' + args.map(a => (a instanceof Error ? a.stack ?? a.message : String(a))).join(' ')
      : '';
    const line = `[${timestamp()}] [${level}] ${msg}${extra}`;

    if (level === 'ERROR') console.error(line);
    else if (level === 'WARN') console.warn(line);
    else console.log(line);

    if (!this.ready) return;
    try { appendFileSync(this.file, line + '\n', 'utf8'); } catch { /* non-fatal */ }
  }
}

function timestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 23);
}

export const log = new Logger();
