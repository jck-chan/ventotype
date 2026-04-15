export interface Settings {
  baseURL: string;
  apiKey: string;
  model: string;
  language: string;
  toggleShortcut: string;
  cancelShortcut: string;
}

export const DEFAULT_SETTINGS: Settings = {
  baseURL: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'whisper-1',
  language: '',
  toggleShortcut: 'Control+H',
  cancelShortcut: 'Control+Shift+H'
};

export type DictationState = 'idle' | 'recording' | 'transcribing' | 'typing' | 'error';

export interface OverlayStatePayload {
  state: DictationState;
  message?: string;
}
