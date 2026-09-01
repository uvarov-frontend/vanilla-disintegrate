import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

function build(timezone) {
  return new Promise((resolve, reject) => {
    const child = spawn(pnpm, ['run', 'build:library'], {
      cwd: root,
      env: { ...process.env, TZ: timezone },
      stdio: 'inherit',
    });
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
  const builtFiles = (await files(output)).map((file) => [`dist/${file}`, new URL(file, output)]);
  builtFiles.push(['vanilla-disintegrate-iife.zip', new URL('vanilla-disintegrate-iife.zip', root)]);

  return new Map(
    await Promise.all(
      builtFiles.map(async ([name, url]) => {
        const contents = await readFile(url);
        return [name, createHash('sha256').update(contents).digest('hex')];
      }),
    ),
  );
}

await build('UTC');
const first = await checksums();
await build('Pacific/Honolulu');
const second = await checksums();

const changed = [...new Set([...first.keys(), ...second.keys()])].filter(
  (file) => first.get(file) !== second.get(file),
);
if (changed.length > 0) throw new Error(`Build output is not reproducible:\n${changed.join('\n')}`);

console.log(`Verified reproducible output for ${second.size} files.`);
