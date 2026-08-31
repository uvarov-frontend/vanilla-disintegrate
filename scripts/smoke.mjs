import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import { JSDOM } from 'jsdom';
import { strFromU8, unzipSync } from 'fflate';

const full = await import('../dist/index.js');
const core = await import('../dist/core.js');
const particles = await import('../dist/particles.js');
const sounds = await import('../dist/sounds.js');
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
try {
  Reflect.construct(full.Disintegrator, []);
  throw new Error('The default entry accepted an instance without a preset or custom effect.');
} catch (error) {
  if (!(error instanceof TypeError) || !error.message.includes('Configure exactly one of preset or effect'))
    throw error;
}
if (
  typeof core.Disintegrator !== 'function' ||
  typeof core.defineEffect !== 'function' ||
  typeof core.definePreset !== 'function'
) {
  throw new Error('The core entry did not expose Disintegrator, defineEffect and definePreset.');
}
if (typeof particles.createParticleAnimation !== 'function' || particles.particlePresets === undefined) {
  throw new Error('The particles entry did not expose the particle renderer and presets.');
}
if (Object.keys(sounds.builtInSounds ?? {}).join(',') !== 'dust,scatter,vapor,wind') {
  throw new Error('The sounds entry did not expose the built-in audio sources.');
}
if (typeof snapdomEntry.Disintegrator !== 'function' || typeof snapdomEntry.createSnapdomCapture !== 'function') {
  throw new Error('The SnapDOM entry did not expose Disintegrator and createSnapdomCapture.');
}
const coreGraph = await chunkGraph('../dist/core.js');
const fullGraph = await chunkGraph('../dist/index.js');
const particlesGraph = await chunkGraph('../dist/particles.js');
if (coreGraph.includes('@zumer/snapdom') || coreGraph.includes('webgl2') || coreGraph.includes('.mp3')) {
  throw new Error('The core entry must not include SnapDOM, WebGL particles or built-in audio.');
}
if (!fullGraph.includes('webgl2') || !fullGraph.includes('.mp3')) {
  throw new Error('The default entry must include the built-in particle effects and audio.');
}
if (particlesGraph.includes('.mp3')) {
  throw new Error('The particles entry must not include independently bundled audio.');
}
if (fullGraph.includes('@zumer/snapdom')) {
  throw new Error('The default entry must not reach SnapDOM; it belongs to the ./snapdom entry.');
}
if (!(await chunkGraph('../dist/snapdom.js')).includes('@zumer/snapdom')) {
  throw new Error('The SnapDOM entry must load SnapDOM through a static import.');
}
for (const entry of ['./core', './particles', './sounds', './snapdom']) {
  if (!(entry in packageManifest.exports)) throw new Error(`${entry} is missing from package exports.`);
}
if (packageManifest.dependencies !== undefined) {
  throw new Error('The core package must stay free of runtime dependencies.');
}
if (packageManifest.peerDependenciesMeta?.['@zumer/snapdom']?.optional !== true) {
  throw new Error('SnapDOM must be declared as an optional peer dependency.');
}
if (!packageManifest.files?.includes('vanilla-disintegrate-iife.zip')) {
  throw new Error('The downloadable IIFE example must be included in the published package.');
}
if (typeof full.defineEffect !== 'function' || 'disintegrate' in full.Disintegrator.prototype) {
  throw new Error('The public effect API does not match the remove/restore lifecycle.');
}
if (Object.keys(full.builtInPresets ?? {}).join(',') !== 'dust,scatter,vapor,wind') {
  throw new Error('The complete built-in preset registry is incomplete.');
}
for (const preset of Object.values(full.builtInPresets)) {
  if (typeof preset.effect?.remove?.animate !== 'function' || typeof preset.effect?.restore?.animate !== 'function') {
    throw new Error('A built-in preset is missing its remove/restore effect pair.');
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

for (const entry of ['../dist/index.js', '../dist/sounds.js', '../dist/snapdom.js']) {
  await assertSoundsResolve(entry);
}

const dom = new JSDOM('', { runScripts: 'outside-only', url: 'https://cdn.example.com/vanilla-disintegrate/' });
dom.window.eval(await readFile(new URL('../dist/vanilla-disintegrate.iife.min.js', import.meta.url), 'utf8'));
if (typeof dom.window.VanillaDisintegrate?.Disintegrator !== 'function') {
  throw new Error('The IIFE entry did not expose Disintegrator.');
}

const archive = unzipSync(await readFile(new URL('../vanilla-disintegrate-iife.zip', import.meta.url)));
const archiveRoot = 'vanilla-disintegrate/';
const expectedArchiveFiles = [
  'LICENSE',
  'README.md',
  'SOUND_LICENSE.md',
  'THIRD_PARTY_NOTICES.md',
  'index.html',
  'sounds/dust.mp3',
  'sounds/scatter.mp3',
  'sounds/vapor.mp3',
  'sounds/wind.mp3',
  'vanilla-disintegrate.iife.min.js',
].map((file) => `${archiveRoot}${file}`);

if (Object.keys(archive).sort().join('\n') !== expectedArchiveFiles.sort().join('\n')) {
  throw new Error('vanilla-disintegrate-iife.zip does not contain the expected minimal IIFE example.');
}

const archivedHtml = strFromU8(archive[`${archiveRoot}index.html`]);
if (
  !archivedHtml.includes('./vanilla-disintegrate.iife.min.js') ||
  !archivedHtml.includes("preset: 'dust'") ||
  !archivedHtml.includes('effects.register(card)')
) {
  throw new Error('The archived HTML does not load and configure the local IIFE build.');
}

for (const file of [
  'vanilla-disintegrate.iife.min.js',
  ...expectedArchiveFiles.filter((name) => name.includes('/sounds/')).map((name) => name.slice(archiveRoot.length)),
]) {
  const source = await readFile(new URL(`../dist/${file}`, import.meta.url));
  if (!Buffer.from(archive[`${archiveRoot}${file}`]).equals(source)) {
    throw new Error(`The archived ${file} does not match the current build output.`);
  }
}

console.log('ESM and IIFE entry points loaded successfully.');
