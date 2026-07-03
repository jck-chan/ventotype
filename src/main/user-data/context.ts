import { existsSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { readJsonFile, writeJsonAtomic } from './json-io';

export interface MigrationContext {
  userDataDir: string;
  readJson(relativePath: string): Record<string, unknown> | null;
  writeJson(relativePath: string, data: unknown): void;
  deleteFile(relativePath: string): void;
  fileExists(relativePath: string): boolean;
  mkdir(relativePath: string): void;
  moveFile(fromRelative: string, toRelative: string): void;
  log(message: string): void;
}

export function createMigrationContext(
  userDataDir: string,
  log: (message: string) => void
): MigrationContext {
  return {
    userDataDir,
    readJson(relativePath) {
      return readJsonFile<Record<string, unknown>>(join(userDataDir, relativePath));
    },
    writeJson(relativePath, data) {
      writeJsonAtomic(join(userDataDir, relativePath), data);
    },
    deleteFile(relativePath) {
      const filePath = join(userDataDir, relativePath);
      if (existsSync(filePath)) unlinkSync(filePath);
    },
    fileExists(relativePath) {
      return existsSync(join(userDataDir, relativePath));
    },
    mkdir(relativePath) {
      mkdirSync(join(userDataDir, relativePath), { recursive: true });
    },
    moveFile(fromRelative, toRelative) {
      const fromPath = join(userDataDir, fromRelative);
      const toPath = join(userDataDir, toRelative);
      if (!existsSync(fromPath)) return;
      mkdirSync(join(toPath, '..'), { recursive: true });
      renameSync(fromPath, toPath);
    },
    log
  };
}
