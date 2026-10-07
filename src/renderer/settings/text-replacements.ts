import type { Settings, TextReplacementSet } from '@shared/types';

const setList = document.getElementById('textReplacementSetList') as HTMLDivElement;
const errors = document.getElementById('textReplacementSetErrors') as HTMLParagraphElement;
let sets: TextReplacementSet[] = [];
let unavailableFilenames = new Set<string>();
let loadedRevision = '';
let markDirty: () => void = () => {};

function nextUntitledFilename(): string {
  for (let number = 0; ; number++) {
    const filename = number === 0 ? 'untitled.json' : `untitled ${number}.json`;
    if (!unavailableFilenames.has(filename)) return filename;
  }
}

function renderSets(): void {
  setList.replaceChildren(...sets.map((set) => {
    const row = document.createElement('div');
    row.className = 'replacement-set-row';
    row.setAttribute('role', 'listitem');
    row.dataset.id = set.id;

    const grip = document.createElement('span');
    grip.className = 'replacement-set-grip';
    grip.textContent = '⠿';
    grip.title = `Drag to reorder ${set.filename}`;
    grip.setAttribute('aria-label', `Drag to reorder ${set.filename}`);

    const name = document.createElement('span');
    name.className = 'replacement-set-name';
    name.textContent = set.filename;

    const label = document.createElement('label');
    label.className = 'toggle replacement-set-enabled';
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = set.enabled;
    toggle.setAttribute('aria-label', `Enable ${set.filename}`);
    toggle.addEventListener('change', () => {
      set.enabled = toggle.checked;
      markDirty();
    });
    const track = document.createElement('span');
    track.className = 'toggle-track';
    label.append(toggle, track);
    row.append(grip, name, label);
    return row;
  }));
}

export function loadTextReplacements(settings: Settings, onDirty: () => void): void {
  markDirty = onDirty;
  sets = settings.textReplacementSets.map((set) => ({ ...set, replacements: [...set.replacements] }));
  unavailableFilenames = new Set([
    ...sets.map((set) => set.filename.toLocaleLowerCase()),
    ...settings.textReplacementSetErrors.map((error) => error.filename.toLocaleLowerCase())
  ]);
  loadedRevision = settings.textReplacementSetsRevision;
  renderSets();
  errors.hidden = settings.textReplacementSetErrors.length === 0;
  errors.textContent = settings.textReplacementSetErrors.map((error) =>
    `${error.filename}: ${error.message}`
  ).join('\n');
}

export function textReplacementSetsPatch(): Pick<Settings, 'textReplacementSets' | 'textReplacementSetsRevision'> {
  return { textReplacementSets: sets, textReplacementSetsRevision: loadedRevision };
}

export function markTextReplacementSetsSaved(settings: Settings): void {
  loadedRevision = settings.textReplacementSetsRevision;
}

export function initTextReplacements(
  onDirty: () => void,
  showStatus: (message: string, type: 'ok' | 'err') => void
): void {
  let dragging: HTMLElement | null = null;
  setList.addEventListener('pointerdown', (event) => {
    const target = event.target as HTMLElement;
    const row = target.closest<HTMLElement>('.replacement-set-row');
    if (row && target.closest('.replacement-set-grip')) row.draggable = true;
  });
  setList.addEventListener('pointerup', () => {
    if (!dragging) {
      for (const row of setList.querySelectorAll<HTMLElement>('.replacement-set-row')) row.draggable = false;
    }
  });
  setList.addEventListener('dragstart', (event) => {
    const row = (event.target as HTMLElement).closest<HTMLElement>('.replacement-set-row');
    if (!row || !row.draggable) return;
    dragging = row;
    row.classList.add('dragging');
    event.dataTransfer?.setData('text/plain', row.dataset.id ?? '');
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  });
  setList.addEventListener('dragover', (event) => {
    if (!dragging) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    const rows = [...setList.querySelectorAll<HTMLElement>('.replacement-set-row:not(.dragging)')];
    const after = rows.find((row) => event.clientY < row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2);
    if (after) setList.insertBefore(dragging, after);
    else setList.append(dragging);
  });
  setList.addEventListener('drop', (event) => event.preventDefault());
  setList.addEventListener('dragend', () => {
    dragging?.classList.remove('dragging');
    dragging = null;
    for (const row of setList.querySelectorAll<HTMLElement>('.replacement-set-row')) row.draggable = false;
    const ordered = [...setList.querySelectorAll<HTMLElement>('.replacement-set-row')]
      .map((row) => sets.find((set) => set.id === row.dataset.id)!);
    if (ordered.length === sets.length && ordered.some((set, index) => set.id !== sets[index].id)) {
      sets = ordered;
      onDirty();
    }
    renderSets();
  });

  document.getElementById('addTextReplacementSet')?.addEventListener('click', () => {
    if (sets.length >= 100) {
      showStatus('Keep at most 100 text replacement rule sets.', 'err');
      return;
    }
    const filename = nextUntitledFilename();
    sets.push({ id: crypto.randomUUID(), filename, enabled: true, replacements: [] });
    unavailableFilenames.add(filename.toLocaleLowerCase());
    renderSets();
    onDirty();
  });

  document.getElementById('openTextReplacementsFolder')?.addEventListener('click', async () => {
    try {
      const error = await window.settingsAPI.openTextReplacementsFolder();
      if (error) throw new Error(error);
    } catch (err) {
      showStatus((err as Error).message || 'Could not open rule set folder.', 'err');
    }
  });
}
