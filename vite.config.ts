import { defineConfig } from 'vite';

const base = process.env.VITE_BASE_PATH ?? '/';

export default defineConfig({
  base,
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
