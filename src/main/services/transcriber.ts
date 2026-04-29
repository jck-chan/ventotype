import { Settings } from '@shared/types';

export interface TranscribeInput {
  audio: ArrayBuffer;
  mimeType: string;
}

export class Transcriber {
  constructor(private readonly getSettings: () => Settings) {}

  /** Fire-and-forget ping that triggers lazy model loading on the server. */
  warmUp(): void {
    const settings = this.getSettings();
    if (!settings.warmUpOnRecord || !settings.apiKey || !settings.baseURL) return;
    const endpoint = `${settings.baseURL.replace(/\/$/, '')}/audio/transcriptions`;
    const form = new FormData();
    form.append('file', new Blob([createSilentWav()], { type: 'audio/wav' }), 'warmup.wav');
    form.append('model', settings.model || 'whisper-1');
    form.append('response_format', 'json');
    fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${settings.apiKey}` },
      body: form
    }).catch(() => { /* warm-up is best-effort */ });
  }

  async transcribe(input: TranscribeInput): Promise<string> {
    const settings = this.getSettings();
    if (!settings.apiKey) throw new Error('Missing API key. Set it in Settings.');
    if (!settings.baseURL) throw new Error('Missing base URL. Set it in Settings.');

    const endpoint = `${settings.baseURL.replace(/\/$/, '')}/audio/transcriptions`;
    const extension = mimeToExtension(input.mimeType);

    const form = new FormData();
    const blob = new Blob([input.audio], { type: input.mimeType });
    form.append('file', blob, `dictation.${extension}`);
    form.append('model', settings.model || 'whisper-1');
    if (settings.language) form.append('language', settings.language);
    form.append('response_format', 'json');

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${settings.apiKey}` },
      body: form
    });

    if (!response.ok) {
      const body = await safeText(response);
      throw new Error(`Whisper API ${response.status}: ${body || response.statusText}`);
    }

    const payload = (await response.json()) as { text?: string };
    const text = (payload.text ?? '').trim();
    if (!text) throw new Error('Whisper returned empty transcript.');
    return text;
  }
}

function mimeToExtension(mime: string): string {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  return 'webm';
}

/** Generates 100ms of silence as a minimal valid WAV for warm-up pings. */
function createSilentWav(): Uint8Array {
  const sampleRate = 16000;
  const numSamples = sampleRate / 10; // 100 ms
  const dataSize = numSamples * 2;    // 16-bit PCM mono
  const buf = new Uint8Array(44 + dataSize);
  const view = new DataView(buf.buffer);
  // RIFF header
  buf.set([0x52,0x49,0x46,0x46], 0); // "RIFF"
  view.setUint32(4, 36 + dataSize, true);
  buf.set([0x57,0x41,0x56,0x45], 8); // "WAVE"
  // fmt chunk
  buf.set([0x66,0x6D,0x74,0x20], 12); // "fmt "
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);              // PCM
  view.setUint16(22, 1, true);              // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true);              // block align
  view.setUint16(34, 16, true);             // bits/sample
  // data chunk
  buf.set([0x64,0x61,0x74,0x61], 36); // "data"
  view.setUint32(40, dataSize, true);
  // remaining bytes are zero (silence)
  return buf;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
