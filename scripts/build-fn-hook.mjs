// Compiles native/fn-hook.swift into resources/, where electron-builder picks it
// up as an extra resource. A dylib rather than an executable: it is loaded into
// the main process, which is the process the user grants Accessibility to.
// No-op off macOS: the fn key never reaches the OS on Windows keyboards.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

if (process.platform !== 'darwin') process.exit(0);

mkdirSync('resources', { recursive: true });
execFileSync(
  'swiftc',
  ['-O', '-emit-library', '-parse-as-library', 'native/fn-hook.swift', '-o', 'resources/fn-hook.dylib'],
  { stdio: 'inherit' }
);
