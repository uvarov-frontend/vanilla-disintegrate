import { resolve } from 'node:path';

import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  experimental: {
    renderBuiltUrl(filename, context) {
      if (context.hostType !== 'js' || !filename.endsWith('.mp3')) return;
      return { runtime: `new URL(${JSON.stringify(`./${filename}`)}, import.meta.url).href` };
    },
  },
  plugins: [
    dts({
      entryRoot: 'src',
      include: ['src'],
      insertTypesEntry: true,
    }),
  ],
  build: {
    target: 'es2020',
    emptyOutDir: true,
    sourcemap: true,
    minify: 'esbuild',
    lib: {
      entry: {
        index: resolve(import.meta.dirname, 'src/index.ts'),
        snapdom: resolve(import.meta.dirname, 'src/snapdom.ts'),
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: ['@zumer/snapdom'],
      output: {
        assetFileNames: (asset) => {
          const soundName = asset.names.find((name) => name.endsWith('.mp3'));
          return soundName === undefined ? 'assets/[name]-[hash][extname]' : `sounds/${soundName}`;
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        entryFileNames: '[name].js',
      },
    },
  },
});
