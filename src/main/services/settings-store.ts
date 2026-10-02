import { app } from 'electron';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
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
import { validateProfileReplacements } from '@shared/profile-replacements';
import { readTextReplacementSets, validateTextReplacementSets, writeTextReplacementSets } from './text-replacement-sets';

const DEFAULTS: Settings = defaultSettingsFor(process.platform);
const revision = (sets: Settings['textReplacementSets']): string =>
  createHash('sha256').update(JSON.stringify(sets)).digest('hex');

type StoreEvents = {
  change: (next: Settings, prev: Settings) => void;
};

export class SettingsStore extends EventEmitter {
  private readonly storeDir: string;
  private readonly settingsPath: string;
  private readonly profilesPath: string;
  private readonly textReplacementsDir: string;
  private readonly textReplacementsMetadata: string;
  private current: Settings;

  constructor() {
    super();
    const electronUserDataDir = app.getPath('userData');
    runUserDataMigrations(electronUserDataDir);
    const paths = userDataPaths(electronUserDataDir);
    this.storeDir = paths.storeDir;
    this.settingsPath = paths.settings;
    this.profilesPath = paths.profiles;
    this.textReplacementsDir = paths.textReplacementsDir;
    this.textReplacementsMetadata = paths.textReplacementsMetadata;
    this.current = this.load();
  }

  get value(): Settings {
    this.refreshTextReplacementSets();
    return { ...this.current };
  }

  get dataDir(): string {
    return this.storeDir;
  }

  get ruleSetsDir(): string {
    return this.textReplacementsDir;
  }

  ensureFile(): string {
    if (!readJsonFile(this.settingsPath)) this.saveAppSettings(this.current);
    if (!readJsonFile(this.profilesPath)) this.saveProfiles(this.current);
    return this.settingsPath;
  }

  update(patch: Partial<Settings>): Settings {
    this.refreshTextReplacementSets();
    const prev = this.current;
    const textReplacementSets = patch.textReplacementSets === undefined
      ? prev.textReplacementSets
      : validateTextReplacementSets(patch.textReplacementSets);
    if (patch.textReplacementSets !== undefined &&
        patch.textReplacementSetsRevision !== prev.textReplacementSetsRevision) {
      throw new Error('Rule set files changed outside Settings. Reopen Settings before saving.');
    }
    const profiles = patch.profiles === undefined ? prev.profiles :
      patch.profiles.map((profile) => ({
        ...profile,
        regexReplacements: validateProfileReplacements(profile.regexReplacements)
      }));
    const next: Settings = {
      ...prev, ...patch, profiles, textReplacementSets,
      textReplacementSetsRevision: revision(textReplacementSets)
    };
    this.save(next);
    this.current = next;
    this.emit('change', next, prev);
    return { ...next };
  }

  updateActiveProfile(profile: ConnectionProfile, activeProfileId: string): Settings {
    const prev = this.current;
    const validatedProfile = {
      ...profile,
      regexReplacements: validateProfileReplacements(profile.regexReplacements)
    };
    const profiles = prev.profiles.some((p) => p.id === profile.id)
      ? prev.profiles.map((p) => (p.id === profile.id ? validatedProfile : p))
      : [...prev.profiles, validatedProfile];
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
    const textReplacementSetErrors: Settings['textReplacementSetErrors'] = [];
    const textReplacementSets = readTextReplacementSets(this.textReplacementsDir,
      this.textReplacementsMetadata, (error) => textReplacementSetErrors.push(error));
    return {
      ...DEFAULTS,
      ...appSettings,
      ...profilesData,
      profiles: (profilesData.profiles ?? DEFAULTS.profiles).map((profile) => ({
        ...profile,
        regexReplacements: validateProfileReplacements(profile.regexReplacements)
      })),
      textReplacementSets,
      textReplacementSetErrors,
      textReplacementSetsRevision: revision(textReplacementSets)
    };
  }

  private save(settings: Settings): void {
    writeTextReplacementSets(this.textReplacementsDir, this.textReplacementsMetadata,
      this.current.textReplacementSets, settings.textReplacementSets);
    this.saveAppSettings(settings);
    this.saveProfiles(settings);
  }

  private saveAppSettings(settings: AppSettings): void {
    writeJsonAtomic(this.settingsPath, {
      toggleShortcut: settings.toggleShortcut,
      cancelShortcut: settings.cancelShortcut,
      audioFormat: settings.audioFormat,
      useBuiltInMicOnly: settings.useBuiltInMicOnly,
      warmUpOnRecord: settings.warmUpOnRecord,
      copyToClipboard: settings.copyToClipboard
    });
    this.fsyncDirectoryBestEffort(this.storeDir);
  }

  private refreshTextReplacementSets(): void {
    const textReplacementSetErrors: Settings['textReplacementSetErrors'] = [];
    const textReplacementSets = readTextReplacementSets(this.textReplacementsDir,
      this.textReplacementsMetadata, (error) => textReplacementSetErrors.push(error));
    this.current = {
      ...this.current,
      textReplacementSets,
      textReplacementSetErrors,
      textReplacementSetsRevision: revision(textReplacementSets)
    };
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
