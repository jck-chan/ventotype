import type { TextReplacement } from '@shared/types';
import { newTextReplacement, validateTextReplacements } from '@shared/text-replacements';

const list = document.getElementById('textReplacementList') as HTMLDivElement;
const search = document.getElementById('textReplacementSearch') as HTMLInputElement;
const count = document.getElementById('textReplacementCount') as HTMLSpanElement;
const rowRules = new WeakMap<HTMLElement, TextReplacement>();

function filterRows(): void {
  const query = search.value.trim().toLocaleLowerCase();
  let visible = 0;
  for (const row of list.querySelectorAll<HTMLElement>('.replacement-row')) {
    const [original, replacement] = row.querySelectorAll<HTMLTextAreaElement>('textarea');
    const matches = !query || original.value.toLocaleLowerCase().includes(query) ||
      replacement.value.toLocaleLowerCase().includes(query);
    row.hidden = !matches;
    if (matches) visible++;
  }
  count.textContent = query ? `${visible} of ${list.childElementCount} rules` :
    `${list.childElementCount} rules`;
}

function addRow(rule: TextReplacement, onDirty: () => void): void {
  const row = document.createElement('div');
  row.className = 'replacement-row';
  rowRules.set(row, rule);

  const from = document.createElement('textarea');
  from.rows = 2;
  from.placeholder = 'Text to find';
  from.setAttribute('aria-label', 'Text to find');
  from.value = rule.original;

  const to = document.createElement('textarea');
  to.rows = 2;
  to.placeholder = 'Replace with';
  to.setAttribute('aria-label', 'Replace with');
  to.value = rule.replacement;

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'btn-secondary replacement-remove';
  remove.textContent = '×';
  remove.title = 'Remove rule';
  remove.setAttribute('aria-label', 'Remove rule');
  remove.addEventListener('click', () => {
    row.remove();
    onDirty();
    filterRows();
  });

  from.addEventListener('input', onDirty);
  to.addEventListener('input', onDirty);
  row.append(from, to, remove);
  list.append(row);
}

export function loadTextReplacements(rules: TextReplacement[] = [], onDirty: () => void): void {
  list.replaceChildren();
  for (const rule of rules) addRow(rule, onDirty);
  filterRows();
}

export function textReplacementsPatch(): TextReplacement[] {
  const rules = [...list.querySelectorAll<HTMLElement>('.replacement-row')].map((row) => {
    const [original, replacement] = row.querySelectorAll<HTMLTextAreaElement>('textarea');
    return { ...rowRules.get(row)!, original: original.value, replacement: replacement.value };
  });
  return validateTextReplacements(rules);
}

export function initTextReplacements(
  onDirty: () => void,
  showStatus: (message: string, type: 'ok' | 'err') => void
): void {
  search.addEventListener('input', filterRows);
  document.getElementById('addTextReplacement')?.addEventListener('click', () => {
    search.value = '';
    addRow(newTextReplacement(), onDirty);
    onDirty();
    filterRows();
    list.querySelector<HTMLTextAreaElement>('.replacement-row:last-child textarea')?.focus();
  });

  document.getElementById('importTextReplacements')?.addEventListener('click', async () => {
    try {
      const rules = await window.settingsAPI.importTextReplacements();
      if (!rules) return;
      if (list.childElementCount && !window.confirm('Replace the current text replacement list with the imported rules?')) return;
      loadTextReplacements(rules, onDirty);
      onDirty();
      showStatus(`Imported ${rules.length} rule${rules.length === 1 ? '' : 's'}. Save to apply.`, 'ok');
    } catch (err) {
      showStatus((err as Error).message || 'Import failed.', 'err');
    }
  });

  document.getElementById('exportTextReplacements')?.addEventListener('click', async () => {
    try {
      if (await window.settingsAPI.exportTextReplacements(textReplacementsPatch())) {
        showStatus('Exported text replacements.', 'ok');
      }
    } catch (err) {
      showStatus((err as Error).message || 'Export failed.', 'err');
    }
  });
}
