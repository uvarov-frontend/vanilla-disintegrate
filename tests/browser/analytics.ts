import type { BrowserContext, Route } from '@playwright/test';

export async function fulfillAnalytics(route: Route) {
  // PostHog requests a configuration script as well as JSON endpoints.
  const script = route.request().resourceType() === 'script';
  await route.fulfill({
    body: script ? '' : '{"status":1}',
    contentType: script ? 'application/javascript' : 'application/json',
  });
}

/** UI tests use deterministic analytics; CSP tests can override this at page scope. */
export async function stubAnalytics(context: BrowserContext) {
  await context.route('**/ingest/**', fulfillAnalytics);
}
