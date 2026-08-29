import { readFile } from 'node:fs/promises';

import { JSDOM } from 'jsdom';

const full = await import('../dist/index.js');
const esmRuntime = await readFile(new URL('../dist/index.js', import.meta.url), 'utf8');
const packageManifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

if (typeof full.Disintegrator !== 'function') {
  throw new Error('The ESM entry did not expose Disintegrator.');
}
if (!esmRuntime.includes('@zumer/snapdom')) {
  throw new Error('The ESM entry must load SnapDOM through a static import.');
}
if ('./lite' in packageManifest.exports) {
  throw new Error('The removed lite entry is still present in package exports.');
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
