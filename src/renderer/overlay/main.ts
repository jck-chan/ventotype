import { OverlayStatePayload } from '@shared/types';

declare global {
  interface Window {
    overlayAPI: {
      platform: string;
      onStart: (cb: () => void) => void;
      onStop: (cb: () => void) => void;
      onCancel: (cb: () => void) => void;
      onStateChanged: (cb: (payload: OverlayStatePayload) => void) => void;
      sendAudio: (audio: ArrayBuffer, mimeType: string) => void;
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
async function startRecording(): Promise<void> {
  chunks = [];
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

  const blob = new Blob(chunks, { type: activeMimeType });
  const buffer = await blob.arrayBuffer();
  window.overlayAPI.sendAudio(buffer, activeMimeType);
  recorder = null;
  chunks = [];
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
window.overlayAPI.onStart(() => {
  triggerPopIn();
  showIcon('record');
  startRecording().catch((err) =>
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
