import type { Settings, TextReplacementSet } from '@shared/types';

const setList = document.getElementById('textReplacementSetList') as HTMLDivElement;
const errors = document.getElementById('textReplacementSetErrors') as HTMLParagraphElement;
let sets: TextReplacementSet[] = [];
let loadedRevision = '';
let loadedErrors = '';
let operation: Promise<void> = Promise.resolve();
let dragging = false;

function queue(action: () => Promise<void>, showStatus: (message: string, type: 'ok' | 'err') => void): void {
  operation = operation.then(action).catch((err) => {
    showStatus((err as Error).message || 'Could not update rule sets.', 'err');
  });
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
      const enabled = toggle.checked;
      queue(async () => {
        const latest = await window.settingsAPI.get();
        const updated = latest.textReplacementSets.map((item) =>
          item.id === set.id ? { ...item, enabled } : item);
        const saved = await window.settingsAPI.set({
          textReplacementSets: updated,
          textReplacementSetsRevision: latest.textReplacementSetsRevision
        });
        loadTextReplacements(saved);
      }, reportStatus);
    });
    const track = document.createElement('span');
    track.className = 'toggle-track';
    label.append(toggle, track);
    row.append(grip, name, label);
    return row;
  }));
}

let reportStatus: (message: string, type: 'ok' | 'err') => void = () => {};

export function loadTextReplacements(settings: Settings): void {
  sets = settings.textReplacementSets.map((set) => ({ ...set, replacements: [...set.replacements] }));
  loadedRevision = settings.textReplacementSetsRevision;
  loadedErrors = JSON.stringify(settings.textReplacementSetErrors);
  renderSets();
  errors.hidden = settings.textReplacementSetErrors.length === 0;
  errors.textContent = settings.textReplacementSetErrors.map((error) =>
    `${error.filename}: ${error.message}`
  ).join('\n');
}

export function initTextReplacements(
  showStatus: (message: string, type: 'ok' | 'err') => void
): void {
  reportStatus = showStatus;
  let draggingRow: HTMLElement | null = null;
  setList.addEventListener('pointerdown', (event) => {
    const target = event.target as HTMLElement;
    const row = target.closest<HTMLElement>('.replacement-set-row');
    if (row && target.closest('.replacement-set-grip')) row.draggable = true;
  });
  setList.addEventListener('pointerup', () => {
    if (!draggingRow) {
      for (const row of setList.querySelectorAll<HTMLElement>('.replacement-set-row')) row.draggable = false;
    }
  });
  setList.addEventListener('dragstart', (event) => {
    const row = (event.target as HTMLElement).closest<HTMLElement>('.replacement-set-row');
    if (!row || !row.draggable) return;
    draggingRow = row;
    dragging = true;
    row.classList.add('dragging');
    event.dataTransfer?.setData('text/plain', row.dataset.id ?? '');
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  });
  setList.addEventListener('dragover', (event) => {
    if (!draggingRow) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    const rows = [...setList.querySelectorAll<HTMLElement>('.replacement-set-row:not(.dragging)')];
    const after = rows.find((row) => event.clientY < row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2);
    if (after) setList.insertBefore(draggingRow, after);
    else setList.append(draggingRow);
  });
  setList.addEventListener('drop', (event) => event.preventDefault());
  setList.addEventListener('dragend', () => {
    draggingRow?.classList.remove('dragging');
    draggingRow = null;
    dragging = false;
    for (const row of setList.querySelectorAll<HTMLElement>('.replacement-set-row')) row.draggable = false;
    const ordered = [...setList.querySelectorAll<HTMLElement>('.replacement-set-row')]
      .map((row) => sets.find((set) => set.id === row.dataset.id)!);
    if (ordered.length === sets.length && ordered.some((set, index) => set.id !== sets[index].id)) {
      const ids = ordered.map((set) => set.id);
      queue(async () => {
        const latest = await window.settingsAPI.get();
        const ranks = new Map(ids.map((id, index) => [id, index]));
        const updated = [...latest.textReplacementSets].sort((a, b) =>
          (ranks.get(a.id) ?? ids.length) - (ranks.get(b.id) ?? ids.length));
        const saved = await window.settingsAPI.set({
          textReplacementSets: updated,
          textReplacementSetsRevision: latest.textReplacementSetsRevision
        });
        loadTextReplacements(saved);
      }, showStatus);
    }
    else renderSets();
  });

  document.getElementById('addTextReplacementSet')?.addEventListener('click', () => {
    queue(async () => loadTextReplacements(await window.settingsAPI.createTextReplacementSet()), showStatus);
  });

  window.setInterval(() => {
    if (document.getElementById('replacements-panel')?.hidden || dragging) return;
    queue(async () => {
      const latest = await window.settingsAPI.get();
      if (latest.textReplacementSetsRevision !== loadedRevision ||
          JSON.stringify(latest.textReplacementSetErrors) !== loadedErrors) {
        loadTextReplacements(latest);
      }
    }, showStatus);
  }, 1500);

  document.getElementById('openTextReplacementsFolder')?.addEventListener('click', async () => {
    try {
      const error = await window.settingsAPI.openTextReplacementsFolder();
      if (error) throw new Error(error);
    } catch (err) {
      showStatus((err as Error).message || 'Could not open rule set folder.', 'err');
    }
  });
}
