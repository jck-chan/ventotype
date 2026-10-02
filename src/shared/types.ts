/** How the transcription request is encoded for a given provider. */
export type EndpointType = 'openai-transcribe' | 'openai-chat';

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
   * type: on `openai-chat` it's the system message carrying the transcription
   * rules (empty/absent falls back to `DEFAULT_TRANSCRIPTION_PROMPT`); on the
   * `openai-transcribe` it's Whisper's own `prompt` param — vocabulary/style
   * bias, not an instruction — so empty there just means "send nothing."
   */
  prompt?: string;
  /**
   * `openai-chat` only: the user turn that rides along with the audio. A system
   * message is read as background rules and plenty of models won't act on a task
   * stated only there, so the actual "do it now" cue belongs in a human message.
   * Empty/absent falls back to `DEFAULT_CHAT_EXECUTION_MESSAGE`.
   */
  executionMessage?: string;
  /** Applied in order to the final transcript before typing or copying. */
  regexReplacements?: ProfileRegexReplacement[];
}

export interface ProfileRegexReplacement {
  pattern: string;
  replacement: string;
}

export interface AppSettings {
  toggleShortcut: string;
  cancelShortcut: string;
  audioFormat: 'wav' | 'webm';
  useBuiltInMicOnly: boolean;
  warmUpOnRecord: boolean;
  /**
   * Leave the transcript on the clipboard as well as typing it. Off by default,
   * so dictating never costs the user whatever they had copied. Linux pastes to
   * type at all, so there it decides whether the clipboard is put back
   * afterwards rather than whether it's used.
   */
  copyToClipboard: boolean;
}

export interface TextReplacement {
  original: string;
  replacement: string;
  isRegex?: boolean;
}

export interface TextReplacementSet {
  id: string;
  filename: string;
  enabled: boolean;
  replacements: TextReplacement[];
}

export interface TextReplacementSetError {
  filename: string;
  message: string;
}

export interface ProfilesData {
  profiles: ConnectionProfile[];
  activeProfileId: string;
}

/** In-memory / IPC view combining app settings and connection profiles. */
export interface Settings extends AppSettings, ProfilesData {
  textReplacementSets: TextReplacementSet[];
  textReplacementSetErrors: TextReplacementSetError[];
  /** Guards Settings saves against overwriting rule files edited outside the app. */
  textReplacementSetsRevision: string;
}

export const DEFAULT_PROFILE: ConnectionProfile = {
  id: globalThis.crypto.randomUUID(),
  name: 'main',
  type: 'openai-transcribe',
  baseURL: '',
  apiKey: '',
  model: 'whisper-1',
  language: '',
  regexReplacements: []
};

const BASE_SETTINGS: Settings = {
  profiles: [{ ...DEFAULT_PROFILE }],
  activeProfileId: DEFAULT_PROFILE.id,
  toggleShortcut: 'Control+H',
  cancelShortcut: 'Control+Shift+H',
  audioFormat: 'webm',
  useBuiltInMicOnly: true,
  warmUpOnRecord: false,
  copyToClipboard: false,
  textReplacementSets: [],
  textReplacementSetErrors: [],
  textReplacementSetsRevision: '',
};

// Keyed by `process.platform` values. Pure data — no `process` access here so this
// module stays safe to import from the renderer (no Node globals in the isolated world).
const PLATFORM_OVERRIDES: Record<string, Partial<Settings>> = {
  // fn+F5 is the macOS dictation convention. No cancel binding: Esc already
  // cancels a take in flight, so spending a second shortcut on it buys nothing.
  darwin: { toggleShortcut: 'F5', cancelShortcut: '' },
  win32: { toggleShortcut: 'F9', cancelShortcut: 'Shift+F9' },
  linux: { toggleShortcut: 'F9', cancelShortcut: 'Shift+F9' },
};

/** Builds platform-appropriate defaults. Call from the main process with `process.platform`. */
export function defaultSettingsFor(platform: string): Settings {
  return { ...BASE_SETTINGS, ...(PLATFORM_OVERRIDES[platform] ?? {}) };
}

/** Platform-agnostic defaults — safe to import in the renderer. */
export const DEFAULT_SETTINGS: Settings = { ...BASE_SETTINGS };

/** Model fallbacks for profiles that leave the model field empty. */
export const DEFAULT_MODELS: Record<EndpointType, string> = {
  'openai-transcribe':     'whisper-1',
  // No default model — any multimodal chat model will do, so leave the pick to the user.
  'openai-chat':           ''
};

/** Used by `openai-chat` profiles that leave the prompt field empty. */
export const DEFAULT_TRANSCRIPTION_PROMPT =
`## Task
Please accurately transcribe the audio and output the transcript wrapped by two <|t|> tags (can be empty).
For unsure part(s), wrap them with < and > tag.
Please perform the task according to the following settings.

## Settings
languages: Any
punctuations: true
clean-up: true
correct-grammar: true
user context: Hong Kong, CS, PolyU, Diving, Piano
user dictionary: `;

/**
 * Used by `openai-chat` profiles that leave the execution message empty. Deliberately
 * bare — the rules live in the system prompt, so this only has to tell the model
 * the turn is its cue to produce the result.
 */
export const DEFAULT_CHAT_EXECUTION_MESSAGE = 'Please output the result.';

export interface RecordOptions {
  encodeWav: boolean;
  useBuiltInMicOnly: boolean;
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
