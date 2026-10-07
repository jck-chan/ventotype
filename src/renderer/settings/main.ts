import { ConnectionProfile, DictationError, TranscribeResult, Settings } from '@shared/types';
import { PermissionId, PermissionState } from '@shared/permissions';
import {
  appSettingsPatch,
  initAppSettings,
  loadAppSettings,
  openAtLoginValue
} from './app-settings';
import { initLastError } from './last-error';
import { initPermissions } from './permissions';
import { initPlayground, loadPlaygroundProfiles } from './playground';
import {
  currentProfileDirtyVersion,
  flushProfileSave,
  initProfiles,
  loadProfiles,
  markProfileClean,
  profilesPatch,
  setProfileModified
} from './profiles';
import { initTabs } from './tabs';
import { initTextReplacements, loadTextReplacements } from './text-replacements';

declare global {
  interface Window {
    settingsAPI: {
      get: () => Promise<Settings>;
      set: (patch: Partial<Settings>) => Promise<Settings>;
      saveActiveProfile: (profile: unknown, activeProfileId: unknown) => Promise<Settings>;
      saveProfileStructure: (profiles: ConnectionProfile[], activeProfileId: string,
        previousActiveProfile?: ConnectionProfile) => Promise<Settings>;
      setDirty: (dirty: boolean) => void;
      openTextReplacementsFolder: () => Promise<string>;
      createTextReplacementSet: () => Promise<Settings>;
      refreshTextReplacementSets: () => Promise<Settings>;
      openLogFile: () => Promise<void>;
      openUserDataFolder: () => Promise<void>;
      listModels: (baseURL: string, apiKey: string, type: string) => Promise<string[]>;
      getLoginItem: () => Promise<boolean>;
      setLoginItem: (enable: boolean) => Promise<void>;
      getLastError: () => Promise<DictationError | null>;
      dismissLastError: () => Promise<void>;
      onLastErrorChanged: (cb: (error: DictationError) => void) => void;
      setCapturingShortcut: (capturing: boolean) => Promise<void>;
      onFnShortcut: (cb: (accelerator: string) => void) => void;
      getPermissions: () => Promise<PermissionState[]>;
      requestPermission: (id: PermissionId) => Promise<PermissionState>;
      openPermissionSettings: (id: PermissionId) => Promise<void>;
      playgroundTranscribe: (
        audio: ArrayBuffer,
        mimeType: string,
        profileId: string
      ) => Promise<TranscribeResult>;
    };
  }
}

const statusEl = document.getElementById('status') as HTMLSpanElement;

let profileDirty = false;
let appSavePromise: Promise<void> = Promise.resolve();

function refreshDirtyState(): void {
  document.title = profileDirty ? 'VentoType *' : 'VentoType';
  setProfileModified(profileDirty);
  window.settingsAPI.setDirty(profileDirty);
}

function markProfileDirty(): void {
  profileDirty = true;
  refreshDirtyState();
}

function markAppSettingsDirty(): void {
  const patch = appSettingsPatch();
  const openAtLogin = openAtLoginValue();
  appSavePromise = appSavePromise.then(async () => {
    await Promise.all([
      window.settingsAPI.set(patch),
      window.settingsAPI.setLoginItem(openAtLogin)
    ]);
  }).catch((err) => {
    showStatus((err as Error).message || 'Failed to save settings.', 'err');
  });
}

function markClean(): void {
  profileDirty = false;
  refreshDirtyState();
}

let statusTimer: ReturnType<typeof setTimeout> | null = null;

function showStatus(msg: string, type: 'ok' | 'err'): void {
  statusEl.textContent = msg;
  statusEl.className = `status-msg ${type}`;
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    statusEl.textContent = '';
    statusEl.className = 'status-msg';
  }, 3000);
}

async function load(): Promise<void> {
  try {
    const [s, openAtLogin] = await Promise.all([
      window.settingsAPI.get(),
      window.settingsAPI.getLoginItem()
    ]);
    loadProfiles(s);
    loadAppSettings(s, openAtLogin);
    loadTextReplacements(s);
    loadPlaygroundProfiles(s);
    markClean();
  } catch (err) {
    showStatus('Failed to load settings.', 'err');
    console.error(err);
  }
}

async function save(): Promise<void> {
  try {
    await flushProfileSave();
    const profileVersion = currentProfileDirtyVersion();
    const { profiles, activeProfileId } = profilesPatch();
    const profile = profiles.find((item) => item.id === activeProfileId);
    if (!profile) throw new Error('Profile not found.');
    const saved = await window.settingsAPI.saveActiveProfile(profile, activeProfileId);
    loadPlaygroundProfiles(saved);
    if (currentProfileDirtyVersion() === profileVersion) {
      profileDirty = false;
      markProfileClean();
    }
    refreshDirtyState();
  } catch (err) {
    showStatus((err as Error).message ?? 'Failed to save.', 'err');
    console.error(err);
  }
}

initTabs();
initLastError();
initPermissions();
initPlayground();
initAppSettings(markAppSettingsDirty);
initTextReplacements(showStatus);
initProfiles(
  markProfileDirty,
  (saved) => {
    profileDirty = false;
    markProfileClean();
    refreshDirtyState();
  },
  (message) => {
    profileDirty = true;
    refreshDirtyState();
    showStatus(message, 'err');
  },
  loadPlaygroundProfiles
);

document.addEventListener('keydown', (e) => {
  if (((navigator.platform.startsWith('Mac') && e.metaKey) ||
      (!navigator.platform.startsWith('Mac') && e.ctrlKey)) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    save();
  }
});

load();
