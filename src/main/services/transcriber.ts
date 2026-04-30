import { Settings } from '@shared/types';
import { log } from './logger';

export interface TranscribeInput {
  audio: ArrayBuffer;
  mimeType: string;
}

export class Transcriber {
  constructor(private readonly getSettings: () => Settings) {}

  /** Fire-and-forget ping that triggers lazy model loading on the server. */
  warmUp(): void {
    const s = this.getSettings();
    if (!s.warmUpOnRecord || !s.apiKey || !s.baseURL) return;
    this.post(createSilentWav(), 'audio/wav', undefined)
      .then(({ response, elapsed }) => {
        log.info(`[whisper] ← ${response.status} ${response.statusText}  (${elapsed}ms)  0 chars`);
      })
      .catch((err: unknown) => {
        log.warn('[whisper] warm-up network error', err);
      });
  }

  async transcribe(input: TranscribeInput): Promise<string> {
    const s = this.getSettings();
    if (!s.apiKey)  throw new Error('Missing API key. Set it in Settings.');
    if (!s.baseURL) throw new Error('Missing base URL. Set it in Settings.');

    const { response, elapsed } = await this.post(input.audio, input.mimeType, s.language);

    if (!response.ok) {
      const body = await safeText(response);
      log.error(`[whisper] ← ${response.status} ${response.statusText}  (${elapsed}ms)  body: ${body}`);
      throw new Error(`Whisper API ${response.status}: ${body || response.statusText}`);
    }

    const payload = (await response.json()) as { text?: string };
    const text = (payload.text ?? '').trim();

    log.info(`[whisper] ← ${response.status} OK  (${elapsed}ms)  ${text.length} chars`);
    return text;
  }

  /** Shared HTTP plumbing used by both warm-up and transcription. Logs the request. */
  private async post(
    audioData: Uint8Array | ArrayBuffer,
    mimeType: string,
    language: string | undefined
  ): Promise<{ response: Response; elapsed: number }> {
    const s        = this.getSettings();
    const endpoint = `${s.baseURL.replace(/\/$/, '')}/audio/transcriptions`;
    const model    = s.model || 'whisper-1';
    const ext      = mimeToExtension(mimeType);
    const sizeKB   = (audioData.byteLength / 1024).toFixed(1);

    log.info(
      `[whisper] → ${endpoint}` +
      `  model: ${model}  |  lang: ${language || 'auto'}  |  fmt: ${ext}  |  size: ${sizeKB} KB`
    );

    const form = new FormData();
    form.append('file', new Blob([audioData], { type: mimeType }), `audio.${ext}`);
    form.append('model', model);
    if (language) form.append('language', language);
    form.append('response_format', 'json');

    const t0       = Date.now();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${s.apiKey}` },
      body: form
    });

    return { response, elapsed: Date.now() - t0 };
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

/** Generates the smallest valid WAV (1 silent sample) for warm-up pings. */
function createSilentWav(): Uint8Array {
  const sampleRate = 16000;
  const numSamples = 1;            // 1 sample — minimum valid WAV
  const dataSize = numSamples * 2; // 16-bit PCM mono
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
