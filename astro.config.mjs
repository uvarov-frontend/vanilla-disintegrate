import mdx from '@astrojs/mdx';
import { unified } from '@astrojs/markdown-remark';
import node from '@astrojs/node';
import { defineConfig } from 'astro/config';

import externalLinks from './docs/src/lib/rehype-external-links.mjs';
import tableScroll from './docs/src/lib/rehype-table-scroll.mjs';

export default defineConfig({
  adapter: node({ mode: 'standalone' }),
  security: {
    // No Astro Actions/forms in this project; disabled so the PostHog capture proxy
    // (POST with Content-Type: text/plain, which posthog-js uses to avoid CORS preflight)
    // isn't rejected by Astro's origin check before it reaches our middleware.
    checkOrigin: false,
  },
  build: {
    assets: 'assets',
  },
  devToolbar: {
    enabled: false,
  },
  integrations: [mdx()],
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'ru', 'zh', 'ko'],
    routing: 'manual',
  },
  markdown: {
    processor: unified({ rehypePlugins: [externalLinks, tableScroll] }),
    shikiConfig: {
      // Both palettes are emitted as CSS variables and picked in syntax.css, so code
      // blocks follow the theme without re-highlighting on the client.
      themes: { dark: 'github-dark-default', light: 'github-light-default' },
      defaultColor: false,
    },
  },
  outDir: './demo-dist',
  output: 'server',
  publicDir: './docs/public',
  site: 'https://disintegrate.uvarov.tech',
  srcDir: './docs/src',
  trailingSlash: 'always',
  vite: {
    plugins: [
      {
        name: 'bundle-ssr-dependencies',
        apply: 'build',
        config: () => ({ ssr: { noExternal: true } }),
      },
    ],
  },
});
