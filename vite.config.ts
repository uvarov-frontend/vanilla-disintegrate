import { copyFile, mkdir } from 'node:fs/promises';

import { defineConfig } from 'vite';

export default defineConfig({
  root: 'demo',
  publicDir: false,
  define: {
    __VANILLA_DISINTEGRATE_MODULE_URL__: 'import.meta.url',
  },
  plugins: [
    {
      name: 'copy-demo-sound',
      async closeBundle() {
        const directory = new URL('./demo-dist/assets/sounds/', import.meta.url);
        await mkdir(directory, { recursive: true });
        await copyFile(
          new URL('./src/sounds/disintegrate.mp3', import.meta.url),
          new URL('disintegrate.mp3', directory),
        );
      },
    },
  ],
  server: {
    open: true,
  },
  build: {
    outDir: '../demo-dist',
    emptyOutDir: true,
  },
});
