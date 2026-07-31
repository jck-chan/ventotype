import { OverlayStatePayload, RecordOptions } from '@shared/types';

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
let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let activeMimeType = 'audio/webm';
let recordStartTime = 0;
let recordOptions: RecordOptions = { encodeWav: false };

/** Speech models resample to this anyway, and it keeps the base64 payload small. */
const WAV_SAMPLE_RATE = 16000;

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
  chunks = [];
  recordStartTime = Date.now();
  recordOptions = options ?? { encodeWav: false };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const mimeType = getSupportedMimeType();
    activeMimeType = mimeType;

    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onerror = (e) => {
      window.overlayAPI.sendError((e as ErrorEvent).message ?? 'Recorder error');
    };
    recorder.start(100); // collect chunks every 100ms
  } catch (err) {
    const msg = (err as Error).message || 'Microphone access denied.';
    window.overlayAPI.sendError(msg);
  }
}

/** Stop the mic, build blob, send to main for transcription. */
async function finishRecording(): Promise<void> {
  if (!recorder || recorder.state === 'inactive') return;

  await new Promise<void>((resolve) => {
    recorder!.onstop = () => resolve();
    recorder!.stop();
    recorder!.stream.getTracks().forEach((t) => t.stop());
  });

  let blob = new Blob(chunks, { type: activeMimeType });
  let mimeType = activeMimeType;

  if (recordOptions.encodeWav && !mimeType.includes('wav')) {
    try {
      blob = await encodeAsWav(blob);
      mimeType = 'audio/wav';
    } catch (err) {
      // Ship the raw recording anyway — the endpoint's own error is more useful
      // to the user than swallowing the take.
      console.error('[overlay] WAV re-encode failed', err);
    }
  }

  const buffer = await blob.arrayBuffer();
  const durationMs = Date.now() - recordStartTime;
  window.overlayAPI.sendAudio(buffer, mimeType, durationMs);
  recorder = null;
  chunks = [];
}

/**
 * Re-encodes the recording as 16 kHz mono 16-bit PCM WAV. MediaRecorder can't
 * produce WAV directly, but Chromium can decode its own WebM/Opus, so the audio
 * round-trips through Web Audio for endpoints that only take wav/mp3.
 */
async function encodeAsWav(blob: Blob): Promise<Blob> {
  const decodeCtx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeCtx.decodeAudioData(await blob.arrayBuffer());
  } finally {
    void decodeCtx.close();
  }

  // Rendering into a 1-channel context downmixes and resamples in one pass.
  const frames = Math.max(1, Math.round((decoded.length * WAV_SAMPLE_RATE) / decoded.sampleRate));
  const offline = new OfflineAudioContext(1, frames, WAV_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const samples = (await offline.startRendering()).getChannelData(0);

  const dataSize = samples.length * 2;
  const bytes = new Uint8Array(44 + dataSize);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);                      // PCM
  view.setUint16(22, 1, true);                      // mono
  view.setUint32(24, WAV_SAMPLE_RATE, true);
  view.setUint32(28, WAV_SAMPLE_RATE * 2, true);    // byte rate
  view.setUint16(32, 2, true);                      // block align
  view.setUint16(34, 16, true);                     // bits/sample
  ascii(36, 'data');
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([bytes], { type: 'audio/wav' });
}

/** Stop the mic and discard audio — cancel shortcut; no transcription. */
async function cancelRecording(): Promise<void> {
  if (!recorder || recorder.state === 'inactive') {
    recorder = null;
    chunks = [];
    return;
  }

  await new Promise<void>((resolve) => {
    recorder!.onstop = () => resolve();
    recorder!.stop();
    recorder!.stream.getTracks().forEach((t) => t.stop());
  });

  recorder = null;
  chunks = [];
}

function getSupportedMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4'
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return '';
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
