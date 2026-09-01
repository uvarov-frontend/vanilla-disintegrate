import { expect, test } from '@playwright/test';

test('lays out every bundle variant without horizontal overflow', async ({ page }) => {
  const viewports = [
    { columns: 4, height: 900, nextStepsPadding: '130px', playgroundPadding: '110px', width: 1440 },
    { columns: 2, height: 900, nextStepsPadding: '72px', playgroundPadding: '64px', width: 820 },
    { columns: 1, height: 844, nextStepsPadding: '48px', playgroundPadding: '40px', width: 390 },
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
        nextStepsPadding: getComputedStyle(document.querySelector('.home-next-steps')!).paddingBottom,
        overflow: values.scrollWidth > values.clientWidth,
        playgroundPadding: getComputedStyle(document.querySelector('.home-playground-section')!).paddingBottom,
      };
    });

    expect(layout).toEqual({
      columns: viewport.columns,
      nextStepsPadding: viewport.nextStepsPadding,
      overflow: false,
      playgroundPadding: viewport.playgroundPadding,
    });
  }
});

test('keeps localized documentation within the mobile viewport', async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });

  for (const path of ['/ru/docs/learn/installation/', '/ru/docs/reference/api/']) {
    await page.goto(`http://localhost:4321${path}`);
    await expect(page.locator('main')).toBeVisible();
    const layout = await page.locator('.docs-layout').evaluate((element) => ({
      hasPageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      paddingBottom: getComputedStyle(element).paddingBottom,
      paddingTop: getComputedStyle(element).paddingTop,
    }));
    expect(layout).toEqual({ hasPageOverflow: false, paddingBottom: '40px', paddingTop: '24px' });
  }
});

test('reduces page padding at responsive breakpoints', async ({ browserName, page }) => {
  test.skip(browserName !== 'chromium');

  const viewports = [
    { height: 900, paddingBottom: '72px', paddingTop: '42px', width: 1024 },
    { height: 900, paddingBottom: '56px', paddingTop: '30px', width: 760 },
    { height: 844, paddingBottom: '40px', paddingTop: '24px', width: 390 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto('http://localhost:4321/docs/learn/installation/');

    const padding = await page.locator('.docs-layout').evaluate((element) => ({
      bottom: getComputedStyle(element).paddingBottom,
      top: getComputedStyle(element).paddingTop,
    }));
    expect(padding).toEqual({ bottom: viewport.paddingBottom, top: viewport.paddingTop });
  }

  await page.setViewportSize({ height: 844, width: 320 });
  await page.goto('http://localhost:4321/ru/privacy/');
  await expect(page.locator('.privacy-page')).toHaveCSS('padding-block', '48px');
  const headingLayout = await page.locator('.privacy-page').evaluate((pageElement) => ({
    hasPageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    wraps: [...pageElement.querySelectorAll('h1, h2')].every((heading) => {
      const style = getComputedStyle(heading);
      return style.hyphens === 'auto' && style.overflowWrap === 'anywhere';
    }),
  }));
  expect(headingLayout).toEqual({ hasPageOverflow: false, wraps: true });
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
