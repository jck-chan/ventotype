import {
  PermissionId,
  PermissionState,
  PermissionStatus,
  PERMISSION_IDS,
  isPermissionSatisfied
} from '@shared/permissions';
import { log } from '../logger';
import { darwinAdapters } from './darwin';
import { PermissionAdapter, PermissionAdapters } from './types';

/**
 * Per-platform adapters. Platforms absent from this map — and permissions absent
 * from a platform's adapter set — resolve to `unsupported`, so the UI simply
 * stays quiet rather than showing checks that can never pass.
 *
 * Windows and Linux gate neither microphone capture nor synthetic input for
 * desktop apps today, so they have no entry yet. Adding one is a new file plus
 * a line here — no changes to callers.
 */
const ADAPTERS_BY_PLATFORM: Partial<Record<NodeJS.Platform, PermissionAdapters>> = {
  darwin: darwinAdapters
};

function adapterFor(id: PermissionId): PermissionAdapter | undefined {
  return ADAPTERS_BY_PLATFORM[process.platform]?.[id];
}

function toState(
  id: PermissionId,
  status: PermissionStatus,
  adapter: PermissionAdapter | undefined
): PermissionState {
  const canPrompt =
    !!adapter?.request &&
    (status === 'not-determined' ||
      (status === 'denied' && !!adapter.canRepromptAfterDenial));

  return {
    id,
    status,
    canPrompt,
    // `restricted` is policy-locked, so settings won't help — don't send the
    // user somewhere they can't change anything.
    needsSettings: status === 'denied' && !!adapter?.openSettings
  };
}

export async function checkPermission(id: PermissionId): Promise<PermissionState> {
  const adapter = adapterFor(id);
  if (!adapter) return toState(id, 'unsupported', undefined);

  try {
    return toState(id, await adapter.check(), adapter);
  } catch (err) {
    log.warn(`[permissions] check failed for ${id}`, err);
    return toState(id, 'unsupported', undefined);
  }
}

export function checkPermissions(): Promise<PermissionState[]> {
  return Promise.all(PERMISSION_IDS.map(checkPermission));
}

/**
 * Raises the OS prompt when one is still possible, and re-checks either way so
 * the returned state reflects reality rather than what we hoped happened.
 */
export async function requestPermission(id: PermissionId): Promise<PermissionState> {
  const adapter = adapterFor(id);
  const current = await checkPermission(id);
  if (!adapter?.request || !current.canPrompt) return current;

  try {
    await adapter.request();
  } catch (err) {
    log.warn(`[permissions] request failed for ${id}`, err);
  }
  return checkPermission(id);
}

export async function openPermissionSettings(id: PermissionId): Promise<void> {
  const adapter = adapterFor(id);
  if (!adapter?.openSettings) return;

  try {
    await adapter.openSettings();
  } catch (err) {
    log.warn(`[permissions] could not open settings for ${id}`, err);
  }
}

/**
 * Startup pass: prompts for anything never asked about before. Deliberately does
 * not nag about already-denied permissions — the Settings window handles those,
 * where the user has context and a button to act on.
 */
export async function requestPendingPermissions(): Promise<PermissionState[]> {
  const states = await checkPermissions();
  const results: PermissionState[] = [];

  for (const state of states) {
    results.push(state.status === 'not-determined' ? await requestPermission(state.id) : state);
  }

  const blocked = results.filter((s) => !isPermissionSatisfied(s));
  if (blocked.length) {
    log.warn(`[permissions] not granted: ${blocked.map((s) => `${s.id}=${s.status}`).join(', ')}`);
  }
  return results;
}
