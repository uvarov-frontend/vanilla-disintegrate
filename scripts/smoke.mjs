import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

import { JSDOM } from 'jsdom';

const esm = await import('../dist/index.js');
const commonJs = createRequire(import.meta.url)('../dist/index.cjs');

if (typeof esm.Disintegrator !== 'function' || typeof commonJs.Disintegrator !== 'function') {
  throw new Error('ESM or CommonJS entry did not expose Disintegrator.');
}

const dom = new JSDOM('', { runScripts: 'outside-only', url: 'https://cdn.example.com/vanilla-disintegrate/' });
dom.window.eval(await readFile(new URL('../dist/vanilla-disintegrate.iife.min.js', import.meta.url), 'utf8'));
const globalApi = dom.window.VanillaDisintegrate;

if (typeof globalApi?.Disintegrator !== 'function') throw new Error('IIFE entry did not expose Disintegrator.');
if (globalApi.defaultSoundUrl !== 'https://cdn.example.com/vanilla-disintegrate/sounds/disintegrate.mp3') {
  throw new Error(`IIFE sound URL resolved incorrectly: ${String(globalApi.defaultSoundUrl)}`);
}

console.log('ESM, CommonJS, and IIFE entry points loaded successfully.');
