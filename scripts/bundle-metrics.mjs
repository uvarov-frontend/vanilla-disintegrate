import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

/**
 * Maximum gzip size in bytes for each built entry, counted together with the
 * local chunks it imports.
 *
 * These are ceilings, not targets. They are meant to catch an accident — a
 * dependency leaking into an entry, or tree shaking breaking — rather than to
 * police ordinary growth, so they are sized to sit a few KiB above the real
 * figures. Once genuine growth eats that headroom, raise the ceiling in its own
 * commit rather than trimming a feature to fit. The narrower rule that the core
 * entry must not reach SnapDOM is asserted separately in `scripts/smoke.mjs`.
 */
export const bundleBudgets = {
  'dist/core.js': 19 * 1024,
  'dist/index.js': 28 * 1024,
  'dist/particles.js': 12 * 1024,
  'dist/sounds.js': 4 * 1024,
  'dist/snapdom.js': 31 * 1024,
  'dist/vanilla-disintegrate.iife.min.js': 90 * 1024,
};

/** Encoded audio stays external to JavaScript, so it needs an independent transfer budget. */
export const soundAssetBudgets = {
  total: 160 * 1024,
  perFile: 64 * 1024,
};

/** Downloadable IIFE starter, including the library, example, licenses, and encoded audio. */
export const iifeArchiveBudget = 256 * 1024;

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
