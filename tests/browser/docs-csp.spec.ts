import { expect, test } from '@playwright/test';

test('lays out every bundle variant without horizontal overflow', async ({ page }) => {
  const viewports = [
    { columns: 4, height: 900, width: 1440 },
    { columns: 2, height: 900, width: 820 },
    { columns: 1, height: 844, width: 390 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto('http://localhost:4321/');

    const panel = page.locator('.bundle-size-panel');
    await expect(panel.locator('dt')).toHaveCount(4);
    const layout = await panel.evaluate((element) => {
      const values = element.querySelector('.bundle-size-values');
      if (!(values instanceof HTMLElement)) throw new Error('Bundle size values are missing');

      return {
        columns: getComputedStyle(values).gridTemplateColumns.split(' ').length,
        overflow: values.scrollWidth > values.clientWidth,
      };
    });

    expect(layout).toEqual({ columns: viewport.columns, overflow: false });
  }
});

test('keeps localized documentation within the mobile viewport', async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });

  for (const path of ['/ru/docs/learn/installation/', '/ru/docs/reference/api/']) {
    await page.goto(`http://localhost:4321${path}`);
    await expect(page.locator('main')).toBeVisible();
    const hasPageOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasPageOverflow).toBe(false);
  }
});

test('keeps default analytics and opt-out CSP-clean', async ({ browser, browserName, page }) => {
  test.skip(browserName !== 'chromium');

  const serverOnlyContext = await browser.newContext({ javaScriptEnabled: false });
  const serverOnlyPage = await serverOnlyContext.newPage();
  await serverOnlyPage.goto('http://localhost:4321/privacy/');
  await expect(serverOnlyPage.locator('[data-analytics-toggle]')).toBeHidden();
  await expect(serverOnlyPage.locator('.analytics-toggle-skeleton')).toBeVisible();
  const serverOnlyWidths = await serverOnlyPage.locator('[data-analytics-toggle-slot]').evaluate((slot) => ({
    button: slot.querySelector('[data-analytics-toggle]')?.getBoundingClientRect().width,
    skeleton: slot.querySelector('.analytics-toggle-skeleton')?.getBoundingClientRect().width,
  }));
  expect(serverOnlyWidths.skeleton).toBe(serverOnlyWidths.button);
  await serverOnlyContext.close();

  const violations: string[] = [];
  let analyticsRequests = 0;
  page.on('console', (message) => {
    const text = message.text();
    if (/content security policy|violates the following/i.test(text)) violations.push(text);
  });
  await page.route('https://mc.yandex.ru/metrika/tag.js', async (route) => {
    analyticsRequests += 1;
    await route.fulfill({
      body: 'window.__analyticsTagLoaded = true; window.__analyticsConfig = window.ym?.a?.[0]?.[2];',
      contentType: 'application/javascript',
    });
  });

  const response = await page.goto('http://localhost:4321/');
  expect(response?.status()).toBe(200);
  const headers = response?.headers() ?? {};
  expect(headers['content-security-policy']).toContain("script-src 'self' https://mc.yandex.ru");
  expect(headers['content-security-policy']).toContain("frame-src 'self' blob: https://mc.yandex.ru");
  expect(headers['content-security-policy']).toContain("frame-ancestors 'self' metrika.yandex.ru");
  expect(headers['x-frame-options']).toBeUndefined();
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__analyticsTagLoaded'))).toBe(true);
  expect(await page.evaluate(() => Reflect.get(window, '__analyticsConfig'))).toMatchObject({
    clickmap: true,
    webvisor: true,
  });
  await expect(page.locator('[data-analytics-notice]')).toHaveCount(0);

  await page.goto('http://localhost:4321/privacy/');
  await expect.poll(() => analyticsRequests).toBe(2);
  const toggle = page.locator('[data-analytics-toggle]');
  await expect(toggle).toHaveText('Disable analytics');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle).toHaveAttribute('data-analytics-ready', '');
  await expect(toggle).toBeVisible();
  await expect(page.locator('.analytics-toggle-skeleton')).toBeHidden();
  await toggle.click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('vanilla-disintegrate-analytics'))).toBe('denied');
  await expect(toggle).toHaveText('Enable analytics');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(analyticsRequests).toBe(2);

  await page.goto('http://localhost:4321/');
  await page.goto('http://localhost:4321/privacy/');
  expect(analyticsRequests).toBe(2);
  await expect(toggle).toHaveText('Enable analytics');
  await expect(toggle).toHaveAttribute('data-analytics-ready', '');
  await expect(toggle).toBeVisible();
  await expect(page.locator('.analytics-toggle-skeleton')).toBeHidden();
  await toggle.click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('vanilla-disintegrate-analytics'))).toBe('granted');
  await expect(toggle).toHaveText('Disable analytics');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => analyticsRequests).toBe(3);
  await toggle.click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('vanilla-disintegrate-analytics'))).toBe('denied');
  await expect(toggle).toHaveText('Enable analytics');
  expect(analyticsRequests).toBe(3);
  expect(violations).toEqual([]);
});
