import { defineConfig } from 'vite';

export default defineConfig({
  root: 'demo',
  publicDir: false,
  define: {
    __VANILLA_DISINTEGRATE_MODULE_URL__: 'import.meta.url',
  },
  server: {
    open: true,
  },
  build: {
    outDir: '../demo-dist',
    emptyOutDir: true,
  },
});
