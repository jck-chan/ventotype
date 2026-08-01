/**
 * Browser-only audio helpers shared by the overlay recorder and the Settings
 * Playground tab. Both need to turn a MediaRecorder take into WAV for
 * endpoints that reject WebM/Opus, and both need to know which mime type the
 * current Chromium build can actually record.
 */

/** Speech models resample to this anyway, and it keeps the base64 payload small. */
export const WAV_SAMPLE_RATE = 16000;

/**
 * Re-encodes a browser-decodable audio blob as 16 kHz mono 16-bit PCM WAV.
 * MediaRecorder can't produce WAV directly, but Chromium can decode its own
 * WebM/Opus (and most other common formats), so the audio round-trips
 * through Web Audio for endpoints that only take wav/mp3.
 */
export async function encodeAsWav(blob: Blob): Promise<Blob> {
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

/** Best MediaRecorder mime type this Chromium build supports, or '' for the UA default. */
export function getSupportedRecordingMimeType(): string {
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

/** Chat-completions endpoints only accept wav/mp3 — anything else needs the WAV round-trip. */
export function needsWavReencode(mimeType: string): boolean {
  return !/wav|mpeg|mp3/i.test(mimeType);
}
