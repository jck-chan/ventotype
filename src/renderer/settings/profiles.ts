import {
  ConnectionProfile,
  DEFAULT_PROFILE,
  DEFAULT_TRANSCRIPTION_PROMPT,
  EndpointType,
  ENDPOINT_DEFAULTS,
  Settings
} from '@shared/types';

const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const fields = {
  endpointType: $<HTMLSelectElement>('endpointType'),
  baseURL: $<HTMLInputElement>('baseURL'),
  apiKey: $<HTMLInputElement>('apiKey'),
  model: $<HTMLInputElement>('model'),
  language: $<HTMLInputElement>('language'),
  prompt: $<HTMLTextAreaElement>('prompt')
};

export type ProfileFieldId = keyof typeof fields;

export function isProfileField(fieldId: string): fieldId is ProfileFieldId {
  return fieldId in fields;
}

const promptHint = $('promptHint');
const profilePicker = $('profilePicker');
const profileTrigger = $<HTMLButtonElement>('profileTrigger');
const profileTriggerLabel = $('profileTriggerLabel');
const profileDropdown = $<HTMLUListElement>('profileDropdown');
const addProfileBtn = $<HTMLButtonElement>('addProfile');
const delProfileBtn = $<HTMLButtonElement>('deleteProfile');
const renameBtn = $<HTMLButtonElement>('renameProfile');
const renameDialog = $<HTMLDialogElement>('renameDialog');
const renameInput = $<HTMLInputElement>('renameInput');
const renameCancelBtn = $<HTMLButtonElement>('renameCancel');
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
  p.type = fields.endpointType.value as EndpointType;
  p.baseURL = fields.baseURL.value.trim();
  p.apiKey = fields.apiKey.value.trim();
  p.model = fields.model.value.trim() || ENDPOINT_DEFAULTS[p.type].model;
  p.language = fields.language.value.trim();
  p.prompt = fields.prompt.value.trim();
}

function loadActiveToForm(): void {
  const p = getActive();
  if (!p) return;
  fields.endpointType.value = p.type;
  fields.baseURL.value = p.baseURL;
  fields.apiKey.value = p.apiKey;
  fields.model.value = p.model;
  fields.language.value = p.language;
  fields.prompt.value = p.prompt ?? '';
  syncPromptGuidance();
  allModels = [];
  hideDropdown();
}

/**
 * The prompt field is shared by every endpoint type but means something
 * different on each: an instruction to transcribe on chat-completions
 * profiles, or Whisper's own vocabulary/style-bias prompt on the Whisper-style
 * types (which has no built-in default, unlike the chat instruction).
 */
function syncPromptGuidance(): void {
  const isChat = fields.endpointType.value === 'openai-chat';
  fields.prompt.placeholder = isChat ? DEFAULT_TRANSCRIPTION_PROMPT : '';
  promptHint.textContent = isChat
    ? 'Sent with the audio on every request. Leave empty to use the built-in prompt.'
    : 'Optional vocabulary hint for Whisper — proper nouns, acronyms, or jargon likely to appear. Leave empty to send none.';
}

const GRIP_SVG =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
  '<path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

const CHECK_SVG =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
  '<path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.5" ' +
  'stroke-linecap="round" stroke-linejoin="round"/></svg>';

function renderProfileList(): void {
  profileDropdown.innerHTML = '';

  for (const p of profiles) {
    const li = document.createElement('li');
    li.className = p.id === activeId ? 'profile-option active' : 'profile-option';
    li.dataset.id = p.id;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', String(p.id === activeId));

    const grip = document.createElement('span');
    grip.className = 'profile-grip';
    grip.title = 'Drag to reorder';
    grip.innerHTML = GRIP_SVG;

    // textContent, not innerHTML — profile names are free-form user input.
    const name = document.createElement('span');
    name.className = 'profile-option-name';
    name.textContent = p.name;

    const check = document.createElement('span');
    check.className = 'profile-check';
    check.innerHTML = CHECK_SVG;

    li.append(grip, name, check);
    profileDropdown.appendChild(li);
  }

  profileTriggerLabel.textContent = getActive()?.name ?? '';
  delProfileBtn.disabled = profiles.length <= 1;
}

function openProfileDropdown(): void {
  profileDropdown.classList.add('open');
  profileTrigger.setAttribute('aria-expanded', 'true');
}

function closeProfileDropdown(): void {
  profileDropdown.classList.remove('open');
  profileTrigger.setAttribute('aria-expanded', 'false');
}

function isProfileDropdownOpen(): boolean {
  return profileDropdown.classList.contains('open');
}

function openRenameDialog(): void {
  const p = getActive();
  if (!p) return;
  renameInput.value = p.name;
  renameDialog.showModal();
  renameInput.select();
}

/**
 * Drag-to-reorder for the profile rows. The DOM is the source of truth while a
 * drag is in flight — rows are moved with `insertBefore` rather than re-rendered,
 * since replacing the dragged node mid-drag cancels the drag. The `profiles`
 * array is brought back in sync on `dragend`.
 */
function initProfileReorder(): void {
  let dragging: HTMLLIElement | null = null;

  // Rows are only draggable while the pointer went down on the handle, so text
  // selection and plain clicks elsewhere in the row behave normally.
  profileDropdown.addEventListener('pointerdown', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLLIElement>('.profile-option');
    if (row && (e.target as HTMLElement).closest('.profile-grip')) row.draggable = true;
  });

  profileDropdown.addEventListener('dragstart', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLLIElement>('.profile-option');
    if (!row) return;
    dragging = row;
    row.classList.add('dragging');
    e.dataTransfer?.setData('text/plain', row.dataset.id ?? '');
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  });

  profileDropdown.addEventListener('dragover', (e) => {
    if (!dragging) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

    const after = rowAfterPointer(e.clientY);
    if (after === dragging) return;
    if (after) profileDropdown.insertBefore(dragging, after);
    else profileDropdown.appendChild(dragging);
  });

  // Without this the browser treats the drop as a navigation and animates the
  // row flying back to its origin.
  profileDropdown.addEventListener('drop', (e) => e.preventDefault());

  // A press on the handle that never became a drag would otherwise leave the row
  // draggable, making the whole row a drag target afterwards.
  profileDropdown.addEventListener('pointerup', () => {
    if (dragging) return;
    for (const row of profileDropdown.querySelectorAll<HTMLLIElement>('.profile-option')) {
      row.draggable = false;
    }
  });

  profileDropdown.addEventListener('dragend', () => {
    dragging?.classList.remove('dragging');
    dragging = null;
    for (const row of profileDropdown.querySelectorAll<HTMLLIElement>('.profile-option')) {
      row.draggable = false;
    }
    commitOrderFromDom();
  });
}

/** First row whose midpoint is below the pointer — i.e. the drop insertion point. */
function rowAfterPointer(clientY: number): HTMLLIElement | null {
  const rows = profileDropdown.querySelectorAll<HTMLLIElement>('.profile-option:not(.dragging)');
  for (const row of rows) {
    const box = row.getBoundingClientRect();
    if (clientY < box.top + box.height / 2) return row;
  }
  return null;
}

/** Reorders `profiles` to match the row order left behind by a drag. */
function commitOrderFromDom(): void {
  const reordered: ConnectionProfile[] = [];
  for (const row of profileDropdown.querySelectorAll<HTMLLIElement>('.profile-option')) {
    const profile = profiles.find((p) => p.id === row.dataset.id);
    if (profile) reordered.push(profile);
  }

  // Bail on any mismatch rather than persisting a list that lost a profile.
  if (reordered.length !== profiles.length) {
    renderProfileList();
    return;
  }
  if (reordered.every((p, i) => p.id === profiles[i].id)) return;

  profiles = reordered;
  markProfileDirtyExternal();
}

function saveActiveProfileOnly(
  profile: ConnectionProfile,
  activeProfileId: string,
  onSaved: () => void,
  onError: (message: string) => void
): void {
  const savedDirtyVersion = profileDirtyVersion;
  profileTrigger.disabled = true;

  const run = async (): Promise<void> => {
    try {
      await window.settingsAPI.saveActiveProfile(profile, activeProfileId);
      if (profileDirtyVersion === savedDirtyVersion) onSaved();
    } catch (err) {
      onError((err as Error).message ?? 'Failed to save profile.');
      console.error(err);
    } finally {
      profileTrigger.disabled = false;
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

  profileTrigger.addEventListener('click', () => {
    if (isProfileDropdownOpen()) closeProfileDropdown();
    else openProfileDropdown();
  });

  const switchTo = (id: string): void => {
    if (id === activeId) return;
    syncFormToActive();
    const profileToSave = { ...getActive() };
    activeId = id;
    renderProfileList();
    loadActiveToForm();
    saveActiveProfileOnly(profileToSave, activeId, onProfileSaved, onProfileSaveError);
  };

  profileDropdown.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    // The handle is for dragging; a click that lands on it shouldn't switch profile.
    if (target.closest('.profile-grip')) return;

    const id = target.closest<HTMLLIElement>('.profile-option')?.dataset.id;
    if (!id) return;

    closeProfileDropdown();
    switchTo(id);
  });

  // Arrow keys step through profiles the way a focused native <select> did.
  profileTrigger.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const i = profiles.findIndex((p) => p.id === activeId);
    const next = profiles[i + (e.key === 'ArrowDown' ? 1 : -1)];
    if (next) switchTo(next.id);
  });

  document.addEventListener('mousedown', (e) => {
    if (isProfileDropdownOpen() && !profilePicker.contains(e.target as Node)) {
      closeProfileDropdown();
    }
  });

  profilePicker.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isProfileDropdownOpen()) {
      closeProfileDropdown();
      profileTrigger.focus();
    }
  });

  initProfileReorder();

  addProfileBtn.addEventListener('click', () => {
    syncFormToActive();
    const profile: ConnectionProfile = {
      ...DEFAULT_PROFILE,
      id: genId(),
      name: `Profile ${profiles.length + 1}`
    };
    profiles.push(profile);
    activeId = profile.id;
    renderProfileList();
    loadActiveToForm();
    markProfileDirtyExternal();
    openRenameDialog();
  });

  delProfileBtn.addEventListener('click', () => {
    if (profiles.length <= 1) return;
    const name = getActive()?.name ?? 'this profile';
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    profiles = profiles.filter((p) => p.id !== activeId);
    activeId = profiles[0].id;
    renderProfileList();
    loadActiveToForm();
    markProfileDirtyExternal();
  });

  renameBtn.addEventListener('click', openRenameDialog);
  renameCancelBtn.addEventListener('click', () => renameDialog.close());

  // <form method="dialog"> closes the dialog on submit and sets returnValue to
  // the clicked submitter's `value` — Escape or the Cancel button leave it empty,
  // so only an explicit Save is committed here.
  renameDialog.addEventListener('close', () => {
    if (renameDialog.returnValue !== 'save') return;
    const p = getActive();
    if (!p) return;
    p.name = renameInput.value.trim() || 'Untitled';
    renderProfileList();
    markProfileDirtyExternal();
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
    allModels = [];
    hideDropdown();
    syncPromptGuidance();
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

  renderProfileList();
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
