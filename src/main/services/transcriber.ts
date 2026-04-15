import { Settings } from '@shared/types';

export interface TranscribeInput {
  audio: ArrayBuffer;
  mimeType: string;
}

export class Transcriber {
  constructor(private readonly getSettings: () => Settings) {}

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

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
