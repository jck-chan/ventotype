import type { AppSettings } from '@shared/types';
import { COMPRESSED_AUDIO_BITS_PER_SECOND, encodeAsMp3, encodeAsWav, getSupportedRecordingMimeType, resampleMono } from './audio';

export interface AudioRecording {
  stop(): Promise<Blob>;
  cancel(): Promise<void>;
}

/** Encode each format from microphone audio, never from another encoded file. */
export async function startAudioRecording(stream: MediaStream, format: AppSettings['audioFormat']): Promise<AudioRecording> {
  if (format === 'webm') {
    const mimeType = getSupportedRecordingMimeType();
    const recorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      audioBitsPerSecond: COMPRESSED_AUDIO_BITS_PER_SECOND
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.start(100);
    const stop = async (): Promise<void> => {
      if (recorder.state === 'inactive') return;
      await new Promise<void>((resolve, reject) => {
        recorder.onstop = () => resolve();
        recorder.onerror = () => reject(new Error('Recorder error.'));
        recorder.stop();
      });
    };
    return {
      async stop() {
        await stop();
        return new Blob(chunks, { type: recorder.mimeType || mimeType });
      },
      cancel: stop
    };
  }

  const context = new AudioContext();
  try {
    await context.audioWorklet.addModule(new URL('./pcm-capture.worklet.js', import.meta.url).href);
    const source = context.createMediaStreamSource(stream);
    const capture = new AudioWorkletNode(context, 'pcm-capture');
    const chunks: Float32Array[] = [];
    let complete: (() => void) | undefined;
    capture.port.onmessage = (event: MessageEvent<Float32Array | 'done'>) => {
      if (event.data === 'done') complete?.();
      else chunks.push(event.data);
    };
    source.connect(capture);
    capture.connect(context.destination); // The processor outputs silence.
    await context.resume();

    const close = async (): Promise<void> => {
      source.disconnect();
      capture.disconnect();
      capture.port.close();
      await context.close();
    };

    return {
      async stop() {
        try {
          source.disconnect();
          await new Promise<void>((resolve) => {
            complete = resolve;
            capture.port.postMessage('flush');
          });
          const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
          if (!length) throw new Error('No audio captured.');
          const samples = new Float32Array(length);
          let offset = 0;
          for (const chunk of chunks) {
            samples.set(chunk, offset);
            offset += chunk.length;
          }
          const mono = await resampleMono(samples, context.sampleRate);
          return format === 'wav' ? encodeAsWav(mono) : encodeAsMp3(mono);
        } finally {
          await close();
        }
      },
      cancel: close
    };
  } catch (error) {
    await context.close();
    throw error;
  }
}
