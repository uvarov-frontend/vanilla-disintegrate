import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const budgets = {
  'dist/core.js': 8_000,
  'dist/index.js': 10_000,
  'dist/vanilla-disintegrate.iife.min.js': 62_000,
};

let failed = false;
console.log('Bundle size (gzip)');

for (const [file, budget] of Object.entries(budgets)) {
  const source = await readFile(new URL(`../${file}`, import.meta.url));
  const gzip = gzipSync(source).byteLength;
  const status = gzip <= budget ? 'ok' : 'over budget';
  console.log(`${file}: ${(gzip / 1024).toFixed(2)} kB / ${(budget / 1024).toFixed(2)} kB (${status})`);
  if (gzip > budget) failed = true;
}

if (failed) process.exitCode = 1;
