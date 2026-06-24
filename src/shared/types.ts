/** How the transcription request is encoded for a given provider. */
export type EndpointType = 'openai' | 'openrouter';

/** A saved connection to a Whisper-compatible endpoint. */
export interface ConnectionProfile {
  id: string;
  name: string;
  type: EndpointType;
  baseURL: string;
  apiKey: string;
  model: string;
  language: string;
}

export interface Settings {
  profiles: ConnectionProfile[];
  activeProfileId: string;
  toggleShortcut: string;
  cancelShortcut: string;
  warmUpOnRecord: boolean;
}

export const DEFAULT_PROFILE: ConnectionProfile = {
  id: 'default',
  name: 'main',
  type: 'openai',
  baseURL: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'whisper-1',
  language: ''
};

const BASE_SETTINGS: Settings = {
  profiles: [{ ...DEFAULT_PROFILE }],
  activeProfileId: DEFAULT_PROFILE.id,
  toggleShortcut: 'Control+H',
  cancelShortcut: 'Control+Shift+H',
  warmUpOnRecord: false,
};

// Keyed by `process.platform` values. Pure data — no `process` access here so this
// module stays safe to import from the renderer (no Node globals in the isolated world).
const PLATFORM_OVERRIDES: Record<string, Partial<Settings>> = {
  darwin: { toggleShortcut: 'F5', cancelShortcut: 'Shift+F5' }, // consistent with macOS convention of using fn+F5 for dictation
  win32: { toggleShortcut: 'F9', cancelShortcut: 'Shift+F9' },
  linux: { toggleShortcut: 'F9', cancelShortcut: 'Shift+F9' },
};

/** Builds platform-appropriate defaults. Call from the main process with `process.platform`. */
export function defaultSettingsFor(platform: string): Settings {
  return { ...BASE_SETTINGS, ...(PLATFORM_OVERRIDES[platform] ?? {}) };
}

/** Platform-agnostic defaults — safe to import in the renderer. */
export const DEFAULT_SETTINGS: Settings = { ...BASE_SETTINGS };

/** Sensible defaults to seed a freshly-created profile of each type. */
export const ENDPOINT_DEFAULTS: Record<EndpointType, { baseURL: string; model: string }> = {
  openai:     { baseURL: 'https://api.openai.com/v1', model: 'whisper-1' },
  openrouter: { baseURL: 'https://openrouter.ai/api/v1', model: 'openai/whisper-large-v3' }
};

/** Returns the active profile, falling back to the first profile or the built-in default. */
export function activeProfile(s: Settings): ConnectionProfile {
  return (
    s.profiles.find((p) => p.id === s.activeProfileId) ??
    s.profiles[0] ??
    { ...DEFAULT_PROFILE }
  );
}

export type DictationState = 'idle' | 'recording' | 'transcribing' | 'typing' | 'error';

export interface OverlayStatePayload {
  state: DictationState;
  message?: string;
}
