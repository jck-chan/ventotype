export interface Settings {
  baseURL: string;
  apiKey: string;
  model: string;
  language: string;
  startShortcut: string;
  stopShortcut: string;
}

export const DEFAULT_SETTINGS: Settings = {
  baseURL: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'whisper-1',
  language: '',
  startShortcut: 'CommandOrControl+Shift+D',
  stopShortcut: 'CommandOrControl+Shift+.'
};

export type DictationState = 'idle' | 'recording' | 'transcribing' | 'typing' | 'error';

export interface OverlayStatePayload {
  state: DictationState;
  message?: string;
}
