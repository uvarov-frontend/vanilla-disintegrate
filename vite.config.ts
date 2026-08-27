import { defineConfig } from 'vite';

export default defineConfig({
  root: 'demo',
  publicDir: false,
  server: {
    open: true,
  },
  build: {
    outDir: '../demo-dist',
    emptyOutDir: true,
  },
});
