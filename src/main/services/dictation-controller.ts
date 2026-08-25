import { EventEmitter } from 'node:events';
import { DictationError, DictationState, RecordOptions } from '@shared/types';
import { Transcriber } from './transcriber';
import { Typer } from './typer';
import { log } from './logger';

type ControllerEvents = {
  stateChanged: (state: DictationState, message?: string) => void;
  errorChanged: (error: DictationError) => void;
  requestRecord: (options: RecordOptions) => void;
  requestStopRecord: () => void;
  requestCancelRecord: () => void;
};

export class DictationController extends EventEmitter {
  private state: DictationState = 'idle';
  private lastError: DictationError | null = null;

  constructor(
    private readonly transcriber: Transcriber,
    private readonly typer: Typer
  ) {
    super();
  }

  get currentState(): DictationState {
    return this.state;
  }

  /** Most recent failure, or null if nothing has failed since launch. */
  get lastDictationError(): DictationError | null {
    return this.lastError;
  }

  /** Dismissed from Settings: forget the failure so reopening the window stays clean. */
  clearLastError(): void {
    this.lastError = null;
  }

  /** Toggle shortcut: idle → recording, recording → stop, everything else ignored. */
  toggle(): void {
    if (this.state === 'idle') {
      this.setState('recording');
      this.transcriber.warmUp();
      this.emit('requestRecord', { encodeWav: this.transcriber.needsWavAudio() });
    } else if (this.state === 'recording') {
      this.emit('requestStopRecord');
    }
  }

  /**
   * Cancel shortcut: discard the current recording — no transcription, back to idle.
   * (Contrast: toggle while recording finishes the take and runs Whisper.)
   */
  cancel(): void {
    if (this.state !== 'recording') return;
    this.emit('requestCancelRecord');
    this.setState('idle');
  }

  async handleAudio(audio: ArrayBuffer, mimeType: string): Promise<void> {
    if (this.state !== 'recording') return;
    this.setState('transcribing');
    try {
      const text = await this.transcriber.transcribe({ audio, mimeType });
      if (!text) { this.setState('idle'); return; }
      this.setState('typing');
      await this.typer.type(text);
      this.setState('idle');
    } catch (err) {
      const message = (err as Error).message || 'Dictation failed.';
      log.error('[dictation]', err);
      this.setState('error', message);
      setTimeout(() => {
        if (this.state === 'error') this.setState('idle');
      }, 2500);
    }
  }

  handleRecordError(message: string): void {
    log.error('[dictation] recorder error:', message);
    this.setState('error', message);
    setTimeout(() => {
      if (this.state === 'error') this.setState('idle');
    }, 2500);
  }

  on<K extends keyof ControllerEvents>(event: K, listener: ControllerEvents[K]): this {
    return super.on(event, listener);
  }

  private setState(next: DictationState, message?: string): void {
    this.state = next;

    // The overlay only shows an error for a couple of seconds, so hold onto it
    // for Settings to display after the fact.
    if (next === 'error' && message) {
      this.lastError = { message, at: Date.now() };
      this.emit('errorChanged', this.lastError);
    }

    this.emit('stateChanged', next, message);
  }
}
