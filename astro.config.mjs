import mdx from '@astrojs/mdx';
import { unified } from '@astrojs/markdown-remark';
import node from '@astrojs/node';
import { defineConfig } from 'astro/config';

import externalLinks from './docs/src/lib/rehype-external-links.mjs';

export default defineConfig({
  adapter: node({ mode: 'standalone' }),
  build: {
    assets: 'assets',
  },
  integrations: [mdx()],
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'ru', 'zh', 'ko'],
    routing: 'manual',
  },
  markdown: {
    processor: unified({ rehypePlugins: [externalLinks] }),
    shikiConfig: {
      theme: 'github-dark-default',
    },
  },
  outDir: './demo-dist',
  output: 'server',
  publicDir: './docs/public',
  srcDir: './docs/src',
  trailingSlash: 'always',
});
