import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

/**
 * Maximum gzip size in bytes for each built entry, counted together with the
 * local chunks it imports.
 *
 * These are ceilings, not targets. They are meant to catch an accident — a
 * dependency leaking into an entry, or tree shaking breaking — rather than to
 * police ordinary growth, so adding a feature or an asset should never require
 * raising them. The narrower rule that the core entry must not reach SnapDOM is
 * asserted separately in `scripts/smoke.mjs`.
 */
export const bundleBudgets = {
  'dist/index.js': 25 * 1024,
  'dist/snapdom.js': 25 * 1024,
  'dist/vanilla-disintegrate.iife.min.js': 90 * 1024,
};

/**
 * Measures `file` plus every relative `.js` it imports, following the graph
 * recursively and counting each file once.
 *
 * @param {string | URL} file Path relative to the repository root, or a URL.
 * @param {(source: Buffer) => number} measure Size of a single file in bytes.
 * @param {Set<string>} visited Already-counted URLs, to keep cycles finite.
 * @returns {Promise<number>} Total size in bytes.
 */
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

/**
 * Size on disk of an entry and its local chunks.
 *
 * @param {string | URL} file Path relative to the repository root, or a URL.
 * @returns {Promise<number>} Total size in bytes.
 */
export function dependencyRawSize(file) {
  return dependencySize(file, (source) => source.byteLength, new Set());
}

/**
 * Size an entry and its local chunks take on the wire once gzipped. Each file is
 * compressed on its own, which slightly overstates a real multi-file transfer.
 *
 * @param {string | URL} file Path relative to the repository root, or a URL.
 * @returns {Promise<number>} Total compressed size in bytes.
 */
export function dependencyGzipSize(file) {
  return dependencySize(file, (source) => gzipSync(source).byteLength, new Set());
}
