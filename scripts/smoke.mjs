import { readFile } from 'node:fs/promises';

import { JSDOM } from 'jsdom';

const full = await import('../dist/index.js');
const snapdomEntry = await import('../dist/snapdom.js');
const packageManifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

async function chunkGraph(entry) {
  const url = new URL(entry, import.meta.url);
  const code = await readFile(url, 'utf8');
  let sources = code;
  for (const match of code.matchAll(/from\s*["'](\.[^"']+\.js)["']/g)) {
    sources += await readFile(new URL(match[1], url), 'utf8');
  }
  return sources;
}

if (typeof full.Disintegrator !== 'function') {
  throw new Error('The ESM entry did not expose Disintegrator.');
}
if (typeof snapdomEntry.Disintegrator !== 'function' || typeof snapdomEntry.createSnapdomCapture !== 'function') {
  throw new Error('The SnapDOM entry did not expose Disintegrator and createSnapdomCapture.');
}
if ((await chunkGraph('../dist/index.js')).includes('@zumer/snapdom')) {
  throw new Error('The core entry must not reach SnapDOM; it belongs to the ./snapdom entry.');
}
if (!(await chunkGraph('../dist/snapdom.js')).includes('@zumer/snapdom')) {
  throw new Error('The SnapDOM entry must load SnapDOM through a static import.');
}
if (!('./snapdom' in packageManifest.exports)) {
  throw new Error('The ./snapdom entry is missing from package exports.');
}
if (packageManifest.dependencies !== undefined) {
  throw new Error('The core package must stay free of runtime dependencies.');
}
if (packageManifest.peerDependenciesMeta?.['@zumer/snapdom']?.optional !== true) {
  throw new Error('SnapDOM must be declared as an optional peer dependency.');
}
if (typeof full.defineEffect !== 'function' || 'disintegrate' in full.Disintegrator.prototype) {
  throw new Error('The public effect API does not match the remove/restore lifecycle.');
}
if (Object.keys(full.builtInEffects).join(',') !== 'dust,vapor,scatter,wind') {
  throw new Error('The built-in effect registry is incomplete.');
}
for (const effect of Object.values(full.builtInEffects)) {
  if (typeof effect.remove?.animate !== 'function' || typeof effect.restore?.animate !== 'function') {
    throw new Error('A built-in effect is missing its remove/restore pair.');
  }
}

const dom = new JSDOM('', { runScripts: 'outside-only', url: 'https://cdn.example.com/vanilla-disintegrate/' });
dom.window.eval(await readFile(new URL('../dist/vanilla-disintegrate.iife.min.js', import.meta.url), 'utf8'));
if (typeof dom.window.VanillaDisintegrate?.Disintegrator !== 'function') {
  throw new Error('The IIFE entry did not expose Disintegrator.');
}

console.log('ESM and IIFE entry points loaded successfully.');
