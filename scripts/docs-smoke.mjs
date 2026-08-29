import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const port = 43_291;
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['./demo-dist/server/entry.mjs'], {
  env: {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: String(port),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
server.stdout.on('data', (chunk) => {
  output += String(chunk);
});
server.stderr.on('data', (chunk) => {
  output += String(chunk);
});

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Documentation server exited early.\n${output}`);
    try {
      const response = await fetch(origin);
      if (response.ok) return;
    } catch {
      // The standalone entry point is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Documentation server did not become ready.\n${output}`);
}

const pages = [
  ['/', 'en', 'Remove any element'],
  ['/docs/learn/installation/', 'en', 'Install and run your first effect'],
  ['/ru/docs/learn/installation/', 'ru', 'Установка и первый эффект'],
  ['/zh/docs/learn/effects/', 'zh', '内置效果对'],
  ['/ko/docs/reference/api/', 'ko', 'API 레퍼런스'],
];
const contentPaths = [
  'learn/installation',
  'learn/effects',
  'learn/remove-restore',
  'learn/retention',
  'learn/preparation',
  'learn/custom-effects',
  'learn/frameworks',
  'reference/api',
  'reference/audio',
];
const locales = ['en', 'ru', 'zh', 'ko'];

try {
  await waitForServer();

  for (const [path, locale, heading] of pages) {
    const response = await fetch(`${origin}${path}`);
    const html = await response.text();
    assert.equal(response.status, 200, path);
    assert.match(html, new RegExp(`<html lang="${locale}"`), path);
    assert.ok(html.includes(heading), `${path} must contain server-rendered page content`);
    assert.ok(html.includes('/assets/'), `${path} must include built assets`);
  }

  for (const locale of locales) {
    for (const contentPath of contentPaths) {
      const prefix = locale === 'en' ? '' : `/${locale}`;
      const path = `${prefix}/docs/${contentPath}/`;
      const response = await fetch(`${origin}${path}`);
      const html = await response.text();
      assert.equal(response.status, 200, path);
      assert.ok(html.includes(`<html lang="${locale}"`), path);
      assert.ok(
        html.includes(
          `github.com/uvarov-frontend/vanilla-disintegrate/edit/main/docs/content/${locale}/${contentPath}.mdx`,
        ),
        `${path} must link to its editable MDX source`,
      );
    }
  }

  const localized = await (await fetch(`${origin}/ru/docs/learn/installation/`)).text();
  assert.ok(localized.includes('Редактировать страницу на GitHub'));
  assert.ok(localized.includes('Copyright © 2026 MIT Лицензия. | Дизайн и разработка'));
  assert.ok(localized.includes('href="/zh/docs/learn/installation/?lang=zh"'));
  assert.ok(
    localized.includes(
      'github.com/uvarov-frontend/vanilla-disintegrate/edit/main/docs/content/ru/learn/installation.mdx',
    ),
  );

  const externalAnchors = localized.match(/<a\b[^>]*href="https?:\/\/[^"]+"[^>]*>/g) ?? [];
  assert.ok(externalAnchors.length > 0, 'documentation page must contain external links');
  for (const anchor of externalAnchors) {
    assert.ok(anchor.includes('target="_blank"'), `external link must open in a new tab: ${anchor}`);
    assert.ok(anchor.includes('rel="noopener noreferrer"'), `external link must use a safe rel: ${anchor}`);
  }
  assert.ok(
    localized.includes(`<link rel="canonical" href="${origin}/ru/docs/learn/installation/">`),
    'localized documentation must expose an absolute canonical URL',
  );
  assert.ok(
    localized.includes(`<link rel="alternate" hreflang="en" href="${origin}/docs/learn/installation/">`),
    'localized documentation must expose absolute language alternatives',
  );

  const home = await (await fetch(`${origin}/`)).text();
  const homeText = home
    .replace(/<[^>]+>/g, '')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
  const installation = await (await fetch(`${origin}/docs/learn/installation/`)).text();
  assert.ok(installation.includes('Copyright © 2026 MIT License. | Design and development by'));
  assert.ok(!installation.includes('Copyright © 2026 MIT Лицензия. | Дизайн и разработка'));
  const renderedPanel = /<aside class="bundle-size-panel"[\s\S]*?<\/aside>/;
  const homePanel = home.match(renderedPanel)?.[0] ?? '';
  const documentationPanel = installation.match(renderedPanel)?.[0] ?? '';
  const homeSizes = homePanel.match(/\d+\.\d{2} KiB/g) ?? [];
  assert.equal(homeSizes.length, 6, 'size panel must show minified and gzip sizes for all three variants');
  assert.equal(documentationPanel, '', 'documentation must not render the bundle-size panel');
  assert.ok(homePanel.includes('<dt>ESM</dt>'));
  assert.ok(homePanel.includes('<dt>ESM + SnapDOM</dt>'));
  assert.ok(homePanel.includes('<dt>IIFE</dt>'));

  assert.ok(home.includes('class="package-manager-switcher"'));
  assert.ok(home.includes('class="package-version"'));
  assert.ok(home.includes(`>v${packageJson.version}</a>`));
  assert.ok(home.includes('href="https://github.com/uvarov-frontend/vanilla-disintegrate/releases"'));
  assert.ok(home.includes('data-package-manager="npm"'));
  assert.ok(home.includes('data-package-manager="yarn"'));
  assert.ok(home.includes('data-package-manager="pnpm"'));
  assert.ok(home.includes('data-package-manager="bun"'));
  assert.ok(home.includes('data-package-command="pnpm add vanilla-disintegrate"'));
  assert.ok(home.includes('data-package-command="bun add vanilla-disintegrate"'));
  assert.ok(!installation.includes('class="package-manager-switcher"'));
  assert.ok(home.includes('data-code-tab="effect"'), 'custom demo must expose the full effect source');
  assert.ok(home.includes('data-code-tab="usage"'), 'custom demo must expose reproducible usage code');
  assert.ok(home.includes('sampleParticles'), 'custom effect source must include particle sampling');
  assert.ok(home.includes('createVortexTone'), 'custom effect source must include its sound factory');
  assert.ok(homeText.includes('effects.remove(element'), 'custom effect usage must show the remove call');
  assert.ok(homeText.includes('effects.restore(restored'), 'custom effect usage must show the restore call');
  assert.ok(!home.includes('data-vortex-remove'), 'custom effect usage must not include demo button handlers');
  assert.ok(home.includes('data-demo-kind="particle-vortex"'), 'home must keep the particle vortex live demo');

  const demoKinds = {
    'learn/effects': 'built-in',
    'learn/preparation': 'preparation',
    'learn/custom-effects': 'custom',
  };
  for (const [contentPath, kind] of Object.entries(demoKinds)) {
    const response = await fetch(`${origin}/ru/docs/${contentPath}/`);
    const html = await response.text();
    assert.equal(response.status, 200, contentPath);
    assert.ok(html.includes(`data-demo-kind="${kind}"`), `${contentPath} must render its live example`);
  }

  const robotsResponse = await fetch(`${origin}/robots.txt`);
  const robots = await robotsResponse.text();
  assert.equal(robotsResponse.status, 200);
  assert.match(robotsResponse.headers.get('content-type') ?? '', /^text\/plain/);
  assert.ok(robots.includes('User-agent: *\nAllow: /'));
  assert.ok(robots.includes(`Sitemap: ${origin}/sitemap.xml`));

  const sitemapResponse = await fetch(`${origin}/sitemap.xml`);
  const sitemap = await sitemapResponse.text();
  assert.equal(sitemapResponse.status, 200);
  assert.match(sitemapResponse.headers.get('content-type') ?? '', /^application\/xml/);
  assert.equal(sitemap.match(/<url>/g)?.length, 40, 'sitemap must contain every localized public page');
  assert.ok(sitemap.includes(`<loc>${origin}/ru/docs/learn/frameworks/</loc>`));
  assert.ok(sitemap.includes(`<loc>${origin}/</loc>`));
  assert.ok(sitemap.includes(`<loc>${origin}/ru/docs/learn/installation/</loc>`));
  assert.ok(sitemap.includes(`<loc>${origin}/zh/docs/reference/audio/</loc>`));
  assert.ok(sitemap.includes(`<loc>${origin}/ko/</loc>`));
  assert.ok(sitemap.includes(`hreflang="x-default" href="${origin}/docs/learn/installation/"`));
  assert.ok(!sitemap.includes('/404/'));

  const legacy = await fetch(`${origin}/learn/installation/`, { redirect: 'manual' });
  assert.equal(legacy.status, 302);
  assert.equal(legacy.headers.get('location'), '/docs/learn/installation/');

  const detectedRussian = await fetch(`${origin}/docs/learn/effects/`, {
    headers: { 'accept-language': 'ru-RU,ru;q=0.9,en;q=0.8' },
    redirect: 'manual',
  });
  assert.equal(detectedRussian.status, 302);
  assert.equal(detectedRussian.headers.get('location'), '/ru/docs/learn/effects/');
  assert.match(detectedRussian.headers.get('set-cookie') ?? '', /vanilla-disintegrate-locale=ru/);

  const persistedEnglish = await fetch(`${origin}/docs/learn/effects/`, {
    headers: {
      'accept-language': 'ru-RU,ru;q=0.9',
      cookie: 'vanilla-disintegrate-locale=en',
    },
    redirect: 'manual',
  });
  assert.equal(persistedEnglish.status, 200);

  const explicitEnglish = await fetch(`${origin}/docs/learn/effects/?lang=en`, {
    headers: { 'accept-language': 'ru-RU,ru;q=0.9' },
    redirect: 'manual',
  });
  assert.equal(explicitEnglish.status, 302);
  assert.equal(explicitEnglish.headers.get('location'), '/docs/learn/effects/');
  assert.match(explicitEnglish.headers.get('set-cookie') ?? '', /vanilla-disintegrate-locale=en/);

  console.log('Documentation SSR and locale smoke checks passed.');
} finally {
  server.kill('SIGTERM');
  if (server.exitCode === null) await once(server, 'exit');
}
