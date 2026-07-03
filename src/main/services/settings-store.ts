import { app } from 'electron';
import { EventEmitter } from 'node:events';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { DEFAULT_PROFILE, defaultSettingsFor, EndpointType, Settings } from '@shared/types';

// Platform-aware defaults, resolved once in the main process where `process` exists.
const DEFAULTS: Settings = defaultSettingsFor(process.platform);

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

  ensureFile(): string {
    if (!existsSync(this.filePath)) this.save(this.current);
    return this.filePath;
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
      if (!existsSync(this.filePath)) return { ...DEFAULTS };
      const raw = readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed['toggleShortcut'] !== 'string' && typeof parsed['startShortcut'] === 'string') {
        parsed['toggleShortcut'] = parsed['startShortcut'];
      }
      if (typeof parsed['cancelShortcut'] !== 'string' && typeof parsed['stopShortcut'] === 'string') {
        parsed['cancelShortcut'] = parsed['stopShortcut'];
      }
      delete parsed['startShortcut'];
      delete parsed['stopShortcut'];

      // Migrate flat single-endpoint settings → a single connection profile.
      if (!Array.isArray(parsed['profiles'])) {
        const baseURL = typeof parsed['baseURL'] === 'string' ? parsed['baseURL'] : DEFAULT_PROFILE.baseURL;
        const type: EndpointType = /(^|\.)openrouter\.ai/i.test(baseURL) ? 'openrouter' : 'openai';
        parsed['profiles'] = [{
          ...DEFAULT_PROFILE,
          type,
          baseURL,
          apiKey:   typeof parsed['apiKey']   === 'string' ? parsed['apiKey']   : DEFAULT_PROFILE.apiKey,
          model:    typeof parsed['model']    === 'string' ? parsed['model']    : DEFAULT_PROFILE.model,
          language: typeof parsed['language'] === 'string' ? parsed['language'] : DEFAULT_PROFILE.language
        }];
        parsed['activeProfileId'] = DEFAULT_PROFILE.id;
      }
      delete parsed['baseURL'];
      delete parsed['apiKey'];
      delete parsed['model'];
      delete parsed['language'];

      return { ...DEFAULTS, ...parsed } as Settings;
    } catch {
      return { ...DEFAULTS };
    }
  }

  private save(settings: Settings): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(settings, null, 2), 'utf8');
  }
}
