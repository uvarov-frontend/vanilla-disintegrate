import { defineMiddleware } from 'astro:middleware';

import { isLocale, localePrefix, type Locale } from './i18n';

const LOCALE_COOKIE = 'vanilla-disintegrate-locale';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const legacyRoutes: Readonly<Record<string, string>> = {
  '/learn/installation/': '/docs/learn/installation/',
  '/learn/effects/': '/docs/learn/effects/',
  '/learn/remove-restore/': '/docs/learn/remove-restore/',
  '/learn/retention/': '/docs/learn/retention/',
  '/learn/preparation/': '/docs/learn/preparation/',
  '/learn/custom-effects/': '/docs/learn/custom-effects/',
  '/learn/frameworks/': '/docs/learn/frameworks/',
  '/reference/': '/docs/reference/api/',
  '/reference/constructor/': '/docs/reference/api/',
  '/reference/methods/': '/docs/reference/api/',
  '/reference/effects/': '/docs/learn/effects/',
  '/reference/audio/': '/docs/reference/audio/',
};

function localeFromPath(pathname: string): Locale | null {
  const match = pathname.match(/^\/(ru|zh|ko)(?=\/|$)/);
  return (match?.[1] as Locale | undefined) ?? null;
}

function withoutLocalePrefix(pathname: string) {
  return pathname.replace(/^\/(ru|zh|ko)(?=\/|$)/, '') || '/';
}

function localeFromAcceptLanguage(header: string | null): Locale {
  if (header === null) return 'en';

  const candidates = header
    .split(',')
    .map((part, index) => {
      const [language = '', ...parameters] = part.trim().split(';');
      const qualityParameter = parameters.find((parameter) => parameter.trim().startsWith('q='));
      const quality = qualityParameter === undefined ? 1 : Number.parseFloat(qualityParameter.trim().slice(2));
      return { language: language.toLowerCase(), quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .sort((left, right) => right.quality - left.quality || left.index - right.index);

  for (const { language, quality } of candidates) {
    if (quality <= 0) continue;
    const base = language.split('-')[0];
    if (isLocale(base)) return base;
  }

  return 'en';
}

function localizedPath(pathname: string, locale: Locale) {
  return locale === 'en' ? pathname : `${localePrefix(locale)}${pathname}`;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const pathLocale = localeFromPath(context.url.pathname);
  const unlocalizedPath = withoutLocalePrefix(context.url.pathname);
  const canonicalPath = legacyRoutes[unlocalizedPath] ?? unlocalizedPath;
  const isDocumentationPage = canonicalPath === '/' || canonicalPath.startsWith('/docs/');

  if (!isDocumentationPage) return next();

  const requestedLocale = context.url.searchParams.get('lang') ?? undefined;
  const storedLocale = context.cookies.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requestedLocale)
    ? requestedLocale
    : (pathLocale ??
      (isLocale(storedLocale)
        ? storedLocale
        : localeFromAcceptLanguage(context.request.headers.get('accept-language'))));

  context.cookies.set(LOCALE_COOKIE, locale, {
    httpOnly: true,
    maxAge: COOKIE_MAX_AGE,
    path: '/',
    sameSite: 'lax',
    secure: context.url.protocol === 'https:',
  });

  const destinationPath = localizedPath(canonicalPath, locale);
  const destination = new URL(context.url);
  destination.pathname = destinationPath;
  destination.searchParams.delete('lang');

  if (
    destinationPath !== context.url.pathname ||
    legacyRoutes[unlocalizedPath] !== undefined ||
    isLocale(requestedLocale)
  ) {
    const response = context.redirect(`${destination.pathname}${destination.search}`, 302);
    response.headers.append('Vary', 'Accept-Language, Cookie');
    return response;
  }

  const response = await next();
  response.headers.append('Vary', 'Accept-Language, Cookie');
  return response;
});
