/**
 * Browser-only audio helpers shared by the overlay recorder and the Settings
 * Playground tab. Both need to turn a MediaRecorder take into MP3 or WAV for
 * endpoints that reject WebM/Opus, and both need to know which mime type the
 * current Chromium build can actually record.
 */

/** Speech models resample to this anyway, and it keeps the base64 payload small. */
export const WAV_SAMPLE_RATE = 16000;

/** Target bitrate for compressed recordings sent to transcription endpoints. */
export const COMPRESSED_AUDIO_BITS_PER_SECOND = 32_000;
export const MP3_BITS_PER_SECOND = 64_000;

/** Decode a MediaRecorder blob and resample it to 16 kHz mono. */
async function decodeMonoSamples(blob: Blob): Promise<Float32Array> {
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
  return (await offline.startRendering()).getChannelData(0);
}

export async function encodeAsWav(blob: Blob): Promise<Blob> {
  const samples = await decodeMonoSamples(blob);

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

/** Encode a recording as 16 kHz mono MP3 for broadly compatible, small uploads. */
export async function encodeAsMp3(blob: Blob): Promise<Blob> {
  const samples = await decodeMonoSamples(blob);
  const { Mp3Encoder } = await import('@breezystack/lamejs');
  const encoder = new Mp3Encoder(1, WAV_SAMPLE_RATE, MP3_BITS_PER_SECOND / 1000);
  const chunks: BlobPart[] = [];
  const frameSize = 1152;

  for (let offset = 0; offset < samples.length; offset += frameSize) {
    const frame = samples.subarray(offset, offset + frameSize);
    const pcm = new Int16Array(frame.length);
    for (let i = 0; i < frame.length; i++) {
      const sample = Math.max(-1, Math.min(1, frame[i]));
      pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    const encoded = encoder.encodeBuffer(pcm);
    if (encoded.length) chunks.push(new Uint8Array(encoded));
  }

  const finalChunk = encoder.flush();
  if (finalChunk.length) chunks.push(new Uint8Array(finalChunk));
  return new Blob(chunks, { type: 'audio/mpeg' });
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
