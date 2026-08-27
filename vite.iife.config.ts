import { resolve } from 'node:path';

import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    __VANILLA_DISINTEGRATE_MODULE_URL__:
      '(typeof document === "undefined" ? "file:///" : document.currentScript?.src || document.baseURI)',
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: true,
    minify: 'esbuild',
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      name: 'VanillaDisintegrate',
      formats: ['iife'],
      fileName: () => 'vanilla-disintegrate.iife.min.js',
    },
    rollupOptions: { output: { exports: 'named' } },
  },
});
