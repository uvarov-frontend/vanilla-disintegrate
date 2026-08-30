import { posix, resolve } from 'node:path';

import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  experimental: {
    renderBuiltUrl(filename, context) {
      if (context.hostType !== 'js' || !filename.endsWith('.mp3')) return;
      // `filename` is relative to outDir, but the reference is emitted into a chunk
      // under `chunks/`, so the URL has to resolve from that chunk's own directory.
      const relative = posix.relative(posix.dirname(context.hostId), filename);
      const url = relative.startsWith('.') ? relative : `./${relative}`;
      return { runtime: `new URL(${JSON.stringify(url)}, import.meta.url).href` };
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
        core: resolve(import.meta.dirname, 'src/core.ts'),
        index: resolve(import.meta.dirname, 'src/index.ts'),
        particles: resolve(import.meta.dirname, 'src/particles.ts'),
        snapdom: resolve(import.meta.dirname, 'src/snapdom.ts'),
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: ['@zumer/snapdom'],
      output: {
        sourcemapExcludeSources: true,
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
