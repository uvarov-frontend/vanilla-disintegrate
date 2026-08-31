import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const port = 43_291;
const origin = `http://127.0.0.1:${port}`;
// Absolute URLs in canonical tags, hreflang alternates, robots and the sitemap
// come from `site`, not from the request, so a proxy that terminates TLS cannot
// downgrade them to http. Read from the config so both stay in step.
const { default: astroConfig } = await import(new URL('../astro.config.mjs', import.meta.url).href);
const site = astroConfig.site.replace(/\/$/, '');
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
  ['/', 'en', 'Animate DOM removal'],
  ['/docs/learn/installation/', 'en', 'Install and run your first effect'],
  ['/ru/docs/learn/installation/', 'ru', 'Установка и первый эффект'],
  ['/zh/docs/learn/effects/', 'zh', '内置预设'],
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

function contentStructure(source) {
  return {
    codeBlocks: (source.match(/^```/gm) ?? []).length / 2,
    demos: (source.match(/<(?:Demo|ParticleVortexSource)\b/g) ?? []).length,
    sections: (source.match(/^## /gm) ?? []).length,
    tableRows: (source.match(/^\|/gm) ?? []).length,
  };
}

function inlineCodeIdentifiers(source) {
  const prose = source.replace(/```[\s\S]*?```/g, '');
  const identifiers = new Set();

  for (const match of prose.matchAll(/(?<!`)`([^`\n]+)`(?!`)/g)) {
    for (const identifier of match[1].match(/[A-Za-z_$][\w$]*/g) ?? []) {
      identifiers.add(identifier);
    }
  }

  return identifiers;
}

try {
  await waitForServer();

  for (const contentPath of contentPaths) {
    const canonical = await readFile(new URL(`../docs/content/en/${contentPath}.mdx`, import.meta.url), 'utf8');
    const expected = contentStructure(canonical);
    const expectedIdentifiers = inlineCodeIdentifiers(canonical);
    for (const locale of locales.slice(1)) {
      const translated = await readFile(
        new URL(`../docs/content/${locale}/${contentPath}.mdx`, import.meta.url),
        'utf8',
      );
      assert.deepEqual(
        contentStructure(translated),
        expected,
        `${locale}/${contentPath}.mdx must preserve the English page structure`,
      );

      const translatedIdentifiers = inlineCodeIdentifiers(translated);
      const missingIdentifiers = [...expectedIdentifiers].filter(
        (identifier) => !translatedIdentifiers.has(identifier),
      );
      assert.deepEqual(
        missingIdentifiers,
        [],
        `${locale}/${contentPath}.mdx must preserve English inline API identifiers`,
      );
    }
  }

  for (const [path, locale, heading] of pages) {
    const response = await fetch(`${origin}${path}`);
    const html = await response.text();
    assert.equal(response.status, 200, path);
    assert.match(html, new RegExp(`<html lang="${locale}"`), path);
    assert.ok(html.includes(heading), `${path} must contain server-rendered page content`);
    assert.ok(html.includes('/assets/'), `${path} must include built assets`);
    const contentSecurityPolicy = response.headers.get('content-security-policy') ?? '';
    assert.match(contentSecurityPolicy, /default-src 'self'/, path);
    assert.match(contentSecurityPolicy, /frame-src 'self' blob: https:\/\/mc\.yandex\.ru/, path);
    assert.match(contentSecurityPolicy, /frame-ancestors 'self' metrika\.yandex\.ru/, path);
    assert.equal(response.headers.get('x-frame-options'), null, path);
    assert.equal(response.headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains', path);
    assert.equal(response.headers.get('cache-control'), 'private, no-cache', path);
  }

  const homeTitles = new Map();
  for (const locale of locales) {
    const prefix = locale === 'en' ? '' : `/${locale}`;
    const html = await (await fetch(`${origin}${prefix}/`)).text();
    const title = html.match(/<title>([^<]*)<\/title>/)?.[1];
    assert.ok(title, `${prefix}/ must render a title`);
    homeTitles.set(locale, title);
  }
  assert.equal(
    new Set(homeTitles.values()).size,
    locales.length,
    `each locale must have its own home title, got ${JSON.stringify([...homeTitles])}`,
  );

  const notFoundTitles = new Map();
  for (const locale of locales) {
    const prefix = locale === 'en' ? '' : `/${locale}`;
    const response = await fetch(`${origin}${prefix}/does-not-exist/`);
    const html = await response.text();
    assert.equal(response.status, 404, `${prefix}/does-not-exist/`);
    assert.ok(html.includes(`<html lang="${locale}"`), `404 must render in ${locale}`);
    notFoundTitles.set(locale, html.match(/<title>([^<]*)<\/title>/)?.[1]);
  }
  assert.equal(
    new Set(notFoundTitles.values()).size,
    locales.length,
    `each locale must have its own 404 title, got ${JSON.stringify([...notFoundTitles])}`,
  );

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
      if (contentPath === 'learn/installation') {
        for (const entry of [
          'vanilla-disintegrate/core',
          'vanilla-disintegrate/particles',
          'vanilla-disintegrate/sounds',
          'vanilla-disintegrate/snapdom',
          'vanilla-disintegrate.iife.min.js',
        ]) {
          assert.ok(html.includes(entry), `${path} must document ${entry}`);
        }
        assert.ok(
          html.includes('vanilla-disintegrate@latest/vanilla-disintegrate-iife.zip'),
          `${path} must link to the IIFE archive`,
        );
        assert.ok(
          html.includes('vanilla-disintegrate@latest/dist/vanilla-disintegrate.iife.min.js'),
          `${path} must document direct CDN usage`,
        );
      }
      if (contentPath === 'learn/custom-effects') {
        assert.ok(html.includes('vanilla-disintegrate/core'), `${path} must document snapshotless core effects`);
      }
      if (contentPath === 'reference/api') {
        assert.ok(html.includes('<code>preset</code>'), `${path} must document complete presets`);
        assert.ok(html.includes('<code>definePreset()</code>'), `${path} must document custom presets`);
        assert.ok(html.includes('prepare'), `${path} must document preparation error context`);
        assert.ok(html.includes('rejected'), `${path} must document rejected operations`);
      }
      if (contentPath === 'reference/audio') {
        assert.ok(html.includes('vanilla-disintegrate/sounds'), `${path} must document the sound entry`);
        assert.ok(html.includes('<code>sounds</code>'), `${path} must document audio preparation selections`);
        assert.ok(html.includes('<code>volume</code>'), `${path} must document native playback volume`);
      }
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
    localized.includes(`<link rel="canonical" href="${site}/ru/docs/learn/installation/">`),
    'localized documentation must expose an absolute canonical URL',
  );
  assert.ok(
    localized.includes(`<link rel="alternate" hreflang="en" href="${site}/docs/learn/installation/">`),
    'localized documentation must expose absolute language alternatives',
  );

  const home = await (await fetch(`${origin}/`)).text();
  const installation = await (await fetch(`${origin}/docs/learn/installation/`)).text();
  assert.ok(home.includes('data-menu-button'), 'home must expose its mobile navigation menu');
  assert.ok(home.includes('data-mobile-nav'), 'home must render its mobile navigation links');
  assert.ok(home.includes('href="/privacy/"'), 'home must link to the privacy controls');
  assert.ok(!home.includes('metrika/tag.js'), 'analytics loader must remain in the external client bundle');
  assert.ok(installation.includes('data-menu-button'), 'documentation must keep its mobile navigation menu');
  assert.ok(installation.includes('class="mobile-docs-global"'), 'documentation menu must include global links');
  assert.ok(installation.includes('Copyright © 2026 MIT License. | Design and development by'));
  assert.ok(!installation.includes('Copyright © 2026 MIT Лицензия. | Дизайн и разработка'));
  const renderedPanel = /<aside class="bundle-size-panel"[\s\S]*?<\/aside>/;
  const homePanel = home.match(renderedPanel)?.[0] ?? '';
  const documentationPanel = installation.match(renderedPanel)?.[0] ?? '';
  const homeSizes = homePanel.match(/\d+\.\d{2} KiB/g) ?? [];
  assert.equal(homeSizes.length, 8, 'size panel must show minified and gzip sizes for all four variants');
  assert.equal(documentationPanel, '', 'documentation must not render the bundle-size panel');
  assert.ok(homePanel.includes('<dt>ESM core</dt>'));
  assert.ok(homePanel.includes('<dt>ESM built-ins</dt>'));
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
  assert.ok(home.includes('data-package-command="pnpm add vanilla-disintegrate @zumer/snapdom"'));
  assert.ok(home.includes('data-package-command="bun add vanilla-disintegrate @zumer/snapdom"'));
  assert.ok(!installation.includes('class="package-manager-switcher"'));
  assert.ok(home.includes('data-particle-playground'), 'home must render the particle playground');
  assert.ok(home.includes('data-preset="dust"'), 'particle playground must render its built-in presets');
  assert.ok(home.includes('data-copy="effect"'), 'particle playground must expose code copying');
  assert.ok(home.includes('data-copy="link"'), 'particle playground must expose link sharing');

  const demoKinds = {
    'learn/effects': 'built-in',
    'learn/preparation': 'preparation',
    'learn/custom-effects': 'particle-vortex',
  };
  for (const [contentPath, kind] of Object.entries(demoKinds)) {
    const response = await fetch(`${origin}/ru/docs/${contentPath}/`);
    const html = await response.text();
    assert.equal(response.status, 200, contentPath);
    assert.ok(html.includes(`data-demo-kind="${kind}"`), `${contentPath} must render its live example`);
    if (contentPath === 'learn/custom-effects') {
      assert.ok(html.includes('sampleParticles'), 'custom effects must show its snapshot particle implementation');
      assert.ok(html.includes('particleVortex'), 'custom effects must show the effect used by its live example');
    }
  }

  const robotsResponse = await fetch(`${origin}/robots.txt`);
  const robots = await robotsResponse.text();
  assert.equal(robotsResponse.status, 200);
  assert.match(robotsResponse.headers.get('content-type') ?? '', /^text\/plain/);
  assert.ok(robots.includes('User-agent: *\nAllow: /'));
  assert.ok(robots.includes(`Sitemap: ${site}/sitemap.xml`));

  const sitemapResponse = await fetch(`${origin}/sitemap.xml`);
  const sitemap = await sitemapResponse.text();
  assert.equal(sitemapResponse.status, 200);
  assert.match(sitemapResponse.headers.get('content-type') ?? '', /^application\/xml/);
  assert.equal(sitemap.match(/<url>/g)?.length, 44, 'sitemap must contain every localized public page');
  assert.ok(sitemap.includes(`<loc>${site}/ru/docs/learn/frameworks/</loc>`));
  assert.ok(sitemap.includes(`<loc>${site}/</loc>`));
  assert.ok(sitemap.includes(`<loc>${site}/ru/docs/learn/installation/</loc>`));
  assert.ok(sitemap.includes(`<loc>${site}/zh/docs/reference/audio/</loc>`));
  assert.ok(sitemap.includes(`<loc>${site}/ko/</loc>`));
  assert.ok(sitemap.includes(`<loc>${site}/ru/privacy/</loc>`));
  assert.ok(sitemap.includes(`hreflang="x-default" href="${site}/docs/learn/installation/"`));
  assert.ok(!sitemap.includes('/404/'));
  assert.ok(site.startsWith('https://'), 'the configured site must be https');
  assert.ok(!/<loc>http:\/\/[^<]/.test(sitemap), 'every sitemap entry must use the https origin');

  const legacy = await fetch(`${origin}/learn/installation/`, { redirect: 'manual' });
  assert.equal(legacy.status, 302);
  assert.equal(legacy.headers.get('location'), '/docs/learn/installation/');

  const missingRoutes = [
    ['/nope/', 'en'],
    ['/ru/nope/', 'ru'],
    ['/docs/nope/', 'en'],
    ['/ru/docs/nope/', 'ru'],
  ];
  for (const [path, locale] of missingRoutes) {
    const response = await fetch(`${origin}${path}`, { redirect: 'manual' });
    const html = await response.text();
    assert.equal(response.status, 404, `${path} must remain a 404 instead of redirecting`);
    assert.equal(response.headers.get('location'), null, `${path} must preserve the requested URL`);
    assert.ok(html.includes(`<html lang="${locale}"`), `${path} must preserve its locale`);
  }

  const missing = await fetch(`${origin}/ru/this-page-does-not-exist/`);
  const missingHtml = await missing.text();
  assert.equal(missing.status, 404);
  assert.match(missingHtml, /<body class="not-found-body"/);
  assert.ok(missingHtml.includes('Ошибка 404'));
  assert.ok(missingHtml.includes('Страница не найдена'));
  assert.ok(missingHtml.includes('href="/ru/docs/learn/installation/"'));
  assert.ok(missingHtml.includes('href="/ru/"'));
  assert.ok(missingHtml.includes('class="docs-header"'));
  assert.ok(missingHtml.includes('class="docs-footer"'));
  assert.ok(missingHtml.includes('data-menu-button'), '404 must expose its mobile navigation menu');
  assert.ok(missingHtml.includes('data-mobile-nav'), '404 must render its mobile navigation links');

  const detectedRussian = await fetch(`${origin}/docs/learn/effects/`, {
    headers: { 'accept-language': 'ru-RU,ru;q=0.9,en;q=0.8' },
    redirect: 'manual',
  });
  assert.equal(detectedRussian.status, 302);
  assert.equal(detectedRussian.headers.get('location'), '/ru/docs/learn/effects/');
  assert.match(detectedRussian.headers.get('set-cookie') ?? '', /vanilla-disintegrate-locale=ru/);
  assert.match(detectedRussian.headers.get('set-cookie') ?? '', /Secure/);

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
