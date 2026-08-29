import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site, url }) => {
  const base = site ?? new URL(url.origin);
  const robots = ['User-agent: *', 'Allow: /', '', `Sitemap: ${new URL('/sitemap.xml', base).href}`, ''].join('\n');

  return new Response(robots, {
    headers: {
      'Cache-Control': 'public, max-age=3600',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
};
