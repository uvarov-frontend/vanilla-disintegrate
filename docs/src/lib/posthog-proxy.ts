const ASSETS_ORIGIN = 'https://eu-assets.i.posthog.com';
const INGEST_ORIGIN = 'https://eu.i.posthog.com';

/**
 * Handled directly in middleware, ahead of Astro's page router, so the exact PostHog SDK
 * paths (no trailing slash, e.g. `/ingest/static/array.js`) survive without a redirect or
 * a mismatch against `trailingSlash: 'always'`.
 */
export async function forwardToPostHog(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/ingest\//, '');
  const origin = path.startsWith('static/') ? ASSETS_ORIGIN : INGEST_ORIGIN;
  const upstream = new URL(`${origin}/${path}${url.search}`);

  const headers = new Headers(request.headers);
  headers.delete('host');

  const response = await fetch(upstream, {
    body: request.method === 'GET' || request.method === 'HEAD' ? null : await request.arrayBuffer(),
    headers,
    method: request.method,
  });

  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('content-length');

  return new Response(await response.arrayBuffer(), { headers: responseHeaders, status: response.status });
}
