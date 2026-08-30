import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import { JSDOM } from 'jsdom';

const full = await import('../dist/index.js');
const core = await import('../dist/core.js');
const particles = await import('../dist/particles.js');
const snapdomEntry = await import('../dist/snapdom.js');
const packageManifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

async function chunkGraph(entry, visited = new Set()) {
  const url = new URL(entry, import.meta.url);
  if (visited.has(url.href)) return '';
  visited.add(url.href);
  const code = await readFile(url, 'utf8');
  let sources = code;
  for (const match of code.matchAll(/(?:from\s*|import\s*)["'](\.[^"']+\.js)["']/g)) {
    sources += await chunkGraph(new URL(match[1], url), visited);
  }
  return sources;
}

if (typeof full.Disintegrator !== 'function') {
  throw new Error('The ESM entry did not expose Disintegrator.');
}
if (typeof core.Disintegrator !== 'function' || typeof core.defineEffect !== 'function') {
  throw new Error('The core entry did not expose Disintegrator and defineEffect.');
}
if (typeof particles.createParticleAnimation !== 'function' || particles.builtInEffects === undefined) {
  throw new Error('The particles entry did not expose the particle renderer and presets.');
}
if (typeof snapdomEntry.Disintegrator !== 'function' || typeof snapdomEntry.createSnapdomCapture !== 'function') {
  throw new Error('The SnapDOM entry did not expose Disintegrator and createSnapdomCapture.');
}
const coreGraph = await chunkGraph('../dist/core.js');
const fullGraph = await chunkGraph('../dist/index.js');
if (coreGraph.includes('@zumer/snapdom') || coreGraph.includes('webgl2') || coreGraph.includes('.mp3')) {
  throw new Error('The core entry must not include SnapDOM, WebGL particles or built-in audio.');
}
if (!fullGraph.includes('webgl2') || !fullGraph.includes('.mp3')) {
  throw new Error('The default entry must include the built-in particle effects and audio.');
}
if (fullGraph.includes('@zumer/snapdom')) {
  throw new Error('The default entry must not reach SnapDOM; it belongs to the ./snapdom entry.');
}
if (!(await chunkGraph('../dist/snapdom.js')).includes('@zumer/snapdom')) {
  throw new Error('The SnapDOM entry must load SnapDOM through a static import.');
}
for (const entry of ['./core', './particles', './snapdom']) {
  if (!(entry in packageManifest.exports)) throw new Error(`${entry} is missing from package exports.`);
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

// A sound URL is written relative to whichever file carries it, and that file is a
// chunk in dist/chunks/ rather than the dist root. Resolve every reference against
// its own module so a path that points nowhere cannot ship again.
async function assertSoundsResolve(entry, visited = new Set()) {
  const url = new URL(entry, import.meta.url);
  if (visited.has(url.href)) return;
  visited.add(url.href);
  const code = await readFile(url, 'utf8');
  for (const [, soundPath] of code.matchAll(/new URL\("(\.[^"]+\.mp3)", import\.meta\.url\)/g)) {
    const resolved = new URL(soundPath, url);
    if (!existsSync(resolved)) {
      throw new Error(`Bundled sound ${soundPath} in ${entry} does not resolve to a file: ${resolved.pathname}`);
    }
  }
  for (const match of code.matchAll(/(?:from\s*|import\s*)["'](\.[^"']+\.js)["']/g)) {
    await assertSoundsResolve(new URL(match[1], url), visited);
  }
}

for (const entry of ['../dist/index.js', '../dist/particles.js', '../dist/snapdom.js']) {
  await assertSoundsResolve(entry);
}

const dom = new JSDOM('', { runScripts: 'outside-only', url: 'https://cdn.example.com/vanilla-disintegrate/' });
dom.window.eval(await readFile(new URL('../dist/vanilla-disintegrate.iife.min.js', import.meta.url), 'utf8'));
if (typeof dom.window.VanillaDisintegrate?.Disintegrator !== 'function') {
  throw new Error('The IIFE entry did not expose Disintegrator.');
}

console.log('ESM and IIFE entry points loaded successfully.');
