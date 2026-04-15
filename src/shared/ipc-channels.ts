export const IPC = {
  Settings: {
    Get: 'settings:get',
    Set: 'settings:set'
  },
  Dictation: {
    Start: 'dictation:start',
    Stop: 'dictation:stop',
    Cancel: 'dictation:cancel',
    AudioBlob: 'dictation:audio-blob',
    StateChanged: 'dictation:state-changed',
    RecordError: 'dictation:record-error'
  },
  Overlay: {
    ShowError: 'overlay:show-error'
  }
} as const;
