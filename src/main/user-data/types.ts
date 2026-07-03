import type { MigrationContext } from './context';

export interface Migration {
  /** Schema version after this migration completes. */
  version: number;
  description: string;
  up(ctx: MigrationContext): void;
}
