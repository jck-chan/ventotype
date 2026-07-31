import { shell, systemPreferences } from 'electron';
import { PermissionStatus } from '@shared/permissions';
import { PermissionAdapters } from './types';

// Deep links into System Settings → Privacy & Security. The `Privacy_*` anchors
// have been stable from Mojave through the current macOS.
const PRIVACY_PANE = 'x-apple.systempreferences:com.apple.preference.security';

/** Maps Electron's media-access strings onto our normalised statuses. */
function fromMediaAccessStatus(status: string): PermissionStatus {
  switch (status) {
    case 'granted':
    case 'denied':
    case 'restricted':
    case 'not-determined':
      return status;
    default:
      // Electron also reports 'unknown'; treat it as denied so the UI offers a
      // way forward rather than silently claiming everything is fine.
      return 'denied';
  }
}

export const darwinAdapters: PermissionAdapters = {
  microphone: {
    check: () => fromMediaAccessStatus(systemPreferences.getMediaAccessStatus('microphone')),
    // macOS shows this prompt exactly once. After a denial it resolves false
    // immediately without displaying anything, which is why there is no
    // canRepromptAfterDenial here — the UI falls back to openSettings().
    request: async () => {
      const granted = await systemPreferences.askForMediaAccess('microphone');
      return granted ? 'granted' : 'denied';
    },
    openSettings: async () => {
      await shell.openExternal(`${PRIVACY_PANE}?Privacy_Microphone`);
    }
  },

  accessibility: {
    // Required for the synthetic ⌘V in Typer — without it, transcription
    // succeeds but nothing is ever pasted into the focused app.
    check: () => (systemPreferences.isTrustedAccessibilityClient(false) ? 'granted' : 'denied'),
    // Passing true raises the "grant Accessibility" dialog. Unlike TCC prompts
    // this one can be raised again after a denial, so re-prompting works here.
    request: async () =>
      systemPreferences.isTrustedAccessibilityClient(true) ? 'granted' : 'denied',
    openSettings: async () => {
      await shell.openExternal(`${PRIVACY_PANE}?Privacy_Accessibility`);
    },
    canRepromptAfterDenial: true
  }
};
