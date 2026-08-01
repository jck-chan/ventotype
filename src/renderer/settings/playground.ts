import { ConnectionProfile, PlaygroundTranscribeResult, requiresWavAudio, Settings } from '@shared/types';
import { encodeAsWav, getSupportedRecordingMimeType, needsWavReencode } from '../shared/audio';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const profileSelect = $<HTMLSelectElement>('playgroundProfile');
const recordBtn = $<HTMLButtonElement>('playgroundRecordBtn');
const recordLabel = $('playgroundRecordLabel');
const browseBtn = $<HTMLButtonElement>('playgroundBrowseBtn');
const dropzone = $<HTMLDivElement>('playgroundDropzone');
const fileInput = $<HTMLInputElement>('playgroundFileInput');
const errorEl = $('playgroundError');
const clipSection = $<HTMLDivElement>('playgroundClip');
const clipName = $('playgroundClipName');
const audioPreview = $<HTMLAudioElement>('playgroundAudioPreview');
const sendBtn = $<HTMLButtonElement>('playgroundSendBtn');
const resultSection = $<HTMLDivElement>('playgroundResult');
const resultStatus = $('playgroundResultStatus');
const resultMeta = $('playgroundResultMeta');
const transcriptEl = $<HTMLTextAreaElement>('playgroundTranscript');
const inspectBtn = $<HTMLButtonElement>('playgroundInspectBtn');
const jsonDialog = $<HTMLDialogElement>('playgroundJsonDialog');
const jsonBody = $('playgroundJsonBody');
const copyJsonBtn = $<HTMLButtonElement>('playgroundCopyJson');
const closeJsonBtn = $<HTMLButtonElement>('playgroundCloseJson');

let profiles: ConnectionProfile[] = [];
let clipBlob: Blob | null = null;
let clipMimeType = '';
let clipObjectUrl: string | null = null;
let lastRaw: unknown = null;

let recorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];
let recordStream: MediaStream | null = null;
let recordMimeType = '';

function showError(message: string): void {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function clearError(): void {
  errorEl.hidden = true;
  errorEl.textContent = '';
}

function setClip(blob: Blob, mimeType: string, label: string): void {
  clipBlob = blob;
  clipMimeType = mimeType;
  clipName.textContent = label;
  if (clipObjectUrl) URL.revokeObjectURL(clipObjectUrl);
  clipObjectUrl = URL.createObjectURL(blob);
  audioPreview.src = clipObjectUrl;
  clipSection.hidden = false;
  resultSection.hidden = true;
  lastRaw = null;
}

function selectedProfile(): ConnectionProfile | undefined {
  return profiles.find((p) => p.id === profileSelect.value);
}

// ── In-app recording ─────────────────────────────────────────────────────────
async function startRecording(): Promise<void> {
  clearError();
  try {
    recordStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (err) {
    showError((err as Error).message || 'Microphone access denied.');
    return;
  }

  recordedChunks = [];
  recordMimeType = getSupportedRecordingMimeType();
  recorder = new MediaRecorder(recordStream, recordMimeType ? { mimeType: recordMimeType } : undefined);
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };
  recorder.onerror = (e) => {
    showError((e as ErrorEvent).message ?? 'Recorder error.');
  };
  recorder.start(100);

  recordBtn.classList.add('recording');
  recordLabel.textContent = 'Stop';
}

async function stopRecording(): Promise<void> {
  if (!recorder || recorder.state === 'inactive') return;

  await new Promise<void>((resolve) => {
    recorder!.onstop = () => resolve();
    recorder!.stop();
  });

  recordStream?.getTracks().forEach((t) => t.stop());
  recordStream = null;
  recordBtn.classList.remove('recording');
  recordLabel.textContent = 'Record';

  const mimeType = recordMimeType || 'audio/webm';
  const blob = new Blob(recordedChunks, { type: mimeType });
  recordedChunks = [];
  recorder = null;

  if (blob.size === 0) {
    showError('No audio captured.');
    return;
  }

  setClip(blob, mimeType, 'In-app recording');
}

function toggleRecording(): void {
  if (recorder && recorder.state !== 'inactive') stopRecording();
  else startRecording();
}

// ── Dropped / picked file ────────────────────────────────────────────────────
/** The OS doesn't always set `File.type` (notably for .flac) — fall back to the extension. */
function guessMimeType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase();
  const byExt: Record<string, string> = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    ogg: 'audio/ogg',
    webm: 'audio/webm',
    flac: 'audio/flac'
  };
  return (ext && byExt[ext]) || 'application/octet-stream';
}

function handleFile(file: File): void {
  clearError();
  setClip(file, guessMimeType(file), file.name);
}

// ── Send to the chosen profile ───────────────────────────────────────────────
async function send(): Promise<void> {
  const profile = selectedProfile();
  if (!profile) {
    showError('Add a profile first, in the Profiles tab.');
    return;
  }
  if (!clipBlob) return;

  clearError();
  sendBtn.disabled = true;
  sendBtn.textContent = 'Transcribing…';
  resultSection.hidden = true;

  try {
    let blob = clipBlob;
    let mimeType = clipMimeType;
    if (requiresWavAudio(profile.type) && needsWavReencode(mimeType)) {
      blob = await encodeAsWav(blob);
      mimeType = 'audio/wav';
    }

    const buffer = await blob.arrayBuffer();
    const result = await window.settingsAPI.playgroundTranscribe(buffer, mimeType, profile.id);
    renderResult(result);
  } catch (err) {
    showError((err as Error).message || 'Request failed.');
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = 'Transcribe';
  }
}

function renderResult(result: PlaygroundTranscribeResult): void {
  lastRaw = result.raw;
  resultSection.hidden = false;
  resultStatus.textContent = `${result.status} ${result.statusText}`.trim();
  resultStatus.className = result.ok ? 'ok' : 'err';
  resultMeta.textContent = `${result.endpoint}  ·  ${result.elapsedMs}ms`;
  transcriptEl.value = result.ok
    ? result.text || '(empty transcript)'
    : typeof result.raw === 'string'
      ? result.raw
      : formatRaw(result.raw);
}

function formatRaw(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  try {
    return JSON.stringify(raw, null, 2);
  } catch {
    return String(raw);
  }
}

export function loadPlaygroundProfiles(s: Settings): void {
  profiles = s.profiles ?? [];
  const previous = profileSelect.value;
  profileSelect.innerHTML = '';

  for (const p of profiles) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    profileSelect.appendChild(opt);
  }

  const keep = profiles.some((p) => p.id === previous) ? previous : s.activeProfileId;
  if (profiles.some((p) => p.id === keep)) profileSelect.value = keep;
}

/**
 * MediaRecorder's WebM/Opus output has no duration in its header (it's a live
 * stream, not a finished file), so Chromium reports `duration: Infinity` until
 * something seeks through the whole blob. Force that scan once metadata loads,
 * then snap back to the start, so the player shows the real length up front
 * instead of only revealing it once playback has been clicked.
 */
function fixDurationDisplay(): void {
  if (Number.isFinite(audioPreview.duration)) return;
  audioPreview.currentTime = 1e101;
  const onTimeUpdate = (): void => {
    audioPreview.removeEventListener('timeupdate', onTimeUpdate);
    audioPreview.currentTime = 0;
  };
  audioPreview.addEventListener('timeupdate', onTimeUpdate);
}

export function initPlayground(): void {
  recordBtn.addEventListener('click', toggleRecording);
  browseBtn.addEventListener('click', () => fileInput.click());
  audioPreview.addEventListener('loadedmetadata', fixDurationDisplay);

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) handleFile(file);
    fileInput.value = '';
  });

  sendBtn.addEventListener('click', send);

  inspectBtn.addEventListener('click', () => {
    jsonBody.textContent = formatRaw(lastRaw);
    jsonDialog.showModal();
  });
  closeJsonBtn.addEventListener('click', () => jsonDialog.close());
  copyJsonBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(formatRaw(lastRaw)).catch(() => {});
  });
}
