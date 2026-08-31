import { readFile, readdir, writeFile } from 'node:fs/promises';

import { zipSync } from 'fflate';

const root = new URL('../', import.meta.url);
const example = new URL('examples/iife/', root);
const dist = new URL('dist/', root);
const archive = new URL('vanilla-disintegrate-iife.zip', root);
const archiveRoot = 'vanilla-disintegrate';
// ZIP stores local calendar fields without a timezone. Constructing local
// midnight keeps the archive byte-for-byte identical in every build timezone.
const fixedTimestamp = new Date(1980, 0, 1, 0, 0, 0);
const fileOptions = { attrs: 0o644 << 16, os: 3 };

const files = [
  ['index.html', new URL('index.html', example)],
  ['README.md', new URL('README.md', example)],
  ['vanilla-disintegrate.iife.min.js', new URL('vanilla-disintegrate.iife.min.js', dist)],
  ['LICENSE', new URL('LICENSE', root)],
  ['THIRD_PARTY_NOTICES.md', new URL('THIRD_PARTY_NOTICES.md', root)],
  ['SOUND_LICENSE.md', new URL('SOUND_LICENSE.md', root)],
];

const soundDirectory = new URL('sounds/', dist);
for (const sound of (await readdir(soundDirectory)).filter((file) => file.endsWith('.mp3')).sort()) {
  files.push([`sounds/${sound}`, new URL(sound, soundDirectory)]);
}

const entries = Object.fromEntries(
  await Promise.all(
    files.map(async ([name, source]) => {
      const level = name.endsWith('.mp3') ? 0 : 9;
      return [`${archiveRoot}/${name}`, [await readFile(source), { ...fileOptions, level }]];
    }),
  ),
);

const contents = zipSync(entries, {
  ...fileOptions,
  level: 9,
  mtime: fixedTimestamp,
});

await writeFile(archive, contents);
console.log(`Built vanilla-disintegrate-iife.zip (${contents.byteLength} bytes).`);
