import { DictationError, PlaygroundTranscribeResult, Settings } from '@shared/types';
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
  bumpProfileDirtyVersion,
  currentProfileDirtyVersion,
  flushProfileSave,
  initProfiles,
  loadProfiles,
  markProfileClean,
  profilesPatch
} from './profiles';
import { initTabs } from './tabs';
import { initTextReplacements, loadTextReplacements, markTextReplacementSetsSaved, textReplacementSetsPatch } from './text-replacements';

declare global {
  interface Window {
    settingsAPI: {
      get: () => Promise<Settings>;
      set: (patch: Partial<Settings>) => Promise<Settings>;
      saveActiveProfile: (profile: unknown, activeProfileId: unknown) => Promise<Settings>;
      setDirty: (dirty: boolean) => void;
      openTextReplacementsFolder: () => Promise<string>;
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
      ) => Promise<PlaygroundTranscribeResult>;
    };
  }
}

const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLSpanElement;

let profileDirty = false;
let appSettingsDirty = false;
let appSettingsDirtyVersion = 0;

function refreshDirtyState(): void {
  const isDirty = profileDirty || appSettingsDirty;
  document.title = isDirty ? 'VentoType *' : 'VentoType';
  saveBtn.textContent = isDirty ? 'Save changes *' : 'Save changes';
  window.settingsAPI.setDirty(isDirty);
}

function markProfileDirty(): void {
  profileDirty = true;
  refreshDirtyState();
}

function markAppSettingsDirty(): void {
  appSettingsDirty = true;
  appSettingsDirtyVersion += 1;
  refreshDirtyState();
}

function markClean(): void {
  profileDirty = false;
  appSettingsDirty = false;
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
    loadTextReplacements(s, markAppSettingsDirty);
    loadPlaygroundProfiles(s);
    markClean();
  } catch (err) {
    showStatus('Failed to load settings.', 'err');
    console.error(err);
  }
}

async function save(): Promise<void> {
  if (saveBtn.disabled) return;
  saveBtn.disabled = true;
  try {
    await flushProfileSave();
    const profileVersion = currentProfileDirtyVersion();
    const appVersion = appSettingsDirtyVersion;
    const [saved] = await Promise.all([
      window.settingsAPI.set({
        ...profilesPatch(),
        ...appSettingsPatch(),
        ...textReplacementSetsPatch()
      }),
      window.settingsAPI.setLoginItem(openAtLoginValue())
    ]);
    loadPlaygroundProfiles(saved);
    markTextReplacementSetsSaved(saved);
    if (currentProfileDirtyVersion() === profileVersion) {
      profileDirty = false;
      markProfileClean();
    }
    if (appSettingsDirtyVersion === appVersion) appSettingsDirty = false;
    refreshDirtyState();
    showStatus('Saved.', 'ok');
  } catch (err) {
    showStatus((err as Error).message ?? 'Failed to save.', 'err');
    console.error(err);
  } finally {
    saveBtn.disabled = false;
  }
}

initTabs();
initLastError();
initPermissions();
initPlayground();
initAppSettings(markAppSettingsDirty);
initTextReplacements(markAppSettingsDirty, showStatus);
initProfiles(
  markProfileDirty,
  (saved) => {
    const current = profilesPatch();
    profileDirty = JSON.stringify(current.profiles) !== JSON.stringify(saved.profiles) ||
      current.activeProfileId !== saved.activeProfileId;
    if (!profileDirty) markProfileClean();
    refreshDirtyState();
  },
  (message) => {
    profileDirty = true;
    bumpProfileDirtyVersion();
    refreshDirtyState();
    showStatus(message, 'err');
  }
);

saveBtn.addEventListener('click', save);

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault();
    save();
  }
});

load();
