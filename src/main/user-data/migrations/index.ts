import type { Migration } from '../types';
import { baseline } from './001-baseline';
import { renameTranscribeEndpointTypes } from './002-rename-transcribe-endpoint-types';
import { mergeOpenRouterTranscribeType } from './003-merge-openrouter-transcribe-type';
import { assignProfileUuids } from './004-assign-profile-uuids';

export const MIGRATIONS: Migration[] = [baseline, renameTranscribeEndpointTypes, mergeOpenRouterTranscribeType, assignProfileUuids];
