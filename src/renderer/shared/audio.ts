/** Audio encoding helpers shared by dictation and Playground. */

/** Speech models resample to this anyway, and it keeps the base64 payload small. */
export const AUDIO_SAMPLE_RATE = 16000;

/** Target bitrate for compressed recordings sent to transcription endpoints. */
export const COMPRESSED_AUDIO_BITS_PER_SECOND = 32_000;
export const MP3_BITS_PER_SECOND = 64_000;

/** Resample captured microphone PCM without passing through a lossy codec. */
export async function resampleMono(samples: Float32Array, sourceRate: number): Promise<Float32Array> {
  if (sourceRate === AUDIO_SAMPLE_RATE) return samples;
  const buffer = new AudioBuffer({ length: samples.length, numberOfChannels: 1, sampleRate: sourceRate });
  buffer.copyToChannel(new Float32Array(samples), 0);
  const frames = Math.max(1, Math.round(samples.length * AUDIO_SAMPLE_RATE / sourceRate));
  const offline = new OfflineAudioContext(1, frames, AUDIO_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start();
  return (await offline.startRendering()).getChannelData(0);
}

export function encodeAsWav(samples: Float32Array): Blob {
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
  view.setUint32(24, AUDIO_SAMPLE_RATE, true);
  view.setUint32(28, AUDIO_SAMPLE_RATE * 2, true);  // byte rate
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
export async function encodeAsMp3(samples: Float32Array): Promise<Blob> {
  const { Mp3Encoder } = await import('@breezystack/lamejs');
  const encoder = new Mp3Encoder(1, AUDIO_SAMPLE_RATE, MP3_BITS_PER_SECOND / 1000);
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
