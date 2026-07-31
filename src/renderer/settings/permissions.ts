import {
  PermissionState,
  PermissionStatus,
  PERMISSION_META,
  isPermissionSatisfied
} from '@shared/permissions';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const section = $('permissionsSection');
const list = $('permissionList');

const STATUS_LABEL: Record<PermissionStatus, string> = {
  granted: 'Granted',
  denied: 'Not granted',
  restricted: 'Blocked by policy',
  'not-determined': 'Not requested',
  unsupported: 'Not required'
};

let busy = false;

function buildRow(state: PermissionState): HTMLElement {
  const meta = PERMISSION_META[state.id];
  const satisfied = isPermissionSatisfied(state);

  const row = document.createElement('div');
  row.className = 'toggle-row';

  const label = document.createElement('div');
  label.className = 'toggle-label';
  const name = document.createElement('span');
  name.textContent = meta.label;
  const why = document.createElement('small');
  why.textContent = meta.why;
  label.append(name, why);

  const actions = document.createElement('div');
  actions.className = 'permission-actions';

  const badge = document.createElement('span');
  badge.className = `permission-status ${satisfied ? 'ok' : 'warn'}`;
  badge.textContent = STATUS_LABEL[state.status];
  actions.append(badge);

  // A prompt is only offered when the OS will actually show one; otherwise the
  // user is sent to the settings pane, which is the only thing that still works.
  if (state.canPrompt) {
    actions.append(actionButton('Grant', () => window.settingsAPI.requestPermission(state.id)));
  }
  if (state.needsSettings) {
    actions.append(
      actionButton('Open Settings', () => window.settingsAPI.openPermissionSettings(state.id))
    );
  }

  row.append(label, actions);
  return row;
}

function actionButton(text: string, run: () => Promise<unknown>): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'btn-secondary';
  btn.textContent = text;
  btn.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    btn.disabled = true;
    try {
      await run();
      await refreshPermissions();
    } catch (err) {
      console.error('[permissions] action failed', err);
    } finally {
      busy = false;
      btn.disabled = false;
    }
  });
  return btn;
}

function render(states: PermissionState[]): void {
  // Permissions this platform doesn't gate would only be noise.
  const relevant = states.filter((s) => s.status !== 'unsupported');

  section.hidden = relevant.length === 0;
  list.innerHTML = '';
  for (const state of relevant) list.append(buildRow(state));
}

export async function refreshPermissions(): Promise<void> {
  try {
    render(await window.settingsAPI.getPermissions());
  } catch (err) {
    console.error('[permissions] refresh failed', err);
  }
}

export function initPermissions(): void {
  // The user grants permissions in System Settings, then comes back — refreshing
  // on focus is what makes the status update without a restart.
  window.addEventListener('focus', () => {
    void refreshPermissions();
  });

  void refreshPermissions();
}
