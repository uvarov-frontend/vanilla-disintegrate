import { resolve } from 'node:path';

import { defineConfig } from 'vite';

export default defineConfig({
  experimental: {
    renderBuiltUrl(filename, context) {
      if (context.hostType !== 'js' || !filename.endsWith('.mp3')) return;
      const soundPath = JSON.stringify(`./${filename}`);
      return {
        runtime: `new URL(${soundPath}, typeof document === "undefined" ? "file:///" : document.currentScript?.src || document.baseURI).href`,
      };
    },
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: true,
    minify: 'esbuild',
    lib: {
      entry: resolve(import.meta.dirname, 'src/snapdom.ts'),
      name: 'VanillaDisintegrate',
      formats: ['iife'],
      fileName: () => 'vanilla-disintegrate.iife.min.js',
    },
    rollupOptions: {
      output: {
        assetFileNames: (asset) => {
          const soundName = asset.names.find((name) => name.endsWith('.mp3'));
          return soundName === undefined ? 'assets/[name]-[hash][extname]' : `sounds/${soundName}`;
        },
        exports: 'named',
      },
    },
  },
});
