import { app } from 'electron';
import { EventEmitter } from 'node:events';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { DEFAULT_SETTINGS, Settings } from '@shared/types';

type StoreEvents = {
  change: (next: Settings, prev: Settings) => void;
};

export class SettingsStore extends EventEmitter {
  private readonly filePath: string;
  private current: Settings;

  constructor() {
    super();
    this.filePath = join(app.getPath('userData'), 'settings.json');
    this.current = this.load();
  }

  get value(): Settings {
    return { ...this.current };
  }

  update(patch: Partial<Settings>): Settings {
    const prev = this.current;
    const next: Settings = { ...prev, ...patch };
    this.current = next;
    this.save(next);
    this.emit('change', next, prev);
    return { ...next };
  }

  on<K extends keyof StoreEvents>(event: K, listener: StoreEvents[K]): this {
    return super.on(event, listener);
  }

  private load(): Settings {
    try {
      if (!existsSync(this.filePath)) return { ...DEFAULT_SETTINGS };
      const raw = readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<Settings>;
      return { ...DEFAULT_SETTINGS, ...parsed };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  private save(settings: Settings): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(settings, null, 2), 'utf8');
  }
}
