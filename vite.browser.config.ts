import { defineConfig } from 'vite';

export default defineConfig({
  // The fixture server runs alongside Astro, which owns node_modules/.vite.
  // Sharing that cache invalidates dependency URLs in the other server.
  cacheDir: 'node_modules/.vite-browser',
});
