/** How the transcription request is encoded for a given provider. */
export type EndpointType = 'openai-transcribe' | 'openrouter-transcribe' | 'openai-chat';

/** A saved connection to a Whisper-compatible endpoint. */
export interface ConnectionProfile {
  id: string;
  name: string;
  type: EndpointType;
  baseURL: string;
  apiKey: string;
  model: string;
  language: string;
  /**
   * Sent alongside the audio on every request, but means something different per
   * type: on `openai-chat` it's the instruction telling the model to transcribe
   * (empty/absent falls back to `DEFAULT_TRANSCRIPTION_PROMPT`); on the
   * Whisper-style types it's Whisper's own `prompt` param — vocabulary/style
   * bias, not an instruction — so empty there just means "send nothing."
   */
  prompt?: string;
}

export interface AppSettings {
  toggleShortcut: string;
  cancelShortcut: string;
  warmUpOnRecord: boolean;
}

export interface ProfilesData {
  profiles: ConnectionProfile[];
  activeProfileId: string;
}

/** In-memory / IPC view combining app settings and connection profiles. */
export interface Settings extends AppSettings, ProfilesData {}

export const DEFAULT_PROFILE: ConnectionProfile = {
  id: 'default',
  name: 'main',
  type: 'openai-transcribe',
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
  'openai-transcribe':     { baseURL: 'https://api.openai.com/v1', model: 'whisper-1' },
  'openrouter-transcribe': { baseURL: 'https://openrouter.ai/api/v1', model: 'openai/whisper-large-v3' },
  // No default model — any multimodal chat model will do, so leave the pick to the user.
  'openai-chat':           { baseURL: 'https://api.openai.com/v1', model: '' }
};

/** Used by `openai-chat` profiles that leave the prompt field empty. */
export const DEFAULT_TRANSCRIPTION_PROMPT =
`Please accurately transcribe the audio and output only the transcript (can be empty). For unsure part(s), output the sound (eg. IPA, pinyin) in <xxx> format.

Settings { punctuations: true, cleanup: true, correct-grammar: true }
Languages: en, zh, yue, jp, and more
User context: Hong Kong, CS, PolyU, Diving, Piano`;

/**
 * Chat Completions carries audio as a base64 `input_audio` part, and both OpenAI and
 * Gemini reject anything other than wav/mp3 there ("Invalid audio format"). The
 * recorder's native WebM/Opus is fine for the /audio/transcriptions endpoints, so
 * only these profiles pay for the re-encode.
 */
export function requiresWavAudio(type: EndpointType): boolean {
  return type === 'openai-chat';
}

/** Sent to the overlay renderer when recording starts, so it ships audio the endpoint accepts. */
export interface RecordOptions {
  encodeWav: boolean;
}

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

/**
 * The most recent dictation failure. Kept in memory only — the overlay shows
 * errors for a couple of seconds, so Settings holds onto the last one to give
 * the user something to read after the fact. Cleared on app restart.
 */
export interface DictationError {
  message: string;
  /** Epoch ms, so the renderer can show how long ago it happened. */
  at: number;
}

/**
 * Full result of a Playground transcription request. Unlike the production
 * dictation path, this is kept even on a non-2xx response — `raw` and
 * `status` are populated either way — since inspecting exactly what the
 * server sent back is the point of the Playground tab.
 */
export interface PlaygroundTranscribeResult {
  text: string;
  raw: unknown;
  ok: boolean;
  status: number;
  statusText: string;
  endpoint: string;
  elapsedMs: number;
}
