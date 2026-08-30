import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

function build() {
  return new Promise((resolve, reject) => {
    const child = spawn(pnpm, ['run', 'build'], { cwd: root, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Build exited with code ${code ?? 'unknown'}.`));
    });
  });
}

async function files(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(
    entries.map((entry) => {
      const relative = `${prefix}${entry.name}`;
      return entry.isDirectory() ? files(new URL(`${entry.name}/`, directory), `${relative}/`) : [relative];
    }),
  );
  return paths.flat().sort();
}

async function checksums() {
  return new Map(
    await Promise.all(
      (await files(output)).map(async (file) => {
        const contents = await readFile(new URL(file, output));
        return [file, createHash('sha256').update(contents).digest('hex')];
      }),
    ),
  );
}

await build();
const first = await checksums();
await build();
const second = await checksums();

const changed = [...new Set([...first.keys(), ...second.keys()])].filter(
  (file) => first.get(file) !== second.get(file),
);
if (changed.length > 0) throw new Error(`Build output is not reproducible:\n${changed.join('\n')}`);

console.log(`Verified reproducible output for ${second.size} files.`);
