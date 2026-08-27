import { copyFile, mkdir } from 'node:fs/promises';

const soundsDirectory = new URL('../dist/sounds/', import.meta.url);
await mkdir(soundsDirectory, { recursive: true });
await copyFile(
  new URL('../src/sounds/disintegrate.mp3', import.meta.url),
  new URL('disintegrate.mp3', soundsDirectory),
);
