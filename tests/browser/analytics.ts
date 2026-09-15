import type { BrowserContext } from '@playwright/test';

/** UI tests use deterministic analytics; CSP tests can override this at page scope. */
export async function stubAnalytics(context: BrowserContext) {
  await context.route('**/ingest/**', (route) =>
    route.fulfill({ body: '{"status":1}', contentType: 'application/json' }),
  );
}
