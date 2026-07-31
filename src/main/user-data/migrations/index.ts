import type { Migration } from '../types';
import { baseline } from './001-baseline';
import { renameTranscribeEndpointTypes } from './002-rename-transcribe-endpoint-types';

export const MIGRATIONS: Migration[] = [baseline, renameTranscribeEndpointTypes];
