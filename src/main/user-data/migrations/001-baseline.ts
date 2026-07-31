import type { Migration } from '../types';

/**
 * Historical no-op. USER_DATA_VERSION was set to 1 — and the manifest started
 * being written at that version — before any real migration existed, so any
 * install that launched during that window already has a manifest claiming
 * version 1 without having actually migrated anything. This placeholder keeps
 * the version sequence honest so migration 2 (the first real one) still runs
 * against those installs instead of being skipped as "already applied."
 */
export const baseline: Migration = {
  version: 1,
  description: 'baseline — manifest system introduced, no schema change',
  up() {
    // Intentionally empty — see comment above.
  }
};
