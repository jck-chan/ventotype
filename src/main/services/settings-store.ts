import { app } from 'electron';
import { EventEmitter } from 'node:events';
import { openSync, fsyncSync, closeSync } from 'node:fs';
import {
  AppSettings,
  ConnectionProfile,
  defaultSettingsFor,
  ProfilesData,
  Settings
} from '@shared/types';
import { readJsonFile, writeJsonAtomic } from '../user-data/json-io';
import { userDataPaths } from '../user-data/paths';
import { runUserDataMigrations } from '../user-data/runner';

const DEFAULTS: Settings = defaultSettingsFor(process.platform);

type StoreEvents = {
  change: (next: Settings, prev: Settings) => void;
};

export class SettingsStore extends EventEmitter {
  private readonly storeDir: string;
  private readonly settingsPath: string;
  private readonly profilesPath: string;
  private current: Settings;

  constructor() {
    super();
    const electronUserDataDir = app.getPath('userData');
    runUserDataMigrations(electronUserDataDir);
    const paths = userDataPaths(electronUserDataDir);
    this.storeDir = paths.storeDir;
    this.settingsPath = paths.settings;
    this.profilesPath = paths.profiles;
    this.current = this.load();
  }

  get value(): Settings {
    return { ...this.current };
  }

  get dataDir(): string {
    return this.storeDir;
  }

  ensureFile(): string {
    if (!readJsonFile(this.settingsPath)) this.saveAppSettings(this.current);
    if (!readJsonFile(this.profilesPath)) this.saveProfiles(this.current);
    return this.settingsPath;
  }

  update(patch: Partial<Settings>): Settings {
    const prev = this.current;
    const next: Settings = { ...prev, ...patch };
    this.save(next);
    this.current = next;
    this.emit('change', next, prev);
    return { ...next };
  }

  updateActiveProfile(profile: ConnectionProfile, activeProfileId: string): Settings {
    const prev = this.current;
    const profiles = prev.profiles.some((p) => p.id === profile.id)
      ? prev.profiles.map((p) => (p.id === profile.id ? { ...profile } : p))
      : [...prev.profiles, { ...profile }];
    const next: Settings = { ...prev, profiles, activeProfileId };
    this.saveProfiles(next);
    this.current = next;
    this.emit('change', next, prev);
    return { ...next };
  }

  on<K extends keyof StoreEvents>(event: K, listener: StoreEvents[K]): this {
    return super.on(event, listener);
  }

  private load(): Settings {
    const appSettings = readJsonFile<Partial<AppSettings>>(this.settingsPath) ?? {};
    const profilesData = readJsonFile<Partial<ProfilesData>>(this.profilesPath) ?? {};
    return { ...DEFAULTS, ...appSettings, ...profilesData };
  }

  private save(settings: Settings): void {
    this.saveAppSettings(settings);
    this.saveProfiles(settings);
  }

  private saveAppSettings(settings: AppSettings): void {
    writeJsonAtomic(this.settingsPath, {
      toggleShortcut: settings.toggleShortcut,
      cancelShortcut: settings.cancelShortcut,
      warmUpOnRecord: settings.warmUpOnRecord
    });
    this.fsyncDirectoryBestEffort(this.storeDir);
  }

  private saveProfiles(settings: ProfilesData): void {
    writeJsonAtomic(this.profilesPath, {
      profiles: settings.profiles,
      activeProfileId: settings.activeProfileId
    });
    this.fsyncDirectoryBestEffort(this.storeDir);
  }

  private fsyncDirectoryBestEffort(dir: string): void {
    let fd: number | undefined;

    try {
      fd = openSync(dir, 'r');
      fsyncSync(fd);
    } catch {
      // Some platforms/filesystems do not allow directory fsync.
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
  }
}
