import { readdir, readFile } from 'node:fs/promises';

import { bundleBudgets, dependencyGzipSize, iifeArchiveBudget, soundAssetBudgets } from './bundle-metrics.mjs';

let failed = false;
console.log('Bundle size including local chunks (gzip)');

for (const [file, budget] of Object.entries(bundleBudgets)) {
  const gzip = await dependencyGzipSize(file);
  const status = gzip <= budget ? 'ok' : 'over budget';
  console.log(`${file}: ${(gzip / 1024).toFixed(2)} KiB / ${(budget / 1024).toFixed(2)} KiB (${status})`);
  if (gzip > budget) failed = true;
}

const soundDirectory = new URL('../dist/sounds/', import.meta.url);
const soundFiles = (await readdir(soundDirectory)).filter((file) => file.endsWith('.mp3')).sort();
const soundSizes = await Promise.all(
  soundFiles.map(async (file) => ({ file, bytes: (await readFile(new URL(file, soundDirectory))).byteLength })),
);
const totalSoundBytes = soundSizes.reduce((total, sound) => total + sound.bytes, 0);

console.log('External sound assets (encoded)');
for (const sound of soundSizes) {
  const status = sound.bytes <= soundAssetBudgets.perFile ? 'ok' : 'over budget';
  console.log(
    `dist/sounds/${sound.file}: ${(sound.bytes / 1024).toFixed(2)} KiB / ${(soundAssetBudgets.perFile / 1024).toFixed(2)} KiB (${status})`,
  );
  if (sound.bytes > soundAssetBudgets.perFile) failed = true;
}
const totalSoundStatus = totalSoundBytes <= soundAssetBudgets.total ? 'ok' : 'over budget';
console.log(
  `dist/sounds total: ${(totalSoundBytes / 1024).toFixed(2)} KiB / ${(soundAssetBudgets.total / 1024).toFixed(2)} KiB (${totalSoundStatus})`,
);
if (totalSoundBytes > soundAssetBudgets.total) failed = true;

const iifeArchiveBytes = (await readFile(new URL('../vanilla-disintegrate-iife.zip', import.meta.url))).byteLength;
const iifeArchiveStatus = iifeArchiveBytes <= iifeArchiveBudget ? 'ok' : 'over budget';
console.log('Downloadable example');
console.log(
  `vanilla-disintegrate-iife.zip: ${(iifeArchiveBytes / 1024).toFixed(2)} KiB / ${(iifeArchiveBudget / 1024).toFixed(2)} KiB (${iifeArchiveStatus})`,
);
if (iifeArchiveBytes > iifeArchiveBudget) failed = true;

if (failed) process.exitCode = 1;
