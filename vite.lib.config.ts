import { resolve } from 'node:path';

import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig(({ mode }) => {
  const isCommonJs = mode.endsWith('cjs');
  const isCore = mode.startsWith('core');
  return {
    experimental: {
      renderBuiltUrl(filename, context) {
        if (context.hostType !== 'js' || !filename.endsWith('.mp3')) return;
        const soundPath = JSON.stringify(`./${filename}`);
        return {
          runtime: isCommonJs
            ? `new URL(${soundPath}, typeof document === "undefined" ? "file:///" : document.currentScript?.src || document.baseURI).href`
            : `new URL(${soundPath}, import.meta.url).href`,
        };
      },
    },
    plugins:
      mode !== 'es'
        ? []
        : [
            dts({
              entryRoot: 'src',
              include: ['src'],
              exclude: ['src/**/*.test.ts'],
              insertTypesEntry: true,
            }),
          ],
    build: {
      target: 'es2020',
      emptyOutDir: mode === 'es',
      sourcemap: true,
      minify: 'esbuild',
      lib: {
        entry: resolve(import.meta.dirname, isCore ? 'src/core-entry.ts' : 'src/index.ts'),
        formats: [isCommonJs ? 'cjs' : 'es'],
        fileName: (format) => `${isCore ? 'core' : 'index'}.${format === 'es' ? 'js' : 'cjs'}`,
      },
      rollupOptions: {
        external: ['@zumer/snapdom'],
        output: {
          assetFileNames: (asset) =>
            asset.names.some((name) => name.endsWith('.mp3'))
              ? 'sounds/disintegrate.mp3'
              : 'assets/[name]-[hash][extname]',
          exports: 'named',
        },
      },
    },
  };
});
