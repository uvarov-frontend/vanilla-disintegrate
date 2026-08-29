import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

export const bundleBudgets = {
  'dist/index.js': 17 * 1024,
  'dist/vanilla-disintegrate.iife.min.js': 70 * 1024,
};

async function dependencySize(file, measure, visited) {
  const url = file instanceof URL ? file : new URL(`../${file}`, import.meta.url);
  if (visited.has(url.href)) return 0;
  visited.add(url.href);

  const source = await readFile(url);
  let size = measure(source);
  const code = source.toString();
  const imports = code.matchAll(/(?:from\s*|import\s*)["'](\.\/[^"']+\.m?js)["']/g);

  for (const match of imports) {
    const dependency = match[1];
    if (dependency !== undefined) size += await dependencySize(new URL(dependency, url), measure, visited);
  }

  return size;
}

export function dependencyRawSize(file) {
  return dependencySize(file, (source) => source.byteLength, new Set());
}

export function dependencyGzipSize(file) {
  return dependencySize(file, (source) => gzipSync(source).byteLength, new Set());
}
