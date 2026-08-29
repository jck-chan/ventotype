// Compiles the Swift in native/ into resources/, where electron-builder picks
// the results up as extra resources. Dylibs rather than executables: they are
// loaded into the main process, which is the process the user grants
// Accessibility to. No-op off macOS, which has neither an fn key to watch nor
// these APIs to type with.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

if (process.platform !== 'darwin') process.exit(0);

mkdirSync('resources', { recursive: true });
for (const name of ['fn-hook', 'typer']) {
  execFileSync(
    'swiftc',
    ['-O', '-emit-library', '-parse-as-library', `native/${name}.swift`, '-o', `resources/${name}.dylib`],
    { stdio: 'inherit' }
  );
}
