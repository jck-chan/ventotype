import type { TextReplacement } from '@shared/types';
import { validateTextReplacements } from '@shared/text-replacements';

const list = document.getElementById('textReplacementList') as HTMLDivElement;

function addRow(rule: TextReplacement, onDirty: () => void): void {
  const row = document.createElement('div');
  row.className = 'replacement-row';

  const from = document.createElement('textarea');
  from.rows = 2;
  from.placeholder = 'Text to find';
  from.setAttribute('aria-label', 'Text to find');
  from.value = rule.from;

  const to = document.createElement('textarea');
  to.rows = 2;
  to.placeholder = 'Replace with';
  to.setAttribute('aria-label', 'Replace with');
  to.value = rule.to;

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'btn-secondary replacement-remove';
  remove.textContent = '×';
  remove.title = 'Remove rule';
  remove.setAttribute('aria-label', 'Remove rule');
  remove.addEventListener('click', () => {
    row.remove();
    onDirty();
  });

  from.addEventListener('input', onDirty);
  to.addEventListener('input', onDirty);
  row.append(from, to, remove);
  list.append(row);
}

export function loadTextReplacements(rules: TextReplacement[] = [], onDirty: () => void): void {
  list.replaceChildren();
  for (const rule of rules) addRow(rule, onDirty);
}

export function textReplacementsPatch(): TextReplacement[] {
  const rules = [...list.querySelectorAll<HTMLElement>('.replacement-row')].map((row) => {
    const [from, to] = row.querySelectorAll<HTMLTextAreaElement>('textarea');
    return { from: from.value, to: to.value };
  });
  return validateTextReplacements(rules);
}

export function initTextReplacements(
  onDirty: () => void,
  showStatus: (message: string, type: 'ok' | 'err') => void
): void {
  document.getElementById('addTextReplacement')?.addEventListener('click', () => {
    addRow({ from: '', to: '' }, onDirty);
    onDirty();
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
