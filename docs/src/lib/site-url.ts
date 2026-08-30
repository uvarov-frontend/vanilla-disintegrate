/**
 * Builds absolute URLs for anything a crawler reads: canonical links, language
 * alternatives, Open Graph images, the sitemap and JSON-LD identifiers.
 *
 * The origin comes from `site` in `astro.config.mjs` rather than the incoming
 * request. Behind a proxy that terminates TLS the application itself is reached
 * over plain http, so a request-derived origin publishes `http://` addresses for
 * an https-only site — every one of them a redirect, and a canonical tag that
 * points away from the page serving it. The request origin is kept only as a
 * fallback for `astro dev`, where no `site` needs to be configured.
 */
interface UrlContext {
  readonly site?: URL | undefined;
  readonly url: URL;
}

export function absoluteUrl(context: UrlContext, href: string) {
  return new URL(href, context.site ?? new URL(context.url.origin)).href;
}
