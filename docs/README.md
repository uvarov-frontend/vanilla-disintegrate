# Documentation workspace

The documentation is an Astro SSR application and requires Node.js 22.12 or newer for local development. User-facing content lives in MDX and is grouped by locale:

```text
docs/content/
├── en/  English, no URL prefix
├── ru/  /ru/
├── zh/  /zh/
└── ko/  /ko/
```

Every locale contains the same relative page paths. This lets the language switcher keep the currently open page. Add a translated page to all four trees and keep its `order`, `section`, and relative path aligned.

Run the site locally:

```bash
pnpm dev
```

Build the standalone SSR server and verify its routes:

```bash
pnpm build:demo
pnpm docs:smoke
```

The build entry point is `demo-dist/server/entry.mjs`. Interactive animation examples are client-side islands; page headings, prose, navigation, code examples, and GitHub edit links are rendered on the server.
