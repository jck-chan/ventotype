import {
  ConnectionProfile,
  DEFAULT_PROFILE,
  EndpointType,
  ENDPOINT_DEFAULTS,
  Settings
} from '@shared/types';

const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const fields = {
  profileName: $<HTMLInputElement>('profileName'),
  endpointType: $<HTMLSelectElement>('endpointType'),
  baseURL: $<HTMLInputElement>('baseURL'),
  apiKey: $<HTMLInputElement>('apiKey'),
  model: $<HTMLInputElement>('model'),
  language: $<HTMLInputElement>('language')
};

export type ProfileFieldId = keyof typeof fields;

export function isProfileField(fieldId: string): fieldId is ProfileFieldId {
  return fieldId in fields;
}

const profileSelect = $<HTMLSelectElement>('profileSelect');
const addProfileBtn = $<HTMLButtonElement>('addProfile');
const delProfileBtn = $<HTMLButtonElement>('deleteProfile');
const revealBtn = $<HTMLButtonElement>('revealKey');
const eyeShow = $('eye-show');
const eyeHide = $('eye-hide');
const refreshModels = $<HTMLButtonElement>('refreshModels');
const modelDropdown = $<HTMLUListElement>('model-dropdown');
const refreshIcon = $('refresh-icon');

let profiles: ConnectionProfile[] = [];
let activeId = '';
let allModels: string[] = [];
let activeIdx = -1;
let profileSavePromise: Promise<void> = Promise.resolve();
let profileDirtyVersion = 0;

const genId = (): string =>
  `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

function getActive(): ConnectionProfile {
  return profiles.find((p) => p.id === activeId) ?? profiles[0];
}

function syncFormToActive(): void {
  const p = getActive();
  if (!p) return;
  p.name = fields.profileName.value.trim() || 'Untitled';
  p.type = fields.endpointType.value as EndpointType;
  p.baseURL = fields.baseURL.value.trim();
  p.apiKey = fields.apiKey.value.trim();
  p.model = fields.model.value.trim() || DEFAULT_PROFILE.model;
  p.language = fields.language.value.trim();
}

function loadActiveToForm(): void {
  const p = getActive();
  if (!p) return;
  fields.profileName.value = p.name;
  fields.endpointType.value = p.type;
  fields.baseURL.value = p.baseURL;
  fields.apiKey.value = p.apiKey;
  fields.model.value = p.model;
  fields.language.value = p.language;
  allModels = [];
  hideDropdown();
}

function renderProfileSelect(): void {
  profileSelect.innerHTML = '';
  for (const p of profiles) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    profileSelect.appendChild(opt);
  }
  profileSelect.value = activeId;
  delProfileBtn.disabled = profiles.length <= 1;
}

function saveActiveProfileOnly(
  profile: ConnectionProfile,
  activeProfileId: string,
  onSaved: () => void,
  onError: (message: string) => void
): void {
  const savedDirtyVersion = profileDirtyVersion;
  profileSelect.disabled = true;

  const run = async (): Promise<void> => {
    try {
      await window.settingsAPI.saveActiveProfile(profile, activeProfileId);
      if (profileDirtyVersion === savedDirtyVersion) onSaved();
    } catch (err) {
      onError((err as Error).message ?? 'Failed to save profile.');
      console.error(err);
    } finally {
      profileSelect.disabled = false;
    }
  };

  profileSavePromise = profileSavePromise.then(run, run);
}

function renderDropdown(filter: string): void {
  const f = filter.toLowerCase();
  const matches = allModels.filter((m) => m.toLowerCase().includes(f));

  modelDropdown.innerHTML = '';
  activeIdx = -1;

  if (matches.length === 0) {
    hideDropdown();
    return;
  }

  for (const id of matches) {
    const li = document.createElement('li');
    li.className = 'model-option';
    li.textContent = id;
    li.addEventListener('mousedown', (e) => {
      e.preventDefault();
      fields.model.value = id;
      hideDropdown();
      markProfileDirtyExternal();
    });
    modelDropdown.appendChild(li);
  }

  modelDropdown.classList.add('open');
}

function hideDropdown(): void {
  modelDropdown.classList.remove('open');
  activeIdx = -1;
}

function moveActive(delta: number): void {
  const items = modelDropdown.querySelectorAll<HTMLLIElement>('.model-option');
  if (!items.length) return;
  activeIdx = Math.max(0, Math.min(activeIdx + delta, items.length - 1));
  items.forEach((el, i) => el.classList.toggle('active', i === activeIdx));
  items[activeIdx]?.scrollIntoView({ block: 'nearest' });
}

async function fetchModels(): Promise<void> {
  const baseURL = fields.baseURL.value.trim();
  const apiKey = fields.apiKey.value.trim();
  if (!baseURL) return;

  refreshIcon.classList.add('spinning');
  refreshModels.disabled = true;

  try {
    allModels = await window.settingsAPI.listModels(
      baseURL,
      apiKey,
      fields.endpointType.value as EndpointType
    );
    renderDropdown(fields.model.value);
  } catch {
    // User can still type a model name manually.
  } finally {
    refreshIcon.classList.remove('spinning');
    refreshModels.disabled = false;
  }
}

let markProfileDirtyExternal: () => void = () => {};

export function initProfiles(
  onDirty: () => void,
  onProfileSaved: () => void,
  onProfileSaveError: (message: string) => void
): void {
  markProfileDirtyExternal = () => {
    profileDirtyVersion += 1;
    onDirty();
  };

  profileSelect.addEventListener('change', () => {
    syncFormToActive();
    const profileToSave = { ...getActive() };
    activeId = profileSelect.value;
    renderProfileSelect();
    loadActiveToForm();
    saveActiveProfileOnly(profileToSave, activeId, onProfileSaved, onProfileSaveError);
  });

  addProfileBtn.addEventListener('click', () => {
    syncFormToActive();
    const profile: ConnectionProfile = {
      ...DEFAULT_PROFILE,
      id: genId(),
      name: `Profile ${profiles.length + 1}`
    };
    profiles.push(profile);
    activeId = profile.id;
    renderProfileSelect();
    loadActiveToForm();
    fields.profileName.focus();
    fields.profileName.select();
    markProfileDirtyExternal();
  });

  delProfileBtn.addEventListener('click', () => {
    if (profiles.length <= 1) return;
    const name = getActive()?.name ?? 'this profile';
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    profiles = profiles.filter((p) => p.id !== activeId);
    activeId = profiles[0].id;
    renderProfileSelect();
    loadActiveToForm();
    markProfileDirtyExternal();
  });

  fields.profileName.addEventListener('input', () => {
    const opt = profileSelect.querySelector<HTMLOptionElement>(`option[value="${activeId}"]`);
    if (opt) opt.textContent = fields.profileName.value.trim() || 'Untitled';
  });

  fields.endpointType.addEventListener('change', () => {
    const type = fields.endpointType.value as EndpointType;
    const knownURLs = Object.values(ENDPOINT_DEFAULTS).map((d) => d.baseURL);
    const knownModels = Object.values(ENDPOINT_DEFAULTS).map((d) => d.model);
    if (!fields.baseURL.value.trim() || knownURLs.includes(fields.baseURL.value.trim())) {
      fields.baseURL.value = ENDPOINT_DEFAULTS[type].baseURL;
    }
    if (!fields.model.value.trim() || knownModels.includes(fields.model.value.trim())) {
      fields.model.value = ENDPOINT_DEFAULTS[type].model;
    }
  });

  revealBtn.addEventListener('click', () => {
    const isHidden = fields.apiKey.type === 'password';
    fields.apiKey.type = isHidden ? 'text' : 'password';
    eyeShow.classList.toggle('hidden', isHidden);
    eyeHide.classList.toggle('hidden', !isHidden);
  });

  fields.model.addEventListener('focus', () => {
    if (allModels.length > 0) renderDropdown(fields.model.value);
    else fetchModels();
  });

  fields.model.addEventListener('blur', () => setTimeout(hideDropdown, 120));

  fields.model.addEventListener('input', () => {
    if (allModels.length > 0) renderDropdown(fields.model.value);
  });

  fields.model.addEventListener('keydown', (e) => {
    if (!modelDropdown.classList.contains('open')) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveActive(+1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveActive(-1);
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      const item = modelDropdown.querySelectorAll<HTMLLIElement>('.model-option')[activeIdx];
      if (item) {
        fields.model.value = item.textContent ?? '';
        hideDropdown();
      }
    } else if (e.key === 'Escape') hideDropdown();
  });

  refreshModels.addEventListener('click', () => {
    allModels = [];
    fetchModels();
  });

  for (const el of Object.values(fields)) {
    el.addEventListener('input', markProfileDirtyExternal);
    el.addEventListener('change', markProfileDirtyExternal);
  }
}

export function loadProfiles(s: Settings): void {
  profiles = (s.profiles ?? []).map((p) => ({ ...p }));
  if (profiles.length === 0) profiles = [{ ...DEFAULT_PROFILE, id: genId() }];
  activeId = profiles.some((p) => p.id === s.activeProfileId)
    ? s.activeProfileId
    : profiles[0].id;

  renderProfileSelect();
  loadActiveToForm();
}

export function profilesPatch(): Pick<Settings, 'profiles' | 'activeProfileId'> {
  syncFormToActive();
  return { profiles, activeProfileId: activeId };
}

export function flushProfileSave(): Promise<void> {
  return profileSavePromise;
}

export function markProfileClean(): void {
  profileDirtyVersion += 1;
}

export function bumpProfileDirtyVersion(): void {
  profileDirtyVersion += 1;
}
