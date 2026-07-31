import {
  activeProfile,
  ConnectionProfile,
  DEFAULT_TRANSCRIPTION_PROMPT,
  ENDPOINT_DEFAULTS,
  EndpointType,
  requiresWavAudio,
  Settings
} from '@shared/types';
import { log } from './logger';

export interface TranscribeInput {
  audio: ArrayBuffer;
  mimeType: string;
}

/** Log tag and user-facing name per endpoint type — chat calls aren't Whisper calls. */
const API_LABEL: Record<EndpointType, { tag: string; name: string }> = {
  openai:        { tag: 'whisper', name: 'Whisper API' },
  openrouter:    { tag: 'whisper', name: 'Whisper API' },
  'openai-chat': { tag: 'chat',    name: 'Chat API' }
};

export class Transcriber {
  constructor(private readonly getSettings: () => Settings) {}

  /** Whether the active profile needs the recorder to hand over WAV instead of WebM. */
  needsWavAudio(): boolean {
    return requiresWavAudio(activeProfile(this.getSettings()).type);
  }

  /** Fire-and-forget ping that triggers lazy model loading on the server. */
  warmUp(): void {
    const s = this.getSettings();
    const profile = activeProfile(s);
    if (!s.warmUpOnRecord || !profile.baseURL) return;
    const { tag } = API_LABEL[profile.type];
    this.post(profile, createSilentWav(), 'audio/wav')
      .then(({ response, elapsed }) => {
        log.info(`[${tag}] ← ${response.status} ${response.statusText}  (${elapsed}ms)  0 chars`);
      })
      .catch((err: unknown) => {
        log.warn(`[${tag}] warm-up network error`, err);
      });
  }

  async transcribe(input: TranscribeInput): Promise<string> {
    const profile = activeProfile(this.getSettings());
    if (!profile.baseURL) throw new Error('Missing base URL. Set it in Settings.');
    const { tag, name } = API_LABEL[profile.type];

    const { response, elapsed } = await this.post(profile, input.audio, input.mimeType);

    if (!response.ok) {
      const body = await safeText(response);
      log.error(`[${tag}] ← ${response.status} ${response.statusText}  (${elapsed}ms)  body: ${body}`);
      throw new Error(`${name} ${response.status}: ${body || response.statusText}`);
    }

    const payload = (await response.json()) as TranscriptionPayload;
    const text =
      profile.type === 'openai-chat' ? chatText(payload) : (payload.text ?? '').trim();

    log.info(`[${tag}] ← ${response.status} OK  (${elapsed}ms)  ${text.length} chars`);
    return text;
  }

  /** Shared HTTP plumbing used by both warm-up and transcription. Logs the request. */
  private async post(
    profile: ConnectionProfile,
    audioData: Uint8Array | ArrayBuffer,
    mimeType: string
  ): Promise<{ response: Response; elapsed: number }> {
    const base     = profile.baseURL.replace(/\/$/, '');
    const model    = profile.model || ENDPOINT_DEFAULTS[profile.type].model;
    const language = profile.language || undefined;
    const ext      = mimeToExtension(mimeType);
    const sizeKB   = (audioData.byteLength / 1024).toFixed(1);
    const chat     = profile.type === 'openai-chat';
    const json     = profile.type === 'openrouter';
    const endpoint = chat ? `${base}/chat/completions` : `${base}/audio/transcriptions`;

    log.info(
      `[${API_LABEL[profile.type].tag}] → ${endpoint}` +
      `  model: ${model}  |  lang: ${language || 'auto'}  |  fmt: ${ext}  |  size: ${sizeKB} KB` +
      `  |  mode: ${chat ? 'chat' : json ? 'json' : 'multipart'}`
    );

    const headers: Record<string, string> = {};
    if (profile.apiKey) headers['Authorization'] = `Bearer ${profile.apiKey}`;

    let body: BodyInit;
    if (chat) {
      // Multimodal chat models (Gemini, GPT-4o-audio) have no /audio/transcriptions
      // route at all — the audio rides along as a content part of a normal chat turn
      // and the transcript comes back as the assistant message. The instruction and
      // the audio go in the same user message; a system role isn't universally
      // supported across OpenAI-compatible chat servers.
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: transcriptionPrompt(profile) },
              { type: 'input_audio', input_audio: { data: toBase64(audioData), format: ext } }
            ]
          }
        ]
      });
    } else if (json) {
      // OpenRouter rejects multipart uploads; it expects base64 audio in a JSON body.
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify({
        model,
        input_audio: { data: toBase64(audioData), format: ext },
        ...(language ? { language } : {})
      });
    } else {
      // Other OpenAI-compatible servers (OpenAI, Groq, local) use multipart form-data.
      const form = new FormData();
      form.append('file', new Blob([audioData as BlobPart], { type: mimeType }), `audio.${ext}`);
      form.append('model', model);
      if (language) form.append('language', language);
      form.append('response_format', 'json');
      body = form;
    }

    const t0       = Date.now();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body
    });

    return { response, elapsed: Date.now() - t0 };
  }
}

/** Response shapes of both routes — `text` for transcriptions, `choices` for chat. */
interface TranscriptionPayload {
  text?: string;
  choices?: { message?: { content?: string | ({ text?: string } | string)[] } }[];
}

/** Pulls the assistant's reply out of a Chat Completions response. */
function chatText(payload: TranscriptionPayload): string {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'string' ? part : part?.text ?? ''))
      .join('')
      .trim();
  }
  return '';
}

/**
 * The chat route has no `language` parameter, so the profile's language becomes
 * part of the instruction instead.
 */
function transcriptionPrompt(profile: ConnectionProfile): string {
  const prompt = profile.prompt?.trim() || DEFAULT_TRANSCRIPTION_PROMPT;
  const language = (profile.language ?? '').trim();
  return language
    ? `${prompt}\n\nThe speech is in ${language}; transcribe it in that language.`
    : prompt;
}

function toBase64(data: Uint8Array | ArrayBuffer): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  return Buffer.from(bytes).toString('base64');
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
