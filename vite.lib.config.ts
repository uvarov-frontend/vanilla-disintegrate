import { resolve } from 'node:path';

import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig(({ mode }) => {
  const isCommonJs = mode.endsWith('cjs');
  const isCore = mode.startsWith('core');
  return {
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
    define: {
      __VANILLA_DISINTEGRATE_MODULE_URL__: isCommonJs
        ? '(typeof document === "undefined" ? "file:///" : document.currentScript?.src || document.baseURI)'
        : 'import.meta.url',
    },
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
          exports: 'named',
        },
      },
    },
  };
});
