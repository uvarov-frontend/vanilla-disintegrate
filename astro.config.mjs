import mdx from '@astrojs/mdx';
import { unified } from '@astrojs/markdown-remark';
import node from '@astrojs/node';
import { defineConfig } from 'astro/config';

import externalLinks from './docs/src/lib/rehype-external-links.mjs';
import tableScroll from './docs/src/lib/rehype-table-scroll.mjs';

export default defineConfig({
  adapter: node({ mode: 'standalone' }),
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
      theme: 'github-dark-default',
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
