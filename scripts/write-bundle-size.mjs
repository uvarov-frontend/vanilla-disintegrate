import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { dependencyGzipSize, dependencyRawSize } from './bundle-metrics.mjs';

const target = new URL('../docs/src/generated/bundle-size.json', import.meta.url);
const bundles = {
  esm: 'dist/index.js',
  iife: 'dist/vanilla-disintegrate.iife.min.js',
};
const measured = Object.fromEntries(
  await Promise.all(
    Object.entries(bundles).map(async ([name, file]) => [
      name,
      {
        minifiedBytes: await dependencyRawSize(file),
        gzipBytes: await dependencyGzipSize(file),
      },
    ]),
  ),
);
const snapdomEntry = new URL(import.meta.resolve('@zumer/snapdom'));
const snapdom = {
  minifiedBytes: await dependencyRawSize(snapdomEntry),
  gzipBytes: await dependencyGzipSize(snapdomEntry),
};
const sizes = {
  esm: measured.esm,
  esmWithSnapdom: {
    minifiedBytes: measured.esm.minifiedBytes + snapdom.minifiedBytes,
    gzipBytes: measured.esm.gzipBytes + snapdom.gzipBytes,
  },
  iife: measured.iife,
};
const data = `${JSON.stringify(sizes, null, 2)}\n`;

await mkdir(new URL('.', target), { recursive: true });

let current = '';
try {
  current = await readFile(target, 'utf8');
} catch (error) {
  if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
}

if (current !== data) await writeFile(target, data);
