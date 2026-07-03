export const IPC = {
  Settings: {
    Get: 'settings:get',
    Set: 'settings:set',
    SaveActiveProfile: 'settings:save-active-profile'
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
  },
  Shell: {
    OpenLogFile: 'shell:open-log-file',
    OpenUserDataFolder: 'shell:open-user-data-folder'
  },
  Api: {
    ListModels: 'api:list-models'
  },
  App: {
    GetLoginItem: 'app:get-login-item',
    SetLoginItem: 'app:set-login-item'
  }
} as const;
