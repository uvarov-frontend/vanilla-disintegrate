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

The playground controller is `src/client/particle-playground.ts`. Its `playground-*` modules own state, translations, compact URLs, generated code, markup, audio files and preview scheduling. Site styles are imported directly in `src/layouts/BaseLayout.astro`; keep their order to preserve the cascade. Avoid nesting these imports in CSS: Astro's dev server can retain stale styles in the initial HTML after an imported file changes.

After a successful deployment, `deploy/prune-releases.sh` retains only the active source release and its Docker image. The previous image remains available for rollback until the new deployment passes all health checks, then is eligible for removal with the other old versions. Only commit-shaped directories and image tags belonging to this site are eligible for cleanup. Its default mode is `--dry-run`; the deployment workflow explicitly passes `--apply`.
