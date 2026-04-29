import { EventEmitter } from 'node:events';
import { DictationState } from '@shared/types';
import { Transcriber } from './transcriber';
import { Typer } from './typer';

type ControllerEvents = {
  stateChanged: (state: DictationState, message?: string) => void;
  requestRecord: () => void;
  requestStopRecord: () => void;
  requestCancelRecord: () => void;
};

export class DictationController extends EventEmitter {
  private state: DictationState = 'idle';

  constructor(
    private readonly transcriber: Transcriber,
    private readonly typer: Typer
  ) {
    super();
  }

  get currentState(): DictationState {
    return this.state;
  }

  /** Toggle shortcut: idle → recording, recording → stop, everything else ignored. */
  toggle(): void {
    if (this.state === 'idle') {
      this.setState('recording');
      this.transcriber.warmUp();
      this.emit('requestRecord');
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
      this.setState('typing');
      await this.typer.type(text);
      this.setState('idle');
    } catch (err) {
      const message = (err as Error).message || 'Dictation failed.';
      console.error('[dictation]', message);
      this.setState('error', message);
      setTimeout(() => {
        if (this.state === 'error') this.setState('idle');
      }, 2500);
    }
  }

  handleRecordError(message: string): void {
    console.error('[dictation] recorder error:', message);
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
    this.emit('stateChanged', next, message);
  }
}
