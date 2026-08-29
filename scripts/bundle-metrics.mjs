import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

/*
 * Ceilings, not targets. These exist to catch an accident — a dependency leaking
 * back into the core entry, or tree-shaking breaking — not to police ordinary
 * growth. Adding an asset or a feature should never require touching them; if a
 * number here trips, something is genuinely wrong. The precise invariant that
 * the core stays free of SnapDOM is asserted in scripts/smoke.mjs instead.
 */
export const bundleBudgets = {
  'dist/index.js': 25 * 1024,
  'dist/snapdom.js': 25 * 1024,
  'dist/vanilla-disintegrate.iife.min.js': 90 * 1024,
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
