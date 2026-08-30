import { defineMiddleware } from 'astro:middleware';

import { isLocale, localePrefix, type Locale } from './i18n';

const LOCALE_COOKIE = 'vanilla-disintegrate-locale';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const METRICA_HOSTS = [
  'mc.yandex.ru',
  'mc.yandex.az',
  'mc.yandex.by',
  'mc.yandex.co.il',
  'mc.yandex.com',
  'mc.yandex.com.am',
  'mc.yandex.com.ge',
  'mc.yandex.com.tr',
  'mc.yandex.ee',
  'mc.yandex.fr',
  'mc.yandex.kg',
  'mc.yandex.kz',
  'mc.yandex.lt',
  'mc.yandex.lv',
  'mc.yandex.md',
  'mc.yandex.tj',
  'mc.yandex.tm',
  'mc.yandex.uz',
  'mc.webvisor.com',
  'mc.webvisor.org',
] as const;
const METRICA_HTTPS_ORIGINS = METRICA_HOSTS.map((host) => `https://${host}`).join(' ');
const METRICA_WSS_ORIGINS = METRICA_HOSTS.map((host) => `wss://${host}`).join(' ');
const METRICA_FRAME_ANCESTORS = [
  'metrika.yandex.ru',
  'analytics.yandex.by',
  'analytics.yandex.com',
  'analytics.yandex.com.tr',
  'analytics.yandex.kz',
  'analytics.yandex.ru',
  'metr.yandex.by',
  'metr.yandex.com',
  'metr.yandex.com.tr',
  'metr.yandex.kz',
  'metr.yandex.ru',
  'metrica.ya.ru',
  'metrica.yandex',
  'metrica.yandex.by',
  'metrica.yandex.com',
  'metrica.yandex.com.tr',
  'metrica.yandex.kz',
  'metrica.yandex.ru',
  'metrika.ya.ru',
  'metrika.yandex',
  'metrika.yandex.by',
  'metrika.yandex.com',
  'metrika.yandex.com.tr',
  'metrika.yandex.kz',
  'metrika.yandex.uz',
  'webvisor.com',
  '*.webvisor.com',
  'webvisor.org',
  '*.webvisor.org',
].join(' ');
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  `connect-src 'self' ${METRICA_HTTPS_ORIGINS} ${METRICA_WSS_ORIGINS}`,
  `child-src 'self' blob: ${METRICA_HTTPS_ORIGINS}`,
  "font-src 'self' data:",
  "form-action 'self'",
  `frame-ancestors 'self' ${METRICA_FRAME_ANCESTORS}`,
  `frame-src 'self' blob: ${METRICA_HTTPS_ORIGINS}`,
  `img-src 'self' data: blob: ${METRICA_HTTPS_ORIGINS}`,
  "media-src 'self' blob:",
  "object-src 'none'",
  `script-src 'self' ${METRICA_HTTPS_ORIGINS} https://yastatic.net`,
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'self' blob:",
  'upgrade-insecure-requests',
].join('; ');

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

function secure(response: Response) {
  response.headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-XSS-Protection', '0');
  const contentType = response.headers.get('Content-Type') ?? '';
  if (response.status >= 300 || contentType.includes('text/html')) {
    response.headers.set('Cache-Control', 'private, no-cache');
  }
  return response;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const pathLocale = localeFromPath(context.url.pathname);
  const unlocalizedPath = withoutLocalePrefix(context.url.pathname);
  const canonicalPath = legacyRoutes[unlocalizedPath] ?? unlocalizedPath;
  const isDocumentationPage = canonicalPath === '/' || canonicalPath.startsWith('/docs/');

  if (!isDocumentationPage) return secure(await next());

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
    secure: true,
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
    return secure(response);
  }

  const response = await next();
  response.headers.append('Vary', 'Accept-Language, Cookie');
  return secure(response);
});
