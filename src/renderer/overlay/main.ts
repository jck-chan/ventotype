import { OverlayStatePayload, RecordOptions } from '@shared/types';
import { getMicrophoneStream } from '../shared/microphone';
import { AudioRecording, startAudioRecording } from '../shared/recording';

declare global {
  interface Window {
    overlayAPI: {
      platform: string;
      onStart: (cb: (options: RecordOptions) => void) => void;
      onStop: (cb: () => void) => void;
      onCancel: (cb: () => void) => void;
      onStateChanged: (cb: (payload: OverlayStatePayload) => void) => void;
      sendAudio: (audio: ArrayBuffer, mimeType: string, durationMs: number) => void;
      sendError: (message: string) => void;
    };
  }
}

document.documentElement.dataset.platform = window.overlayAPI.platform;

// ── Elements ─────────────────────────────────────────────────────────────────
const badge = document.getElementById('badge')!;
const icons: Record<string, HTMLElement | null> = {
  record:  document.getElementById('icon-record'),
  loading: document.getElementById('icon-loading'),
  typing:  document.getElementById('icon-typing'),
  error:   document.getElementById('icon-error')
};

// ── Audio recording state ─────────────────────────────────────────────────────
let recorder: AudioRecording | null = null;
let recordStream: MediaStream | null = null;
let recordStartTime = 0;
let recordOptions: RecordOptions = { audioFormat: 'mp3', useBuiltInMicOnly: true };

function showIcon(name: keyof typeof icons): void {
  for (const [key, el] of Object.entries(icons)) {
    el?.classList.toggle('hidden', key !== name);
  }
}

function triggerPopIn(): void {
  badge.classList.remove('entering');
  // Force reflow so animation re-triggers.
  void badge.offsetWidth;
  badge.classList.add('entering');
}

// ── Recording helpers ─────────────────────────────────────────────────────────
async function startRecording(options: RecordOptions): Promise<void> {
  recordStartTime = Date.now();
  recordOptions = options ?? { audioFormat: 'mp3', useBuiltInMicOnly: true };
  try {
    recordStream = await getMicrophoneStream(recordOptions.useBuiltInMicOnly);
    recorder = await startAudioRecording(recordStream, recordOptions.audioFormat);
  } catch (err) {
    recordStream?.getTracks().forEach((track) => track.stop());
    recordStream = null;
    const msg = (err as Error).message || 'Microphone access denied.';
    window.overlayAPI.sendError(msg);
  }
}

/** Stop the mic, build blob, send to main for transcription. */
async function finishRecording(): Promise<void> {
  if (!recorder) return;
  const active = recorder;
  recorder = null;
  try {
    const blob = await active.stop();
    if (!blob.size) throw new Error('No audio captured.');
    const buffer = await blob.arrayBuffer();
    window.overlayAPI.sendAudio(buffer, blob.type, Date.now() - recordStartTime);
  } finally {
    recordStream?.getTracks().forEach((track) => track.stop());
    recordStream = null;
  }
}

/** Stop the mic and discard audio — cancel shortcut; no transcription. */
async function cancelRecording(): Promise<void> {
  const active = recorder;
  recorder = null;
  try {
    await active?.cancel();
  } finally {
    recordStream?.getTracks().forEach((track) => track.stop());
    recordStream = null;
  }
}

// ── IPC listeners ─────────────────────────────────────────────────────────────
window.overlayAPI.onStart((options) => {
  triggerPopIn();
  showIcon('record');
  startRecording(options).catch((err) =>
    window.overlayAPI.sendError((err as Error).message)
  );
});

window.overlayAPI.onStop(() => {
  finishRecording().catch((err) =>
    window.overlayAPI.sendError((err as Error).message)
  );
});

window.overlayAPI.onCancel(() => {
  cancelRecording().catch((err) =>
    window.overlayAPI.sendError((err as Error).message)
  );
});

window.overlayAPI.onStateChanged((payload) => {
  const { state } = payload;
  switch (state) {
    case 'recording':
      showIcon('record');
      break;
    case 'transcribing':
      showIcon('loading');
      break;
    case 'typing':
      showIcon('typing');
      break;
    case 'error':
      showIcon('error');
      break;
    case 'idle':
      // overlay is hidden by main process; nothing to do here
      break;
  }
});
