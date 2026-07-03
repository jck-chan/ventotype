import { Settings } from '@shared/types';
import {
  appSettingsPatch,
  initAppSettings,
  loadAppSettings,
  openAtLoginValue
} from './app-settings';
import {
  bumpProfileDirtyVersion,
  flushProfileSave,
  initProfiles,
  loadProfiles,
  markProfileClean,
  profilesPatch
} from './profiles';
import { initTabs } from './tabs';

declare global {
  interface Window {
    settingsAPI: {
      get: () => Promise<Settings>;
      set: (patch: Partial<Settings>) => Promise<Settings>;
      saveActiveProfile: (profile: unknown, activeProfileId: unknown) => Promise<Settings>;
      openLogFile: () => Promise<void>;
      openSettingsFile: () => Promise<void>;
      listModels: (baseURL: string, apiKey: string, type: EndpointType) => Promise<string[]>;
      getLoginItem: () => Promise<boolean>;
      setLoginItem: (enable: boolean) => Promise<void>;
    };
  }
}

const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLSpanElement;

let profileDirty = false;
let appSettingsDirty = false;

function refreshDirtyState(): void {
  const isDirty = profileDirty || appSettingsDirty;
  document.title = isDirty ? 'VentoType *' : 'VentoType';
  saveBtn.textContent = isDirty ? 'Save changes *' : 'Save changes';
}

function markProfileDirty(): void {
  profileDirty = true;
  refreshDirtyState();
}

function markAppSettingsDirty(): void {
  appSettingsDirty = true;
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
    markClean();
  } catch (err) {
    showStatus('Failed to load settings.', 'err');
    console.error(err);
  }
}

async function save(): Promise<void> {
  saveBtn.disabled = true;
  try {
    await flushProfileSave();
    await Promise.all([
      window.settingsAPI.set({
        ...profilesPatch(),
        ...appSettingsPatch()
      }),
      window.settingsAPI.setLoginItem(openAtLoginValue())
    ]);
    markClean();
    showStatus('Saved.', 'ok');
  } catch (err) {
    showStatus((err as Error).message ?? 'Failed to save.', 'err');
    console.error(err);
  } finally {
    saveBtn.disabled = false;
  }
}

initTabs();
initAppSettings(markAppSettingsDirty);
initProfiles(
  markProfileDirty,
  () => {
    profileDirty = false;
    markProfileClean();
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
