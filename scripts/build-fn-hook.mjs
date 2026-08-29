// Compiles native/fn-hook.swift into resources/, where electron-builder picks it
// up as an extra resource. No-op off macOS: the fn key never reaches the OS on
// Windows keyboards, so there is nothing for the helper to watch there.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

if (process.platform !== 'darwin') process.exit(0);

mkdirSync('resources', { recursive: true });
execFileSync('swiftc', ['-O', 'native/fn-hook.swift', '-o', 'resources/fn-hook'], {
  stdio: 'inherit'
});
