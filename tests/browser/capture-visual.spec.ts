import { expect, test, type Locator } from '@playwright/test';
import { compareCapture } from './capture-comparison';

test.use({
  launchOptions: async ({ browserName, launchOptions }, use) => {
    // Transparent SVG/canvas text uses grayscale antialiasing. Linux Chromium
    // otherwise paints live DOM text with LCD subpixels, changing glyph colors.
    await use(
      browserName === 'chromium'
        ? { ...launchOptions, args: [...(launchOptions.args ?? []), '--disable-lcd-text'] }
        : launchOptions,
    );
  },
});

const cases = [
  'typography',
  'buttons',
  'promo',
  'calendar',
  'form',
  'table',
  'table-sized',
  'media',
  'clipping',
  'shadow',
];

async function nativeControlRegions(subject: Locator) {
  return subject.evaluate((element) => {
    const root = element.getBoundingClientRect();
    return [...element.querySelectorAll<HTMLInputElement>('input[type="checkbox"], input[type="radio"]')].map(
      (input) => {
        const rect = input.getBoundingClientRect();
        return {
          x: rect.x - root.x,
          y: rect.y - root.y,
          width: rect.width,
          height: rect.height,
          checked: input.checked,
        };
      },
    );
  });
}

// A visual failure must block publication even if a retry might happen to pass.
test.describe.configure({ retries: 0 });

for (const [theme, dpr] of [
  ['light', 1],
  ['dark', 2],
] as const) {
  test.describe(`snapshot fidelity: ${theme}, DPR ${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr, colorScheme: theme });
    const backdrop = theme === 'light' ? [241, 243, 248] : [8, 15, 26];

    test.beforeEach(async ({ page }) => {
      await page.goto('/tests/browser/capture-fixtures.html');
      await page.evaluate(async (theme) => {
        document.documentElement.dataset.theme = theme;
        await window.captureFixtures.ready;
      }, theme);
    });

    for (const id of cases) {
      test(`${id} matches live DOM during removal and restoration`, async ({ page }, testInfo) => {
        const subject = page.locator(`[data-case="${id}"]`);
        await subject.evaluate((element: HTMLElement) => {
          const bounds = element.getBoundingClientRect();
          // Put the DOM and canvas on the same physical pixel grid. Locator
          // screenshots otherwise expand fractional bounds to an extra pixel.
          element.style.width = `${Math.ceil(bounds.width)}px`;
          if (!Number.isInteger(bounds.height)) element.style.height = `${Math.ceil(bounds.height)}px`;
          element.style.margin = '0';
          document.body.replaceChildren(element);
          const scroller = element.querySelector('.scroll-window');
          if (scroller) scroller.scrollTop = 20;
        });
        for (const operation of ['remove', 'restore'] as const) {
          // Detachment can reset scroll positions. Compare each capture with the
          // actual DOM at the start of that operation, including current scroll state.
          const reference = await subject.screenshot({ animations: 'disabled' });
          const controls = await nativeControlRegions(subject);
          const result = await page.evaluate(
            async ({ id, operation }) => {
              return window.captureFixtures.capture(id, operation);
            },
            { id, operation },
          );
          expect(result.status).toBe('completed');
          expect(result.snapshots.map(({ operation }) => operation)).toEqual([operation]);
          const png = result.snapshots[0]!.png;
          const snapshot = Buffer.from(png.slice(png.indexOf(',') + 1), 'base64');
          const { diff, ...comparison } = compareCapture(reference, snapshot, dpr, backdrop, controls);
          if (!comparison.matches) {
            await testInfo.attach(`${operation}-live`, { body: reference, contentType: 'image/png' });
            await testInfo.attach(`${operation}-capture`, { body: snapshot, contentType: 'image/png' });
            if (diff) await testInfo.attach(`${operation}-diff`, { body: diff, contentType: 'image/png' });
          }
          expect.soft(comparison.matches, `${id}/${operation}: ${JSON.stringify(comparison)}`).toBe(true);
          if (id === 'form') {
            await subject.locator('input[type="checkbox"], input[type="radio"]').evaluateAll((inputs) => {
              for (const input of inputs) (input as HTMLInputElement).checked = false;
            });
          }
        }
      });
    }

    test('the comparison rejects layout, missing content and wrong control states', async ({ page }) => {
      for (const [id, change] of [
        ['promo', 'stretch'],
        ['calendar', 'arrows'],
        ['media', 'image'],
        ['form', 'value'],
        ['form', 'checked'],
        ['form', 'control'],
      ] as const) {
        const subject = page.locator(`[data-case="${id}"]`);
        const reference = await subject.screenshot({ animations: 'disabled' });
        const controls = await nativeControlRegions(subject);
        if (change === 'stretch' || change === 'arrows') {
          await page.addStyleTag({
            content:
              change === 'stretch'
                ? '.promo-cta { width:auto; } .promo-description { max-width:none; }'
                : '.arrow::before { transform-origin:0 0; }',
          });
        } else if (change === 'image') {
          await subject
            .locator('img')
            .first()
            .evaluate((image) => (image.style.visibility = 'hidden'));
        } else if (change === 'value') {
          await subject.locator('[name="name"]').evaluate((input: HTMLInputElement) => (input.value = ''));
        } else if (change === 'checked') {
          await subject.locator('input[type="checkbox"], input[type="radio"]').evaluateAll((inputs) => {
            for (const input of inputs) (input as HTMLInputElement).checked = false;
          });
        } else {
          // The preceding case leaves both controls unchecked. Their outlines
          // must still be present even though no central mark is expected.
          await subject.locator('input[type="checkbox"], input[type="radio"]').evaluateAll((inputs) => {
            for (const input of inputs) (input as HTMLInputElement).style.visibility = 'hidden';
          });
        }
        const broken = await subject.screenshot({ animations: 'disabled' });
        expect(compareCapture(reference, reference, dpr, backdrop, controls).matches).toBe(true);
        expect(
          compareCapture(reference, broken, dpr, backdrop, controls).matches,
          `Missed the ${id}/${change} regression`,
        ).toBe(false);
      }
    });
  });
}
