import type { BrowserContext } from '@playwright/test';

/** UI tests use deterministic analytics; CSP tests can override this at page scope. */
export async function stubAnalytics(context: BrowserContext) {
  await context.route('https://mc.webvisor.org/metrika/tag_ww.js*', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: '' }),
  );
}
