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
  /** Live only while a transcription request is in flight, so cancel can abort it. */
  private transcribeAbort: AbortController | null = null;

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
   * Cancel shortcut: drop the take and go back to idle. While recording that
   * means discarding the audio before it's ever sent; while transcribing it
   * aborts the request in flight, so a slow endpoint doesn't have to be waited
   * out. (Contrast: toggle while recording finishes the take and transcribes it.)
   * Typing is left alone — by then the text is already going into the app.
   */
  cancel(): void {
    if (this.state === 'recording') {
      this.emit('requestCancelRecord');
      this.setState('idle');
    } else if (this.state === 'transcribing') {
      log.info('[dictation] transcription cancelled');
      this.transcribeAbort?.abort();
      this.setState('idle');
    }
  }

  async handleAudio(audio: ArrayBuffer, mimeType: string): Promise<void> {
    if (this.state !== 'recording') return;
    this.setState('transcribing');
    const abort = new AbortController();
    this.transcribeAbort = abort;
    try {
      const text = await this.transcriber.transcribe({ audio, mimeType }, abort.signal);
      // A cancel that landed while the reply was on the wire: cancel() already
      // put us back to idle, so don't type what came back.
      if (abort.signal.aborted) return;
      if (!text) { this.setState('idle'); return; }
      this.setState('typing');
      await this.typer.type(text);
      this.setState('idle');
    } catch (err) {
      if (abort.signal.aborted) return; // cancelled on purpose — not a failure to report
      const message = (err as Error).message || 'Dictation failed.';
      log.error('[dictation]', err);
      this.setState('error', message);
      setTimeout(() => {
        if (this.state === 'error') this.setState('idle');
      }, 2500);
    } finally {
      this.transcribeAbort = null;
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
