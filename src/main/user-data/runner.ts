import { USER_DATA_MANIFEST_FILE, USER_DATA_VERSION, UserDataManifest } from '@shared/user-data';
import { createMigrationContext } from './context';
import { inferUserDataVersion, readManifest } from './infer-version';
import { storeRelativePath } from './paths';
import { MIGRATIONS } from './migrations';
import type { Migration } from './types';

function validateMigrations(migrations: Migration[]): void {
  for (let i = 0; i < migrations.length; i++) {
    const expected = i + 1;
    const migration = migrations[i];
    if (migration.version !== expected) {
      throw new Error(
        `Migration ${migration.version} is out of sequence (expected version ${expected})`
      );
    }
  }

  if (migrations.length > 0 && migrations[migrations.length - 1].version !== USER_DATA_VERSION) {
    throw new Error(
      `USER_DATA_VERSION (${USER_DATA_VERSION}) does not match latest migration (${migrations[migrations.length - 1].version})`
    );
  }
}

function writeManifest(userDataDir: string, version: number): void {
  const ctx = createMigrationContext(userDataDir, () => {});
  const manifest: UserDataManifest = { version };
  ctx.writeJson(storeRelativePath(USER_DATA_MANIFEST_FILE), manifest);
}

/**
 * Brings everything under the Electron userData directory to USER_DATA_VERSION.
 * Migrations may touch any persisted file (settings, profiles, manifest, etc.).
 */
export function runUserDataMigrations(userDataDir: string): void {
  validateMigrations(MIGRATIONS);

  const ctx = createMigrationContext(userDataDir, (message) => {
    console.log(`[user-data] ${message}`);
  });

  let current = readManifest(userDataDir)?.version ?? inferUserDataVersion(userDataDir);

  if (current > USER_DATA_VERSION) {
    ctx.log(
      `userdata-manifest version ${current} is newer than app (${USER_DATA_VERSION}); skipping migrations`
    );
    return;
  }

  if (current === USER_DATA_VERSION) {
    if (!readManifest(userDataDir)) writeManifest(userDataDir, USER_DATA_VERSION);
    return;
  }

  ctx.log(`migrating user data from v${current} to v${USER_DATA_VERSION}`);

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;

    ctx.log(`running migration ${migration.version}: ${migration.description}`);
    migration.up(ctx);
    current = migration.version;
    writeManifest(userDataDir, current);
  }
}
