import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { TextReplacementSet, TextReplacementSetError } from '@shared/types';
import { validateTextReplacements } from '@shared/text-replacements';
import { readJsonFile, writeJsonAtomic } from '../user-data/json-io';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FILENAME = /^[^\\/<>:"|?*\x00-\x1f.][^\\/<>:"|?*\x00-\x1f]*\.json$/i;

export function validateSetFilename(filename: string): void {
  if (filename.length > 120 || !FILENAME.test(filename) || filename === '.' || filename === '..') {
    throw new Error('Use a JSON filename without path separators or reserved characters.');
  }
}

export function validateTextReplacementSets(value: unknown): TextReplacementSet[] {
  if (!Array.isArray(value) || value.length > 100) {
    throw new Error('Keep at most 100 text replacement rule sets.');
  }
  const ids = new Set<string>();
  const names = new Set<string>();
  return value.map((item) => {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' ||
        !UUID.test(item.id) || typeof item.filename !== 'string') {
      throw new Error('A rule set needs a UUID and JSON filename.');
    }
    validateSetFilename(item.filename);
    const name = item.filename.toLocaleLowerCase();
    if (ids.has(item.id) || names.has(name)) throw new Error('Rule set IDs and filenames must be unique.');
    ids.add(item.id);
    names.add(name);
    if (typeof item.enabled !== 'boolean') throw new Error(`${item.filename} needs an enabled state.`);
    return { id: item.id, filename: item.filename, enabled: item.enabled,
      replacements: validateTextReplacements(item.replacements) };
  });
}

interface MetadataEntry { id: string; enabled: boolean }

export function readTextReplacementSets(
  dir: string,
  metadataPath: string,
  onError: (error: TextReplacementSetError) => void = () => {}
): TextReplacementSet[] {
  mkdirSync(dir, { recursive: true });
  const paths = readdirSync(dir).filter((name) => name.toLowerCase().endsWith('.json')).sort((a, b) =>
    a.localeCompare(b)
  );
  const sets: TextReplacementSet[] = [];
  const ids = new Set<string>();
  const invalidIds = new Set<string>();
  for (const filename of paths) {
    let fileId: unknown;
    try {
      validateSetFilename(filename);
      const path = join(dir, filename);
      if (!lstatSync(path).isFile()) throw new Error('Not a regular JSON file.');
      const parsed = readJsonFile<unknown>(path);
      const data = Array.isArray(parsed) ? { replacements: parsed } : parsed as
        { id?: unknown; replacements?: unknown } | null;
      fileId = data?.id;
      if (!data || !Array.isArray(data.replacements)) {
        throw new Error('Expected a JSON object with a replacements array.');
      }
      const replacements = validateTextReplacements(data.replacements);
      let id = data.id;
      if (typeof id !== 'string' || !UUID.test(id) || ids.has(id)) {
        id = randomUUID();
        writeJsonAtomic(path, { id, replacements });
      }
      ids.add(id as string);
      sets.push({ id: id as string, filename, enabled: true, replacements });
    } catch (error) {
      if (typeof fileId === 'string' && UUID.test(fileId)) invalidIds.add(fileId);
      onError({ filename, message: (error as Error).message });
    }
  }
  const metadata = readJsonFile<{ order?: MetadataEntry[] }>(metadataPath);
  const entries = Array.isArray(metadata?.order) ? metadata.order : [];
  const indexed = new Map(sets.map((set) => [set.id, set]));
  const ordered: TextReplacementSet[] = [];
  for (const entry of entries) {
    const set = indexed.get(entry.id);
    if (!set) continue;
    set.enabled = entry.enabled !== false;
    ordered.push(set);
    indexed.delete(entry.id);
  }
  ordered.push(...indexed.values());
  const validIds = new Set(ordered.map((set) => set.id));
  const retainedInvalid = entries.filter((entry) => invalidIds.has(entry.id) && !validIds.has(entry.id));
  const expectedOrder = [
    ...ordered.map(({ id, enabled }) => ({ id, enabled })),
    ...retainedInvalid
  ];
  if (!metadata || JSON.stringify(entries) !== JSON.stringify(expectedOrder)) {
    writeJsonAtomic(metadataPath, { order: expectedOrder });
  }
  return ordered;
}

export function writeTextReplacementSets(dir: string, metadataPath: string, previous: TextReplacementSet[], next: TextReplacementSet[]): void {
  mkdirSync(dir, { recursive: true });
  for (const set of next) {
    if (existsSync(join(dir, set.filename)) &&
        !previous.some((old) => old.id === set.id && old.filename === set.filename)) {
      throw new Error(`${set.filename} already exists in the rule set folder. Reopen Settings before saving.`);
    }
  }
  // Write additions and edits first, then remove files absent from the new list.
  for (const set of next) {
    const old = previous.find((item) => item.id === set.id);
    if (old && old.filename === set.filename &&
        JSON.stringify(old.replacements) === JSON.stringify(set.replacements)) continue;
    writeJsonAtomic(join(dir, set.filename), {
    id: set.id,
    replacements: set.replacements
    });
  }
  const names = new Set(next.map((set) => set.filename));
  for (const old of previous) {
    if (!names.has(old.filename) && existsSync(join(dir, old.filename))) unlinkSync(join(dir, old.filename));
  }
  const metadata = readJsonFile<{ order?: MetadataEntry[] }>(metadataPath);
  const known = new Set(next.map((set) => set.id));
  const invalidEntries = (Array.isArray(metadata?.order) ? metadata.order : [])
    .filter((entry) => !known.has(entry.id));
  writeJsonAtomic(metadataPath, { order: [
    ...next.map(({ id, enabled }) => ({ id, enabled })), ...invalidEntries
  ] });
}

export function createTextReplacementSet(dir: string, metadataPath: string): void {
  mkdirSync(dir, { recursive: true });
  const existing = readdirSync(dir).map((name) => name.toLocaleLowerCase());
  if (existing.filter((name) => name.endsWith('.json')).length >= 100) {
    throw new Error('Keep at most 100 text replacement rule sets.');
  }
  for (let number = 0; ; number++) {
    const filename = number === 0 ? 'untitled.json' : `untitled ${number}.json`;
    if (existing.includes(filename.toLocaleLowerCase())) continue;
    writeJsonAtomic(join(dir, filename), {
      id: randomUUID(),
      replacements: [{ original: 'Hello world!', replacement: 'Hello world!', isRegex: false }]
    });
    readTextReplacementSets(dir, metadataPath);
    return;
  }
}
