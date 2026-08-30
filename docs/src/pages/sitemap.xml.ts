import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

import { docsHref, homeHref, locales, privacyHref, type Locale } from '../i18n';
import { entryPath, type DocEntry } from '../lib/docs';
import { absoluteUrl } from '../lib/site-url';

interface LocalizedPage {
  readonly href: string;
  readonly locale: Locale;
}

interface UrlContext {
  readonly site?: URL | undefined;
  readonly url: URL;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function orderByLocale(pages: readonly LocalizedPage[]) {
  return locales.flatMap((locale) => pages.filter((page) => page.locale === locale));
}

function renderUrl(page: LocalizedPage, alternatives: readonly LocalizedPage[], context: UrlContext) {
  const alternateLinks = alternatives
    .map(
      (alternate) =>
        `    <xhtml:link rel="alternate" hreflang="${alternate.locale}" href="${escapeXml(absoluteUrl(context, alternate.href))}" />`,
    )
    .join('\n');
  const english = alternatives.find((alternate) => alternate.locale === 'en');
  const defaultLink = english
    ? `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(absoluteUrl(context, english.href))}" />`
    : '';

  return [
    '  <url>',
    `    <loc>${escapeXml(absoluteUrl(context, page.href))}</loc>`,
    alternateLinks + defaultLink,
    '  </url>',
  ].join('\n');
}

export const GET: APIRoute = async ({ site, url }) => {
  const entries = (await getCollection('docs')) as DocEntry[];
  const documentation = new Map<string, LocalizedPage[]>();

  for (const entry of entries) {
    const path = entryPath(entry);
    const pages = documentation.get(path) ?? [];
    pages.push({ href: docsHref(entry.data.locale, path), locale: entry.data.locale });
    documentation.set(path, pages);
  }

  const groups = [
    locales.map((locale) => ({ href: homeHref(locale), locale })),
    locales.map((locale) => ({ href: privacyHref(locale), locale })),
    ...[...documentation.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, pages]) => orderByLocale(pages)),
  ];
  const context = { site, url };
  const urls = groups.flatMap((pages) => pages.map((page) => renderUrl(page, pages, context))).join('\n');
  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    urls,
    '</urlset>',
    '',
  ].join('\n');

  return new Response(sitemap, {
    headers: {
      'Cache-Control': 'public, max-age=3600',
      'Content-Type': 'application/xml; charset=utf-8',
    },
  });
};
