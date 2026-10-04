/**
 * Runs the whole provisioning sequence in dependency order.
 *
 *   npm run provision
 *
 * Every step is idempotent, so this is safe to re-run — it is the intended way
 * to bring a drifted stack back in line with what the repo declares, and the way
 * to stand the whole thing up in a fresh stack.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const STEPS = [
  ['01-provision-stack.mjs', 'environment, Live Preview, tokens, content model'],
  ['02-provision-studio.mjs', 'compositions content type + Studio project'],
  ['03-seed-content.mjs', 'assets, entries, publishing'],
  ['04-author-sections.mjs', 'the fourteen Sections + their thumbnails'],
  ['05-author-templates.mjs', 'the three Templates'],
  ['06-verify.mjs', 'the eight-point handover gate'],
];

const run = (file) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(HERE, file)], { stdio: 'inherit' });
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${file} exited ${code}`)),
    );
  });

for (const [i, [file, what]] of STEPS.entries()) {
  console.log(`\n\x1b[1m\x1b[7m  Step ${i + 1}/${STEPS.length}  \x1b[0m \x1b[1m${what}\x1b[0m`);
  await run(file);
}

console.log('\n\x1b[32m\x1b[1mProvisioning complete.\x1b[0m Run `npm run dev` and open Studio.\n');
