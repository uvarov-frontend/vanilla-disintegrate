import { expect, test, type Page } from '@playwright/test';
import { stubAnalytics } from './analytics';

test.beforeEach(async ({ page, context }) => {
  await stubAnalytics(context);
  await page.goto('/tests/browser/fixture.html');
});

test('captures real SnapDOM pixels at DPR 2 for both removal and concealed restoration', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { Disintegrator, createSnapdomCapture } = await import('../../src/snapdom');
    const element = document.createElement('div');
    element.style.cssText = 'width:96px;height:48px;background:rgb(23,145,217);';
    document.body.append(element);
    const samples: Array<{ operation: string; width: number; height: number; pixel: number[] }> = [];
    const animate = ({ snapshot, operation }: { snapshot: HTMLCanvasElement | null; operation: string }) => {
      if (snapshot === null) throw new Error('Missing real snapshot');
      samples.push({
        operation,
        width: snapshot.width,
        height: snapshot.height,
        pixel: Array.from(snapshot.getContext('2d')!.getImageData(8, 8, 1, 1).data),
      });
      return Promise.resolve();
    };
    const instance = new Disintegrator({
      capture: createSnapdomCapture({ dpr: 2, embedFonts: false }),
      effect: { remove: { animate }, restore: { animate } },
      preparation: false,
      layout: false,
    });
    try {
      const removed = instance.remove(element, { retain: true });
      const removal = await removed.finished;
      document.body.append(instance.take(removed.removalId!)!);
      const restoration = await instance.restore(element).finished;
      return {
        samples,
        removal: removal.status,
        restoration: restoration.status,
        opacity: getComputedStyle(element).opacity,
      };
    } finally {
      instance.destroy();
      element.remove();
    }
  });
  expect(result).toEqual({
    samples: ['remove', 'restore'].map((operation) => ({
      operation,
      width: 192,
      height: 96,
      pixel: [23, 145, 217, 255],
    })),
    removal: 'completed',
    restoration: 'completed',
    opacity: '1',
  });
});

test('applies the capture pixel budget before creating a large bitmap', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { createSnapdomCapture } = await import('../../src/snapdom');
    const element = document.createElement('div');
    element.style.cssText = 'width:1000px;height:1000px;background:rgb(23,145,217);';
    document.body.append(element);
    const canvas = await createSnapdomCapture({ dpr: 2, embedFonts: false, maxCapturePixels: 40_000 })(element, {
      operation: 'prepare',
      signal: new AbortController().signal,
    });
    const dimensions = [canvas.width, canvas.height];
    canvas.width = canvas.height = 0;
    element.remove();
    return dimensions;
  });
  expect(result).toEqual([200, 200]);
});

test('keeps the visible server-rendered card connected during playground initialization', async ({ page }) => {
  let releaseModule!: () => void;
  const moduleGate = new Promise<void>((resolve) => {
    releaseModule = resolve;
  });
  await page.route(/\/particle-playground(?:\.ts)?(?:\?|$)/, async (route) => {
    await moduleGate;
    await route.continue();
  });
  try {
    await page.goto('http://localhost:4321/', { waitUntil: 'commit' });
    const card = page.locator('.playground-card');
    await card.scrollIntoViewIfNeeded();
    const observation = await card.evaluateHandle((element) => {
      const state = { detached: false };
      const observer = new MutationObserver((records) => {
        if (records.some((record) => [...record.removedNodes].includes(element))) state.detached = true;
      });
      observer.observe(element.parentElement!, { childList: true });
      return { state, observer, element, artwork: element.querySelector('svg') };
    });
    releaseModule();
    await expect(page.locator('[data-particle-playground] [data-status]')).toHaveText('Ready', { timeout: 15_000 });
    const result = await observation.evaluate(({ state, observer, element, artwork }) => {
      observer.disconnect();
      return {
        detached: state.detached,
        sameCard: element === document.querySelector('.playground-card'),
        sameArtwork: artwork === element.querySelector('svg'),
      };
    });
    await observation.dispose();
    expect(result).toEqual({ detached: false, sameCard: true, sameArtwork: true });
  } finally {
    releaseModule();
  }
});

for (const initialWidth of [375, 1280]) {
  test(`aligns playground artwork with captured pixels when loaded at ${initialWidth}px and resized`, async ({
    page,
  }) => {
    // Set the viewport before navigation: resizing a desktop page to mobile can
    // hide Chromium's incorrect initial resolved insets on flex descendants.
    await page.setViewportSize({ width: initialWidth, height: 900 });
    await page.goto('http://localhost:4321/');
    const card = page.locator('.playground-card');
    await card.scrollIntoViewIfNeeded();

    for (const width of [initialWidth, initialWidth === 375 ? 1280 : 375]) {
      await page.setViewportSize({ width, height: 900 });
      for (const shape of ['narrow', 'wide']) {
        const result = await card.evaluate(async (element, shape) => {
          const modulePath = '../../src/snapdom.ts';
          const { createSnapdomCapture } = (await import(modulePath)) as typeof import('../../src/snapdom');
          if (element.getAttribute('data-card-width') !== shape) element.setAttribute('data-card-width', shape);
          await document.fonts.ready;
          await new Promise(requestAnimationFrame);
          const bounds = element.getBoundingClientRect();
          const dot = element.querySelector('.demo-card-dot')!.getBoundingClientRect();
          const ring = element.querySelectorAll('.demo-card-ring')[2]!.getBoundingClientRect();
          const canvas = await createSnapdomCapture({ dpr: 1, embedFonts: false })(element as HTMLElement, {
            operation: 'prepare',
            signal: new AbortController().signal,
          });
          try {
            const context = canvas.getContext('2d')!;
            const pixel = (x: number, y: number) =>
              Array.from(context.getImageData(Math.floor(x), Math.floor(y), 1, 1).data);
            const x = ring.left - bounds.left;
            const y = ring.top - bounds.top + ring.height / 2;
            const brightness = (offset: number) =>
              pixel(x + offset, y)
                .slice(0, 3)
                .reduce((sum, c) => sum + c, 0);
            // Allow one pixel of edge antialiasing while requiring the large ring
            // at its live DOM position, above the surrounding gradient's brightness.
            const edge = Math.max(brightness(-1), brightness(0), brightness(1));
            const background = Math.max(brightness(-4), brightness(4));
            return {
              dot: pixel(dot.left - bounds.left + dot.width / 2, dot.top - bounds.top + dot.height / 2),
              ringContrast: edge - background,
            };
          } finally {
            canvas.width = canvas.height = 0;
          }
        }, shape);
        for (const channel of result.dot.slice(0, 3)) expect(channel, `${width}px ${shape}: dot`).toBeGreaterThan(240);
        expect(result.dot[3]).toBe(255);
        expect(result.ringContrast, `${width}px ${shape}: ring`).toBeGreaterThan(40);
      }
    }
  });
}

test('keeps card geometry continuous at both ends of the shape animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('http://localhost:4321/');
  const root = page.locator('[data-particle-playground]');
  await root.scrollIntoViewIfNeeded();
  await expect(root.locator('[data-status]')).toHaveText('Ready', { timeout: 15_000 });

  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const shape of ['wide', 'narrow']) {
      const result = await root.evaluate(async (element, shape) => {
        const card = element.querySelector<HTMLElement>('.playground-card')!;
        const frame = card.querySelector('.demo-card-frame')!;
        const measure = () => {
          // Mobile viewport resizing can adjust scroll position between frames.
          // Measure within the stage to isolate the card's own movement.
          const stage = card.parentElement!.getBoundingClientRect();
          return [card, frame, ...frame.children].flatMap((part) => {
            const rect = part.getBoundingClientRect();
            return [rect.x - stage.x, rect.y - stage.y, rect.width, rect.height];
          });
        };
        const before = measure();
        element.querySelector<HTMLButtonElement>(`[data-width-option="${shape}"]`)!.click();
        const animations = card.getAnimations({ subtree: true });
        for (const animation of animations) {
          animation.pause();
          animation.currentTime = 0;
        }
        const first = measure();
        for (const animation of animations) animation.currentTime = Number(animation.effect!.getTiming().duration);
        const last = measure();
        for (const animation of animations) animation.finish();
        await Promise.all(animations.map((animation) => animation.finished));
        await new Promise(requestAnimationFrame);
        return { count: animations.length, before, first, last, after: measure() };
      }, shape);
      expect(result.count).toBeGreaterThan(0);
      for (let i = 0; i < result.before.length; i += 1) {
        expect(Math.abs(result.first[i]! - result.before[i]!), `${width}px ${shape}: first frame`).toBeLessThan(0.1);
        expect(Math.abs(result.last[i]! - result.after[i]!), `${width}px ${shape}: last frame`).toBeLessThan(0.1);
      }
    }
  }
});

async function observePlaygroundOperations(page: Page) {
  return page.evaluateHandle(async () => {
    const modulePath = '../../src/snapdom.ts';
    const { Disintegrator } = (await import(modulePath)) as typeof import('../../src/snapdom');
    const entries: Array<{ kind: string; started: boolean; cancelled: boolean; status: string | null }> = [];
    for (const kind of ['remove', 'restore'] as const) {
      const original = Disintegrator.prototype[kind];
      Disintegrator.prototype[kind] = function (element, options) {
        if (!(element instanceof HTMLElement) || !element.classList.contains('playground-card')) {
          return original.call(this, element, options);
        }
        const entry = { kind, started: false, cancelled: false, status: null as string | null };
        entries.push(entry);
        const operation = original.call(this, element, {
          ...options,
          onStart: (context) => {
            entry.started = true;
            options?.onStart?.(context);
          },
        });
        const cancel = operation.cancel;
        operation.cancel = () => {
          entry.cancelled = true;
          cancel();
        };
        void operation.finished.then((result) => {
          entry.status = result.status;
        });
        return operation;
      };
    }
    return entries;
  });
}

for (const kind of ['remove', 'restore'] as const) {
  test(`interrupts a running ${kind} and previews the latest settings`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('http://localhost:4321/');
    await requireWebGL2(page);
    const root = page.locator('[data-particle-playground]');
    await expect(root.locator('[data-status]')).toHaveText('Ready', { timeout: 15_000 });
    const operations = await observePlaygroundOperations(page);
    await root.evaluate((element, kind) => {
      element.querySelector<HTMLButtonElement>(`[data-operation="${kind}"]`)!.click();
      const duration = element.querySelector<HTMLInputElement>('[data-option="duration"]')!;
      duration.value = '3000';
      duration.dispatchEvent(new Event('input', { bubbles: true }));
      element.querySelector<HTMLButtonElement>(`[data-action="${kind}"]`)!.click();
    }, kind);
    await expect(root).toHaveAttribute('aria-busy', 'true');
    await expect.poll(() => operations.evaluate((entries) => entries[0]?.started)).toBe(true);
    await root.evaluate((element) => {
      const duration = element.querySelector<HTMLInputElement>('[data-option="duration"]')!;
      for (const value of ['1000', '500', '200']) {
        duration.value = value;
        duration.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await expect.poll(() => operations.evaluate((entries) => entries[0]?.status)).toBe('cancelled');
    await expect.poll(() => operations.evaluate((entries) => entries.length), { timeout: 2000 }).toBe(2);
    await expect(root.locator('[data-option="duration"]')).toHaveValue('200');
    await expect(root).toHaveAttribute('aria-busy', 'false', { timeout: 5000 });
    await expect(root.locator('.playground-card')).toHaveCount(1);
    await expect(root.locator('.playground-card')).toBeVisible();
    expect(await operations.evaluate((entries) => entries.map(({ kind, cancelled }) => ({ kind, cancelled })))).toEqual(
      [
        { kind, cancelled: true },
        { kind, cancelled: false },
      ],
    );
    await operations.dispose();
  });
}

test('replaces running previews with presets and manual actions without stale card reinsertion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('http://localhost:4321/');
  await requireWebGL2(page);
  const root = page.locator('[data-particle-playground]');
  await expect(root.locator('[data-status]')).toHaveText('Ready', { timeout: 15_000 });
  const operations = await observePlaygroundOperations(page);
  await root.evaluate((element) => {
    element.querySelector<HTMLButtonElement>('[data-preset="vapor"]')!.click();
    const duration = element.querySelector<HTMLInputElement>('[data-option="duration"]')!;
    duration.value = '3000';
    duration.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(root).toHaveAttribute('aria-busy', 'true');
  // Trigger during playback without mobile actionability scrolling delaying the click.
  await root.evaluate((element) => element.querySelector<HTMLButtonElement>('[data-preset="scatter"]')!.click());
  await expect.poll(() => operations.evaluate((entries) => entries[0]?.status)).toBe('cancelled');
  await expect.poll(() => operations.evaluate((entries) => entries.length)).toBe(2);
  // These clicks intentionally share a task: old promise continuations run only
  // after the replacement and reset have already changed the card.
  await root.evaluate((element) => {
    for (const action of ['restore', 'remove', 'restore', 'reset']) {
      element.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!.click();
    }
  });
  await expect(root).toHaveAttribute('aria-busy', 'false');
  await expect(root.locator('[data-status]')).toHaveText('Ready', { timeout: 15_000 });
  await expect(root.locator('.playground-card')).toHaveCount(1);
  await expect(root.locator('.playground-card')).toBeVisible();
  const entries = await operations.jsonValue();
  expect(entries.map(({ kind }) => kind)).toEqual(['remove', 'remove', 'restore', 'remove', 'restore']);
  expect(entries.every(({ cancelled, status }) => cancelled && status === 'cancelled')).toBe(true);
  await operations.dispose();
});

for (const action of ['reset', 'remove', 'restore'] as const) {
  test(`keeps presets available when ${action} replaces a queued preview`, async ({ page }) => {
    await page.goto('http://localhost:4321/');
    const root = page.locator('[data-particle-playground]');
    await root.scrollIntoViewIfNeeded();
    // aria-busy is also false during initial snapshot preparation. Start this
    // scheduling regression from the ready state, independently of capture cost.
    await expect(root.locator('[data-status]')).toHaveText('Ready', { timeout: 15_000 });
    await root.evaluate((element, action) => {
      element.querySelector<HTMLButtonElement>('[data-preset="vapor"]')!.click();
      element.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!.click();
    }, action);
    await expect(root).toHaveAttribute('aria-busy', 'false');
    await expect(root.locator('[data-preset]:disabled')).toHaveCount(0);
    await root.locator('[data-preset="scatter"]').click();
    await expect(root.locator('[data-preset="scatter"]')).toHaveAttribute('aria-pressed', 'true');
  });
}

test('runs the snapshotless remove and restore lifecycle', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { Disintegrator, defineEffect } = await import('../../src/core');
    const animate = ({ layer }: { layer: HTMLElement }) =>
      layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 20 });
    const paired = defineEffect({
      remove: { needsSnapshot: false, animate },
      restore: { needsSnapshot: false, animate },
    });
    const target = document.createElement('article');
    Object.assign(target.style, { height: '40px', width: '80px' });
    document.body.append(target);
    const disintegrator = new Disintegrator({
      effect: paired,
      layout: false,
      preparation: false,
      sound: false,
    });

    const removal = disintegrator.remove(target, { retain: true });
    const removed = await removal.finished;
    const retained = disintegrator.take(removal.removalId!);
    document.body.append(retained!);
    const restored = await disintegrator.restore(retained!).finished;
    const overlayCount = document.querySelectorAll('[aria-hidden="true"]').length;
    disintegrator.destroy();

    return {
      connected: retained?.isConnected ?? false,
      overlayCount,
      removed: removed.status,
      restored: restored.status,
    };
  });

  expect(result).toEqual({ connected: true, overlayCount: 0, removed: 'completed', restored: 'completed' });
});

test('does not allocate WebGL merely because the particle entry is imported', async ({ page }) => {
  const requests = await page.evaluate(async () => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    let webglRequests = 0;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, contextId: string, options?: unknown) {
      if (contextId === 'webgl2') webglRequests += 1;
      return originalGetContext.call(this, contextId, options as never);
    } as typeof HTMLCanvasElement.prototype.getContext;

    await import('../../src/particles');
    await new Promise((resolve) => setTimeout(resolve, 250));
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    return webglRequests;
  });

  expect(requests).toBe(0);
});

test('animates two localized heading words only after the visitor uses the snap cursor', async ({ page }) => {
  test.setTimeout(45_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const variants = [
    {
      path: '/ru/',
      title: 'Современная, эффектная,',
      words: ['Современная,', 'эффектная,'],
      label: 'Современная, эффектная, универсальная и без CSS-зависимостей',
      action: 'Щёлкнуть перчаткой и удалить выделенное слово',
      removeHint: 'Щёлкните, чтобы развеять!',
      restoreHint: 'Щёлкните, чтобы вернуть!',
    },
    {
      path: '/zh/',
      title: '现代、惊艳、',
      words: ['现代、', '惊艳、'],
      label: '现代、惊艳、 通用，无需 CSS 依赖',
      action: '播放灭霸响指并移除高亮词语',
      removeHint: '打个响指，让它消散！',
      restoreHint: '打个响指，让它复原！',
    },
    {
      path: '/ko/',
      title: '현대적이고 인상적이며,',
      words: ['현대적이고', '인상적이며,'],
      label: '현대적이고 인상적이며, 범용적이고 CSS 의존성이 없습니다',
      action: '타노스 스냅으로 강조된 단어 제거',
      removeHint: '손가락을 튕겨 분해하세요!',
      restoreHint: '손가락을 튕겨 되돌리세요!',
    },
    {
      path: '/?lang=en',
      title: 'Modern, striking,',
      words: ['Modern,', 'striking,'],
      label: 'Modern, striking, versatile, and CSS-free',
      action: 'Play the Thanos snap and remove the highlighted word',
      removeHint: 'Snap to disintegrate!',
      restoreHint: 'Snap to restore!',
    },
  ] as const;

  for (const variant of variants) {
    await page.goto(`http://localhost:4321${variant.path}`);
    const heading = page.locator('[data-disintegrating-text]');
    await expect(heading).toHaveAccessibleName(variant.label);
    await expect(heading).toHaveAttribute('data-disintegrating-text-state', 'reduced-motion');
    await expect(heading).toHaveCSS('hyphens', 'manual');
    await expect(heading).toHaveCSS('overflow-wrap', 'break-word');
    await expect(heading.locator('.disintegrating-text-line')).toHaveText(variant.title);
    const word = heading.locator('[data-disintegrating-text-word]');
    await expect(word).toHaveCount(2);
    await expect(word.locator('[data-disintegrating-text-shaped]')).toHaveText([...variant.words]);
    expect(await word.evaluateAll((elements) => elements.map((element) => element.dataset.placeholder))).toEqual(
      variant.words,
    );
    await expect(word.locator('[data-resident-glyph]')).toHaveCount(0);
    const localizedTrigger = heading.locator('[data-disintegrating-text-trigger]');
    await expect(localizedTrigger).toBeDisabled();
    await expect(localizedTrigger).toHaveAccessibleName(variant.action);
    await expect(localizedTrigger).toHaveAttribute('data-snap-cursor-remove-hint', variant.removeHint);
    await expect(localizedTrigger).toHaveAttribute('data-snap-cursor-restore-hint', variant.restoreHint);
    await expect(page.locator('[data-snap-cursor]')).toHaveCount(0);
  }

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    const record = {
      audio: [] as string[],
      detached: 0,
      heights: new Set<number>(),
      overlays: 0,
      sourceDisconnected: 0,
      states: new Set<string>(),
      widths: new Set<string>(),
    };
    (window as unknown as { __cycle: typeof record }).__cycle = record;
    HTMLMediaElement.prototype.play = function () {
      record.audio.push(new URL(this.currentSrc || this.src).pathname);
      return Promise.reject(new DOMException('Muted by the browser test.', 'NotAllowedError'));
    };
    window.setInterval(() => {
      const heading = document.querySelector<HTMLElement>('[data-disintegrating-text]');
      const words = [...document.querySelectorAll<HTMLElement>('[data-disintegrating-text-word]')];
      const state = heading?.dataset.disintegratingTextState;
      if (heading === null || words.length === 0 || state === undefined || state === 'preparing') return;
      record.states.add(state);
      record.widths.add(words.map((word) => Math.round(word.getBoundingClientRect().width * 100)).join('|'));
      record.heights.add(Math.round(heading.getBoundingClientRect().height * 100));
      for (const word of words) {
        const source = word.querySelector('[data-disintegrating-text-shaped]');
        if (word.querySelector('[data-resident-glyph]') === null) record.detached += 1;
        if (source === null || !source.isConnected) record.sourceDisconnected += 1;
      }
      record.overlays = Math.max(record.overlays, document.querySelectorAll('body > div[aria-hidden="true"]').length);
    }, 40);
  });
  await page.reload();
  const heading = page.locator('[data-disintegrating-text]');
  const trigger = heading.locator('[data-disintegrating-text-trigger]');
  const word = heading.locator('[data-disintegrating-text-word]');
  const run = word.locator('[data-disintegrating-text-shaped]');
  const cursor = page.locator('[data-snap-cursor]');
  await expect(heading).toHaveAttribute('data-disintegrating-text-state', 'ready');
  await expect(trigger).toBeEnabled();
  await expect(trigger).toHaveAttribute('aria-pressed', 'false');
  await expect(cursor).toHaveCount(1);
  await expect(word.locator('[data-resident-glyph]')).toHaveCount(2);
  expect(await run.evaluateAll((elements) => elements.map((element) => getComputedStyle(element).color))).toEqual([
    'rgba(0, 0, 0, 0)',
    'rgba(0, 0, 0, 0)',
  ]);
  const before = await heading.boundingBox();

  await page.waitForTimeout(600);
  await expect(heading).toHaveAttribute('data-disintegrating-text-state', 'ready');
  await expect(word.locator('[data-resident-glyph]')).toHaveCount(2);

  const finePointer = await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches);
  if (finePointer) {
    await trigger.hover();
    await expect(cursor).toHaveAttribute('data-visible', '');
    await expect(cursor).toHaveAttribute('data-hint', '');
    await expect(cursor.locator('.snap-cursor-hint')).toHaveText('Snap to disintegrate!');
    await expect(cursor).toHaveCSS('opacity', '1');
    await expect(trigger).toHaveCSS('cursor', 'none');
  }

  await trigger.click();
  await expect(heading).toHaveAttribute('data-disintegrating-text-state', 'snapping');
  await expect(cursor).toHaveAttribute('data-hint', '');
  await expect(cursor.locator('.snap-cursor-hint')).toHaveText('Snap to disintegrate!');
  await expect(trigger).toBeDisabled();
  if (finePointer) {
    const transform = await cursor.evaluate((element) => getComputedStyle(element).transform);
    await page.mouse.move(40, 600);
    await expect.poll(() => cursor.evaluate((element) => getComputedStyle(element).transform)).not.toBe(transform);
    await expect(cursor).toHaveAttribute('data-visible', '');
    await expect(cursor).toHaveAttribute('data-hint', '');
    await expect(page.locator('html')).toHaveAttribute('data-snap-cursor-active', '');
    await expect(page.locator('body')).toHaveCSS('cursor', 'none');
  }
  await expect(heading).toHaveAttribute('data-disintegrating-text-state', 'removing', { timeout: 2500 });
  await expect(heading).toHaveAttribute('data-disintegrating-text-state', 'removed', { timeout: 7000 });
  await expect(trigger).toBeEnabled();
  await expect(trigger).toHaveAttribute('aria-pressed', 'true');
  await expect(word.locator('[data-resident-glyph]')).toHaveCount(0);
  if (finePointer) {
    await expect(cursor).not.toHaveAttribute('data-visible', '');
    await expect(page.locator('html')).not.toHaveAttribute('data-snap-cursor-active', '');
    await trigger.hover();
    await expect(cursor).toHaveAttribute('data-hint', '');
    await expect(cursor.locator('.snap-cursor-hint')).toHaveText('Snap to restore!');
  }
  const removedBounds = await heading.boundingBox();

  await page.waitForTimeout(600);
  await expect(heading).toHaveAttribute('data-disintegrating-text-state', 'removed');
  await expect(word.locator('[data-resident-glyph]')).toHaveCount(0);

  await trigger.click();
  await expect(heading).toHaveAttribute('data-disintegrating-text-state', 'reversing');
  await expect(trigger).toBeDisabled();
  if (finePointer) {
    await expect(cursor).toHaveAttribute('data-hint', '');
    await expect(cursor.locator('.snap-cursor-hint')).toHaveText('Snap to restore!');
  }
  await expect(heading).toHaveAttribute('data-disintegrating-text-state', 'restoring', { timeout: 3000 });
  await expect(heading).toHaveAttribute('data-disintegrating-text-state', 'ready', { timeout: 9000 });
  await expect(trigger).toBeEnabled();
  await expect(trigger).toHaveAttribute('aria-pressed', 'false');
  await expect(word.locator('[data-resident-glyph]')).toHaveCount(2);

  const cycle = await page.evaluate(() => {
    const record = (
      window as unknown as {
        __cycle: {
          audio: string[];
          detached: number;
          heights: Set<number>;
          overlays: number;
          sourceDisconnected: number;
          states: Set<string>;
          widths: Set<string>;
        };
      }
    ).__cycle;
    return {
      audio: record.audio,
      detached: record.detached,
      heights: record.heights.size,
      overlays: record.overlays,
      sourceDisconnected: record.sourceDisconnected,
      states: [...record.states],
      widths: record.widths.size,
    };
  });
  expect(cycle.audio).toHaveLength(2);
  expect(cycle.audio[0]).toContain('gauntlet-snap');
  expect(cycle.audio[1]).toContain('gauntlet-time');
  expect(cycle.overlays).toBeGreaterThan(0);
  expect(cycle.detached).toBeGreaterThan(0);
  expect(cycle.sourceDisconnected).toBe(0);
  expect(cycle.widths).toBe(1);
  expect(cycle.heights).toBe(1);
  expect(cycle.states).toContain('removed');
  await expect(heading.locator('[data-disintegrating-text-run-state="ready"]')).toHaveCount(2);
  const bitmap = await word
    .locator('[data-resident-glyph]')
    .first()
    .evaluate((resident) => {
      const canvas = resident as HTMLCanvasElement;
      const bounds = canvas.getBoundingClientRect();
      const copy = document.createElement('canvas');
      copy.width = canvas.width;
      copy.height = canvas.height;
      const copyContext = copy.getContext('2d')!;
      copyContext.globalCompositeOperation = 'copy';
      copyContext.drawImage(canvas, 0, 0);
      const sourcePixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      const copyPixels = copy.getContext('2d')!.getImageData(0, 0, copy.width, copy.height).data;
      const identical =
        sourcePixels.length === copyPixels.length && sourcePixels.every((value, index) => value === copyPixels[index]);
      copy.width = 0;
      copy.height = 0;
      return {
        backingHeight: canvas.height,
        backingWidth: canvas.width,
        cssHeight: bounds.height,
        cssWidth: bounds.width,
        identical,
        physicalLeft: bounds.left * devicePixelRatio,
        physicalTop: bounds.top * devicePixelRatio,
        ratio: devicePixelRatio,
      };
    });
  expect(bitmap.identical).toBe(true);
  expect(Math.abs(bitmap.backingWidth / bitmap.cssWidth - bitmap.ratio)).toBeLessThan(0.01);
  expect(Math.abs(bitmap.backingHeight / bitmap.cssHeight - bitmap.ratio)).toBeLessThan(0.01);
  expect(bitmap.physicalLeft).toBeCloseTo(Math.round(bitmap.physicalLeft), 1);
  expect(bitmap.physicalTop).toBeCloseTo(Math.round(bitmap.physicalTop), 1);
  const after = await heading.boundingBox();
  expect(before).not.toBeNull();
  expect(removedBounds).not.toBeNull();
  expect(after).not.toBeNull();
  expect(Math.abs(removedBounds!.width - before!.width)).toBeLessThan(0.5);
  expect(Math.abs(removedBounds!.height - before!.height)).toBeLessThan(0.5);
  expect(Math.abs(after!.width - before!.width)).toBeLessThan(0.5);
  expect(Math.abs(after!.height - before!.height)).toBeLessThan(0.5);
});

test('preserves the heading lifecycle when WebGL2 is unavailable', async ({ page }) => {
  test.setTimeout(20_000);
  await page.addInitScript(() => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, contextId: string, options?: unknown) {
      if (contextId === 'webgl2') return null;
      return originalGetContext.call(this, contextId, options as never);
    } as typeof HTMLCanvasElement.prototype.getContext;
    HTMLMediaElement.prototype.play = () =>
      Promise.reject(new DOMException('Muted by the browser test.', 'NotAllowedError'));
  });
  await page.goto('http://localhost:4321/?lang=en');

  const heading = page.locator('[data-disintegrating-text]');
  const trigger = heading.locator('[data-disintegrating-text-trigger]');
  const residents = heading.locator('[data-resident-glyph]');
  await expect(heading).toHaveAttribute('data-disintegrating-text-state', 'ready');
  await expect(residents).toHaveCount(2);

  await trigger.click();
  await expect(heading).toHaveAttribute('data-disintegrating-text-state', 'removed', { timeout: 5000 });
  await expect(residents).toHaveCount(0);

  await trigger.click();
  await expect(heading).toHaveAttribute('data-disintegrating-text-state', 'ready', { timeout: 6000 });
  await expect(residents).toHaveCount(2);
});

test('configures and runs the home-page particle playground', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium');
  test.setTimeout(45_000);
  await page.goto('http://localhost:4321/');

  const root = page.locator('[data-particle-playground]');
  await root.scrollIntoViewIfNeeded();
  await expect(root.locator('[data-preset="dust"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(root.locator('[data-operation="remove"]')).toHaveAttribute('aria-selected', 'true');
  await expect(root.locator('[data-operation="restore"]')).toHaveAttribute('aria-selected', 'false');
  await expect(root.locator('[data-width-option="narrow"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(root.locator('.playground-card')).toHaveAttribute('data-card-width', 'narrow');
  await expect(root.locator('[data-curve]')).toHaveValue('settle');
  await expect(root.locator('[data-sound-enabled]')).toBeChecked();
  await expect(root.locator('[data-sound-source]')).toHaveValue('dust');
  await expect(root.locator('[data-sound-reverse]')).not.toBeChecked();
  await expect(root.locator('[data-group-panel="sound"] input[type="range"]')).toHaveCount(4);
  await expect(root.locator('[data-group-panel="sound"]')).toBeHidden();
  await expect(root.locator('.playground-field-heading').first().locator('small')).toBeVisible();
  await root.locator('[data-group-tab="sound"]').click();
  await expect(root.locator('[data-group-panel="sound"]')).toBeVisible();
  const soundSource = root.locator('[data-sound-source]');
  const vaporPreset = root.locator('[data-preset="vapor"]');
  await soundSource.selectOption('scatter');
  await expect(root).toHaveAttribute('aria-busy', 'true');
  await expect(root).toHaveAttribute('aria-busy', 'false');
  await vaporPreset.click();
  await expect(soundSource).toHaveValue('vapor');
  await root.locator('[data-operation="restore"]').click();
  await expect(root.locator('[data-sound-source]')).toHaveValue('dust');
  await expect(root.locator('[data-sound-reverse]')).toBeChecked();
  await root.locator('[data-operation="remove"]').click();
  await expect(root.locator('[data-sound-source]')).toHaveValue('vapor');

  await root.locator('[data-local-audio-input]').setInputFiles('src/sounds/dust.mp3');
  await expect(root.locator('[data-sound-source] option:checked')).toHaveText('dust.mp3');
  const customSound = await root.locator('[data-sound-source]').inputValue();
  expect(customSound).toMatch(/^custom:/);
  await expect(root.locator('[data-code]')).toContainText('new URL("./dust.mp3", import.meta.url)');
  await page.reload();
  await expect(root.locator('[data-sound-source]')).toHaveValue(customSound);
  await expect(root.locator('[data-sound-source] option:checked')).toHaveText('dust.mp3');
  await root.locator('[data-group-tab="sound"]').click();
  await root.locator('[data-sound-source]').selectOption('vapor');
  await root.locator('[data-group-tab="timing"]').click();
  await expect(root.locator('[data-view-panel="preview"]')).toBeVisible();
  await expect(root.locator('[data-view-panel="code"]')).toBeHidden();
  await root.locator('[data-view-tab="code"]').click();
  await expect(root.locator('[data-view-panel="code"]')).toBeVisible();
  await expect(root.locator('[data-code]')).toContainText("from 'vanilla-disintegrate/snapdom'");
  await expect(root.locator('[data-code]')).toContainText('remove: particlePresets.vapor');
  await expect(root.locator('[data-code]')).toContainText('restore: particlePresets.dust');
  await expect(root.locator('[data-code]')).toContainText('createParticleEffect');
  await root.locator('[data-view-tab="preview"]').click();

  const setRange = async (key: string, value: string) => {
    await root.locator(`[data-option="${key}"]`).evaluate((element, nextValue) => {
      const input = element as HTMLInputElement;
      input.value = nextValue;
      input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }, value);
  };
  await setRange('duration', '200');
  await setRange('stagger', '0');
  await setRange('verticalMin', '-180');
  await setRange('soundVolume', '0.5');
  await expect(root.locator('[data-preset][aria-pressed="true"]')).toHaveCount(0);
  await expect(root.locator('[data-code]')).toContainText('verticalTravel: [-180, -130]');
  await expect(root.locator('[data-code]')).toContainText('volume: 0.5');
  await expect(page).toHaveURL(/#p=[\w-]+$/);
  expect(await page.evaluate(() => window.location.hash.length)).toBeLessThan(120);
  await expect(root.locator('[data-status]')).toContainText('remove · completed', { timeout: 15_000 });

  await root.locator('[data-operation="restore"]').click();
  await expect(root.locator('[data-option="verticalMin"]')).toHaveValue('-210');
  await setRange('verticalMin', '-120');
  await expect(root.locator('[data-code]')).toContainText('verticalTravel: [-120, -30]');
  await root.locator('[data-operation="remove"]').click();
  await expect(root.locator('[data-option="verticalMin"]')).toHaveValue('-180');
  await expect(root.locator('[data-status]')).toContainText('remove · completed', { timeout: 15_000 });

  const remove = root.locator('[data-action="remove"]');
  await expect(remove).toBeEnabled();
  await remove.click();
  await expect(root.locator('[data-status]')).toContainText('remove · completed', { timeout: 15_000 });
  await expect(root.locator('.playground-card')).toHaveCount(0);

  const restore = root.locator('[data-action="restore"]');
  await expect(restore).toBeEnabled();
  await restore.click();
  await expect(root.locator('[data-status]')).toContainText('restore · completed', { timeout: 15_000 });
  await expect(root.locator('.playground-card')).toHaveCount(1);
});

test('releases a queued preset lock when the playground enters the back-forward cache', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium');
  await page.goto('http://localhost:4321/');

  const root = page.locator('[data-particle-playground]');
  await root.scrollIntoViewIfNeeded();
  await root.evaluate((element) => {
    element.querySelector<HTMLButtonElement>('[data-preset="vapor"]')?.click();
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });

  await expect(root.locator('[data-preset]:disabled')).toHaveCount(0);
  await root.locator('[data-preset="dust"]').click();
  await expect(root.locator('[data-preset="dust"]')).toHaveAttribute('aria-pressed', 'true');
});

test('keeps the documentation header above particle overlays', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium');
  await page.goto('http://localhost:4321/');

  const root = page.locator('[data-particle-playground]');
  await root.scrollIntoViewIfNeeded();
  const layers = await root.evaluate(async (element) => {
    const overlay = await new Promise<HTMLElement>((resolve, reject) => {
      const findOverlay = () =>
        [...document.body.children].find(
          (child): child is HTMLElement =>
            child instanceof HTMLElement && child.ariaHidden === 'true' && child.style.position === 'fixed',
        );
      const observer = new MutationObserver(() => {
        const candidate = findOverlay();
        if (candidate === undefined) return;
        window.clearTimeout(timeout);
        observer.disconnect();
        resolve(candidate);
      });
      const timeout = window.setTimeout(() => {
        observer.disconnect();
        reject(new Error('The particle overlay was not mounted.'));
      }, 5_000);
      observer.observe(document.body, { childList: true });
      element.querySelector<HTMLButtonElement>('[data-action="remove"]')?.click();
    });
    const header = document.querySelector<HTMLElement>('.docs-header');
    if (header === null) throw new Error('The documentation header is missing.');
    return {
      header: getComputedStyle(header).zIndex,
      overlay: getComputedStyle(overlay).zIndex,
    };
  });

  expect(layers).toEqual({ header: '2147483647', overlay: '2147483646' });
});

test('uses the system colour scheme until the user selects a theme', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('http://localhost:4321/ru/');

  const root = page.locator('html');
  await expect(root).toHaveAttribute('data-theme-preference', 'system');
  await expect(root).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('[data-theme-option="system"]')).toHaveAttribute('aria-pressed', 'true');

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(root).toHaveAttribute('data-theme', 'dark');

  await page.locator('[data-theme-option="light"]').click();
  await expect(root).toHaveAttribute('data-theme-preference', 'light');
  await expect(root).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(root).toHaveAttribute('data-theme-preference', 'light');
  await expect(root).toHaveAttribute('data-theme', 'light');
});

test('keeps documentation sidebars stationary while the article scrolls', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium');
  await page.goto('http://localhost:4321/ru/docs/reference/api/');

  const positions = async () =>
    page.locator('.docs-layout').evaluate(() => ({
      left: document.querySelector('.docs-sidebar')!.getBoundingClientRect().top,
      right: document.querySelector('.page-toc')!.getBoundingClientRect().top,
    }));
  const before = await positions();
  await page.evaluate(() => window.scrollTo(0, 300));
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  const after = await positions();

  expect(after.left).toBeCloseTo(before.left, 1);
  expect(after.right).toBeCloseTo(before.right, 1);
});

test('accepts exact numeric input for every playground range', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium');
  await page.goto('http://localhost:4321/');

  const root = page.locator('[data-particle-playground]');
  const ranges = root.locator('[data-option]');
  const values = root.locator('[data-value]');
  const code = root.locator('[data-code]');
  const enterValue = async (key: string, value: string) => {
    const input = root.locator(`[data-value="${key}"]`);
    await input.fill(value);
    await input.press('Enter');
    return input;
  };

  await expect(ranges).toHaveCount(22);
  await expect(values).toHaveCount(22);
  await expect(root.locator('[data-value]:not([type="number"])')).toHaveCount(0);
  expect(
    await root
      .locator('[data-group-panel]')
      .evaluateAll((panels) =>
        Object.fromEntries(
          panels.map((panel) => [
            (panel as HTMLElement).dataset.groupPanel,
            [...panel.querySelectorAll<HTMLElement>('[data-option]')].map((input) => input.dataset.option),
          ]),
        ),
      ),
  ).toEqual({
    timing: ['duration', 'stagger', 'releaseRandomness', 'fadeStart', 'layoutRelease'],
    horizontal: ['horizontalDrift', 'horizontalMin', 'horizontalMax', 'convergence'],
    vertical: ['verticalMin', 'verticalMax', 'swirl', 'waveTurns'],
    particles: ['particleSize', 'alphaThreshold', 'endScale', 'rotationMin', 'rotationMax'],
    sound: ['soundVolume', 'soundPlaybackRate', 'soundDelay', 'soundFadeDuration'],
  });
  await expect(root.locator('.playground-selectors [data-curve]')).toHaveCount(1);
  await expect(root.locator('.playground-selectors [data-release]')).toHaveCount(1);
  expect(
    await root.locator('[data-value="duration"]').evaluate((input) => {
      const wrapper = input.parentElement!;
      const unit = wrapper.querySelector('span')!;
      const inputBounds = input.getBoundingClientRect();
      const unitBounds = unit.getBoundingClientRect();
      return {
        flex: getComputedStyle(wrapper).display.includes('flex'),
        sameRow: unitBounds.top < inputBounds.bottom && unitBounds.bottom > inputBounds.top,
        unitOnRight: unitBounds.left >= inputBounds.right - 1,
      };
    }),
  ).toEqual({ flex: true, sameRow: true, unitOnRight: true });

  await expect(root.locator('[data-value="convergence"]')).toHaveValue('0.00');
  await expect(root.locator('[data-value="endScale"]')).toHaveValue('0.55');
  await expect(root.locator('[data-value="particleSize"]')).toHaveValue('0.00');
  await expect(root.locator('[data-value="releaseRandomness"]')).toHaveValue('0.22');
  await expect(root.locator('[data-value="fadeStart"]')).toHaveValue('0.30');
  await expect(root.locator('[data-value="layoutRelease"]')).toHaveValue('0.60');
  await expect(root.locator('[data-value="waveTurns"]')).toHaveValue('1.00');
  await expect(root.locator('[data-value="soundPlaybackRate"]')).toHaveValue('1.00');
  await expect(root.locator('[data-value="soundFadeDuration"]')).toHaveValue('0.18');
  await expect(root.locator('[data-value="soundVolume"]')).toHaveValue('32');
  await expect(root.locator('[data-release] option')).toHaveCount(7);

  await root.locator('[data-group-tab="particles"]').click();
  await expect(await enterValue('endScale', '0.4')).toHaveValue('0.40');
  await expect(code).toContainText('endScale: 0.4');

  await root.locator('[data-group-tab="timing"]').click();
  await expect(await enterValue('duration', '926')).toHaveValue('926');
  await expect(await enterValue('releaseRandomness', '0.5')).toHaveValue('0.50');
  await expect(await enterValue('fadeStart', '0.45')).toHaveValue('0.45');
  await expect(await enterValue('layoutRelease', '0.75')).toHaveValue('0.75');
  await expect(code).toContainText('duration: 926');
  await expect(code).toContainText('releaseRandomness: 0.5');
  await expect(code).toContainText('fadeStart: 0.45');
  await expect(code).toContainText('layoutRelease: 0.75');
  await expect(root.locator('[data-preset][aria-pressed="true"]')).toHaveCount(0);

  await root.locator('[data-group-tab="vertical"]').click();
  await expect(await enterValue('swirl', '19')).toHaveValue('19');
  await expect(await enterValue('waveTurns', '2.5')).toHaveValue('2.50');
  await expect(root.locator('[data-value="duration"]')).toHaveValue('926');
  await expect(code).toContainText('duration: 926');
  await expect(code).toContainText('waveTurns: 2.5');

  await root.locator('[data-group-tab="particles"]').click();
  await expect(await enterValue('particleSize', '4')).toHaveValue('4.00');
  await expect(await enterValue('alphaThreshold', '0.5')).toHaveValue('0.50');
  await expect(await enterValue('rotationMin', '90')).toHaveValue('90');
  await expect(await enterValue('rotationMax', '180')).toHaveValue('180');
  await root.locator('[data-release]').selectOption('bottom');
  await expect(code).toContainText('particleSize: 4');
  await expect(code).toContainText('alphaThreshold: 0.5');
  await expect(code).toContainText("release: 'bottom'");
  await expect(code).toContainText('rotation: [90, 180]');
  await expect(page).toHaveURL(/#p=[\w-]+$/);

  await page.reload();
  await expect(root.locator('[data-value="duration"]')).toHaveValue('926');
  await expect(root.locator('[data-value="particleSize"]')).toHaveValue('4.00');
  await expect(root.locator('[data-value="fadeStart"]')).toHaveValue('0.45');
  await expect(root.locator('[data-value="layoutRelease"]')).toHaveValue('0.75');
  await expect(root.locator('[data-value="waveTurns"]')).toHaveValue('2.50');
  await expect(root.locator('[data-release]')).toHaveValue('bottom');
  await expect(code).toContainText('duration: 926');

  await root.locator('[data-group-tab="sound"]').click();
  await expect(root.locator('[data-value="soundVolume"]')).toHaveValue('32');
  await expect(await enterValue('soundVolume', '47')).toHaveValue('47');
  await expect(code).toContainText('volume: 0.47');

  await root.locator('[data-group-tab="timing"]').click();
  await expect(await enterValue('duration', '9999')).toHaveValue('3000');
  await expect(code).toContainText('duration: 3000');
});

test('keeps localized sound controls in an aligned grid', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium');
  await page.goto('http://localhost:4321/ru/');

  const root = page.locator('[data-particle-playground]');
  await root.locator('[data-group-tab="sound"]').click();
  const soundRanges = root.locator('.playground-sound-ranges .playground-range');
  await expect(soundRanges).toHaveCount(4);
  await expect(soundRanges.locator('small')).toHaveText([
    'Уровень 0–100%.',
    'Темп и высота тона.',
    'Пауза перед стартом.',
    'Нарастание и затухание.',
  ]);
  const layout = await soundRanges.evaluateAll((elements) => {
    const container = elements[0]?.parentElement;
    if (container === null || container === undefined) throw new Error('Sound range grid is missing');
    const columns = getComputedStyle(container).gridTemplateColumns.split(' ').length;
    const items = elements.map((element) => {
      const bounds = element.getBoundingClientRect();
      const sliderBounds = element.querySelector('input[type="range"]')!.getBoundingClientRect();
      const descriptionBounds = element.querySelector('small')!.getBoundingClientRect();
      return {
        bottom: bounds.bottom,
        height: bounds.height,
        sliderTop: sliderBounds.top,
        top: bounds.top,
        width: bounds.width,
        singleLine: descriptionBounds.height < 20,
      };
    });
    const aligned = (first: number, second: number) =>
      Math.abs(items[first]!.top - items[second]!.top) < 1 &&
      Math.abs(items[first]!.height - items[second]!.height) < 1 &&
      Math.abs(items[first]!.sliderTop - items[second]!.sliderTop) < 1;
    return {
      columns,
      rowsAligned: columns === 2 ? aligned(0, 1) && aligned(2, 3) : true,
      sameWidth: items.every((item) => Math.abs(item.width - items[0]!.width) < 1),
      singleColumnOrder: columns === 1 ? items.slice(1).every((item, index) => item.top >= items[index]!.bottom) : true,
      singleLine: items.every((item) => item.singleLine),
    };
  });
  expect(layout).toEqual({
    columns: (page.viewportSize()?.width ?? 0) <= 500 ? 1 : 2,
    rowsAligned: true,
    sameWidth: true,
    singleColumnOrder: true,
    singleLine: true,
  });
});

test('keeps independent presets across operation tabs and hash reloads', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium');
  await page.goto('http://localhost:4321/');

  const root = page.locator('[data-particle-playground]');
  const scatter = root.locator('[data-preset="scatter"]');
  const code = root.locator('[data-code]');
  await root.locator('[data-option="duration"]').evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = '1450';
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
  });
  await expect(root.locator('[data-preset][aria-pressed="true"]')).toHaveCount(0);
  await expect(code).toContainText('createParticleEffect');

  await root.locator('[data-operation="restore"]').click();
  await scatter.click();
  await expect(scatter).toHaveAttribute('aria-pressed', 'true');
  await expect(code).toContainText('restore: particlePresets.scatter');
  await expect(code).toContainText('duration: 1450');
  await expect(code).toContainText('createParticleEffect');
  await expect(root).toHaveAttribute('aria-busy', 'true');
  await expect(root).toHaveAttribute('aria-busy', 'false');

  await root.locator('[data-operation="remove"]').click();
  await expect(root).toHaveAttribute('aria-busy', 'true');
  await expect(root).toHaveAttribute('aria-busy', 'false');
  await expect(root.locator('[data-preset][aria-pressed="true"]')).toHaveCount(0);
  await root.locator('[data-preset="vapor"]').click();
  await expect(code).toContainText('remove: particlePresets.vapor');
  await expect(code).toContainText('restore: particlePresets.scatter');
  await expect(code).toContainText('createParticleEffect');
  await expect(code).not.toContainText("preset: '");
  await expect(page).toHaveURL(/#p=[\w-]+$/);
  expect(await page.evaluate(() => window.location.hash.length)).toBeLessThan(120);

  const previousHash = await page.evaluate(() => window.location.hash);
  await root.locator('[data-operation="restore"]').click();
  await root.locator('[data-width-option="wide"]').click();
  await expect(root.locator('[data-operation="restore"]')).toHaveAttribute('aria-selected', 'true');
  await expect(root.locator('[data-width-option="wide"]')).toHaveAttribute('aria-pressed', 'true');
  await root.locator('[data-copy="link"]').dispatchEvent('click');
  await expect.poll(() => page.evaluate(() => window.location.hash)).not.toBe(previousHash);
  await expect.poll(() => page.evaluate(() => window.location.hash.length)).toBeLessThan(120);

  await page.reload();
  await expect(scatter).toHaveAttribute('aria-pressed', 'true');
  await expect(code).toContainText('remove: particlePresets.vapor');
  await expect(code).toContainText('restore: particlePresets.scatter');
  await expect(code).toContainText('createParticleEffect');
  await expect(root.locator('[data-operation="restore"]')).toHaveAttribute('aria-selected', 'true');
  await expect(root.locator('[data-width-option="wide"]')).toHaveAttribute('aria-pressed', 'true');
});

test('restores an isolated playground snapshot with undo', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium');
  await page.goto('http://localhost:4321/');

  const root = page.locator('[data-particle-playground]');
  const states = await root.evaluate((element) => {
    const button = (selector: string) => element.querySelector(selector) as HTMLButtonElement;
    const duration = () => element.querySelector('[data-option="duration"]') as HTMLInputElement;
    const setDuration = (value: string) => {
      duration().value = value;
      duration().dispatchEvent(new InputEvent('input', { bubbles: true }));
    };
    const state = () => ({
      operation: element.getAttribute('data-playground-operation'),
      narrow: button('[data-width-option="narrow"]').getAttribute('aria-pressed'),
    });

    setDuration('1450');
    button('[data-operation="restore"]').click();
    button('[data-width-option="wide"]').click();
    button('[data-preset="scatter"]').click();
    button('[data-operation="remove"]').click();
    setDuration('1000');
    button('[data-action="undo"]').click();
    const afterPresetUndo = state();
    button('[data-operation="remove"]').click();
    const restoredDuration = duration().value;
    button('[data-operation="restore"]').click();

    button('[data-action="reset"]').click();
    const afterReset = state();
    button('[data-action="undo"]').click();
    const afterResetUndo = state();
    return { afterPresetUndo, afterReset, afterResetUndo, restoredDuration };
  });

  expect(states).toEqual({
    afterPresetUndo: { operation: 'restore', narrow: 'false' },
    afterReset: { operation: 'remove', narrow: 'true' },
    afterResetUndo: { operation: 'restore', narrow: 'false' },
    restoredDuration: '1450',
  });
});

test('deduplicates shared custom particle options in generated code', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium');
  await page.goto('http://localhost:4321/');

  const root = page.locator('[data-particle-playground]');
  const code = root.locator('[data-code]');
  const setRange = async (key: string, value: string) => {
    await root.locator(`[data-option="${key}"]`).evaluate((element, nextValue) => {
      const input = element as HTMLInputElement;
      input.value = nextValue;
      input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }, value);
  };
  const expectOccurrences = async (pattern: RegExp, count: number) => {
    expect((await code.innerText()).match(pattern) ?? []).toHaveLength(count);
  };
  const generatedEffect = async () => {
    const source = await code.innerText();
    return source.match(/effect: createParticleEffect\(\{[\s\S]*?\n {2}\}\),/)?.[0] ?? '';
  };

  await root.locator('[data-preset="vapor"]').click();
  await root.locator('[data-operation="restore"]').click();
  await root.locator('[data-preset="vapor"]').click();
  await root.locator('[data-operation="remove"]').click();
  await setRange('duration', '925');
  await expect(code).not.toContainText('const sharedParticleOptions: ParticleOptions');
  await expect(code).toContainText('duration: 925');
  await expect(code).not.toContainText('duration: 750');
  await expect(code).toContainText('restore: particlePresets.vapor');
  await expectOccurrences(/curve: 'float'/g, 1);
  await expectOccurrences(/\.\.\.sharedParticleOptions/g, 0);
  await expect(code).toContainText('const sharedSoundOptions =');
  await expectOccurrences(/src: 'vapor'/g, 1);
  await expectOccurrences(/\.\.\.sharedSoundOptions/g, 2);
  await expectOccurrences(/reverse: false/g, 1);
  await expectOccurrences(/reverse: true/g, 1);
  await expect(code).not.toContainText('const removeOptions');
  await expect(code).not.toContainText('const restoreOptions');
  expect(await generatedEffect()).toContain('restore: particlePresets.vapor,');

  await root.locator('[data-operation="restore"]').click();
  await setRange('duration', '925');
  await expectOccurrences(/duration: 925/g, 1);
  await expectOccurrences(/duration: 750/g, 0);
  await expect(code).toContainText('const sharedParticleOptions: ParticleOptions');
  await expectOccurrences(/sharedParticleOptions/g, 3);
  await expectOccurrences(/\.\.\.sharedParticleOptions/g, 0);
  expect(await generatedEffect()).toContain('remove: sharedParticleOptions,');
  expect(await generatedEffect()).toContain('restore: sharedParticleOptions,');

  await setRange('swirl', '19');
  await expectOccurrences(/swirl: 5/g, 1);
  await expectOccurrences(/swirl: 19/g, 1);
  await expectOccurrences(/\.\.\.sharedParticleOptions/g, 2);
});

test('recognizes preset values after edits and keeps audio toggles independent', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium');
  await page.goto('http://localhost:4321/');

  const root = page.locator('[data-particle-playground]');
  const dust = root.locator('[data-preset="dust"]');
  const code = root.locator('[data-code]');
  const setRange = async (key: string, value: string) => {
    await root.locator(`[data-option="${key}"]`).evaluate((element, nextValue) => {
      const input = element as HTMLInputElement;
      input.value = nextValue;
      input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }, value);
  };

  await expect(dust).toHaveAttribute('aria-pressed', 'true');
  await expect(code).toContainText("preset: 'dust'");
  await expect(code).not.toContainText('createParticleEffect');

  await setRange('duration', '900');
  await expect(dust).toHaveAttribute('aria-pressed', 'false');
  await expect(code).toContainText('createParticleEffect');
  await expect(page).toHaveURL(/#p=[\w-]+$/);
  const customHash = await page.evaluate(() => window.location.hash);

  const durationValue = root.locator('[data-value="duration"]');
  await durationValue.fill('850');
  await durationValue.press('Enter');
  expect(
    await root.evaluate((element) => ({
      particleSize: (element.querySelector('[data-option="particleSize"]') as HTMLInputElement).value,
      alphaThreshold: (element.querySelector('[data-option="alphaThreshold"]') as HTMLInputElement).value,
      curve: (element.querySelector('[data-curve]') as HTMLSelectElement).value,
      release: (element.querySelector('[data-release]') as HTMLSelectElement).value,
      releaseRandomness: (element.querySelector('[data-option="releaseRandomness"]') as HTMLInputElement).value,
      duration: (element.querySelector('[data-option="duration"]') as HTMLInputElement).value,
      stagger: (element.querySelector('[data-option="stagger"]') as HTMLInputElement).value,
      fadeStart: (element.querySelector('[data-option="fadeStart"]') as HTMLInputElement).value,
      layoutRelease: (element.querySelector('[data-option="layoutRelease"]') as HTMLInputElement).value,
      horizontalDrift: (element.querySelector('[data-option="horizontalDrift"]') as HTMLInputElement).value,
      horizontalMin: (element.querySelector('[data-option="horizontalMin"]') as HTMLInputElement).value,
      horizontalMax: (element.querySelector('[data-option="horizontalMax"]') as HTMLInputElement).value,
      verticalMin: (element.querySelector('[data-option="verticalMin"]') as HTMLInputElement).value,
      verticalMax: (element.querySelector('[data-option="verticalMax"]') as HTMLInputElement).value,
      convergence: (element.querySelector('[data-option="convergence"]') as HTMLInputElement).value,
      swirl: (element.querySelector('[data-option="swirl"]') as HTMLInputElement).value,
      waveTurns: (element.querySelector('[data-option="waveTurns"]') as HTMLInputElement).value,
      endScale: (element.querySelector('[data-option="endScale"]') as HTMLInputElement).value,
      rotationMin: (element.querySelector('[data-option="rotationMin"]') as HTMLInputElement).value,
      rotationMax: (element.querySelector('[data-option="rotationMax"]') as HTMLInputElement).value,
    })),
  ).toEqual({
    particleSize: '0',
    alphaThreshold: '0',
    curve: 'settle',
    release: 'left',
    releaseRandomness: '0.22',
    duration: '850',
    stagger: '130',
    fadeStart: '0.3',
    layoutRelease: '0.6',
    horizontalDrift: '70',
    horizontalMin: '40',
    horizontalMax: '190',
    verticalMin: '-210',
    verticalMax: '-30',
    convergence: '0',
    swirl: '34',
    waveTurns: '1',
    endScale: '0.55',
    rotationMin: '0',
    rotationMax: '0',
  });
  await expect(dust).toHaveAttribute('aria-pressed', 'true');
  await expect(code).toContainText("preset: 'dust'");
  await expect(code).not.toContainText('createParticleEffect');
  await expect(page).toHaveURL(/#p=[\w-]+$/);
  await expect.poll(() => page.evaluate(() => window.location.hash)).not.toBe(customHash);

  await page.reload();
  await expect(dust).toHaveAttribute('aria-pressed', 'true');
  await expect(code).toContainText("preset: 'dust'");

  await root.locator('[data-group-tab="sound"]').click();
  await root.locator('.playground-sound-enabled label').click();
  await expect(root.locator('[data-sound-enabled]')).not.toBeChecked();
  await expect(dust).toHaveAttribute('aria-pressed', 'true');
  await expect(code).toContainText('builtInPresets.dust.effect');
  await expect(code).not.toContainText('createParticleEffect');

  await root.locator('[data-operation="restore"]').click();
  await expect(dust).toHaveAttribute('aria-pressed', 'true');
  await root.locator('.playground-sound-enabled label').click();
  await expect(root.locator('[data-sound-enabled]')).not.toBeChecked();
  await expect(dust).toHaveAttribute('aria-pressed', 'true');
  await expect(code).toContainText('sound: false');
  await expect(code).not.toContainText('createParticleEffect');
});

async function requireWebGL2(page: Page) {
  const available = await page.evaluate(() => {
    const context = document.createElement('canvas').getContext('webgl2');
    if (context === null) return false;
    context.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  });
  test.skip(!available, 'This browser environment does not expose WebGL2; fallback behavior is tested separately.');
}

test('runs, reuses and releases a real WebGL2 particle renderer', async ({ page }) => {
  await requireWebGL2(page);
  const result = await page.evaluate(async () => {
    const { Disintegrator, defineEffect } = await import('../../src/core');
    const { createParticleAnimation, createParticleRestoreAnimation } = await import('../../src/particles');
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    let created = 0;
    let released = 0;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, contextId: string, options?: unknown) {
      const context = originalGetContext.call(this, contextId, options as never);
      if (contextId !== 'webgl2' || context === null) return context;
      created += 1;
      const gl = context as WebGL2RenderingContext;
      const getExtension = gl.getExtension.bind(gl);
      gl.getExtension = ((name: string) => {
        const extension = getExtension(name);
        if (name !== 'WEBGL_lose_context' || extension === null) return extension;
        const loseContext = (extension as WEBGL_lose_context).loseContext.bind(extension);
        (extension as WEBGL_lose_context).loseContext = () => {
          released += 1;
          loseContext();
        };
        return extension;
      }) as typeof gl.getExtension;
      return gl;
    } as typeof HTMLCanvasElement.prototype.getContext;

    const targets = [document.createElement('div'), document.createElement('div')];
    for (const target of targets) {
      Object.assign(target.style, { background: '#8b5cf6', height: '48px', width: '64px' });
      document.body.append(target);
    }
    const capture = () => {
      const snapshot = document.createElement('canvas');
      snapshot.width = 64;
      snapshot.height = 48;
      const context = snapshot.getContext('2d')!;
      context.fillStyle = '#8b5cf6';
      context.fillRect(0, 0, snapshot.width, snapshot.height);
      return snapshot;
    };
    const particle = defineEffect({
      remove: { animate: createParticleAnimation({ duration: 40, stagger: 0 }) },
      restore: { animate: createParticleRestoreAnimation({ duration: 40, stagger: 0 }) },
    });
    const disintegrator = new Disintegrator({
      capture,
      effect: particle,
      layout: false,
      preparation: false,
      sound: false,
    });
    const statuses = [];
    const activeCanvases = [];
    for (const target of targets) {
      const operation = disintegrator.remove(target);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      activeCanvases.push(document.querySelectorAll('[aria-hidden="true"] canvas').length);
      statuses.push((await operation.finished).status);
    }
    disintegrator.destroy();
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    HTMLCanvasElement.prototype.getContext = originalGetContext;

    return { activeCanvases, created, released, statuses };
  });

  expect(result.activeCanvases).toEqual([1, 1]);
  expect(result.statuses).toEqual(['completed', 'completed']);
  expect(result.created).toBe(1);
  expect(result.released).toBe(result.created);
});

test('keeps exact particle endpoints pixel-identical on expanded geometry', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium');
  const result = await page.evaluate(async () => {
    const { createParticleAnimation } = await import('../../src/particles');
    const snapshot = document.createElement('canvas');
    snapshot.width = 148;
    snapshot.height = 76;
    const source = snapshot.getContext('2d')!;
    source.font = '700 58px sans-serif';
    source.fillStyle = '#f7f4fb';
    source.fillText('Aa', 2, 58);

    const playback = createParticleAnimation({
      duration: 1_000_000,
      stagger: 0,
      horizontalDrift: 37,
      horizontalTravel: [-23, 41],
      verticalTravel: [-71, 13],
      swirl: 9,
      renderQuality: 'exact',
    })({
      operation: 'remove',
      element: document.createElement('div'),
      layer: document.createElement('div'),
      visual: null,
      snapshot,
      bounds: new DOMRect(12.3, 45.6, 74, 38),
      signal: new AbortController().signal,
      reducedMotion: false,
      random: () => 0.5,
      addCleanup: () => undefined,
    }) as import('../../src/particle-renderer').ParticleRenderer | null;

    if (playback === null) return { available: false };
    playback.animation.pause();
    playback.animation.currentTime = 0;
    const rendered = playback.canvas;
    const cssWidth = Number.parseFloat(rendered.style.width);
    const cssHeight = Number.parseFloat(rendered.style.height);
    const scaleX = rendered.width / cssWidth;
    const scaleY = rendered.height / cssHeight;
    const sourceX = -Number.parseFloat(rendered.style.left) * scaleX;
    const sourceY = -Number.parseFloat(rendered.style.top) * scaleY;
    const copy = document.createElement('canvas');
    copy.width = snapshot.width;
    copy.height = snapshot.height;
    copy
      .getContext('2d')!
      .drawImage(rendered, sourceX, sourceY, snapshot.width, snapshot.height, 0, 0, copy.width, copy.height);
    const sourcePixels = source.getImageData(0, 0, snapshot.width, snapshot.height).data;
    const renderedPixels = copy.getContext('2d')!.getImageData(0, 0, copy.width, copy.height).data;
    const identical =
      sourcePixels.length === renderedPixels.length &&
      sourcePixels.every((value, index) => value === renderedPixels[index]);
    playback.dispose();
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    return {
      available: true,
      identical,
      scaleX,
      scaleY,
      sourceX,
      sourceY,
    };
  });

  expect(result.available).toBe(true);
  if (!result.available) return;
  expect(result.identical).toBe(true);
  expect(result.scaleX).toBe(2);
  expect(result.scaleY).toBe(2);
  if (result.sourceX === undefined || result.sourceY === undefined) throw new Error('Missing exact source geometry.');
  expect(result.sourceX).toBe(Math.round(result.sourceX));
  expect(result.sourceY).toBe(Math.round(result.sourceY));
});

test('caps active WebGL2 contexts and retains at most two while idle', async ({ page }) => {
  await requireWebGL2(page);
  const result = await page.evaluate(async () => {
    const { createParticleAnimation } = await import('../../src/particles');
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    let created = 0;
    let released = 0;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, contextId: string, options?: unknown) {
      const context = originalGetContext.call(this, contextId, options as never);
      if (contextId !== 'webgl2' || context === null) return context;
      created += 1;
      const gl = context as WebGL2RenderingContext;
      const getExtension = gl.getExtension.bind(gl);
      gl.getExtension = ((name: string) => {
        const extension = getExtension(name);
        if (name !== 'WEBGL_lose_context' || extension === null) return extension;
        const loseContext = (extension as WEBGL_lose_context).loseContext.bind(extension);
        (extension as WEBGL_lose_context).loseContext = () => {
          released += 1;
          loseContext();
        };
        return extension;
      }) as typeof gl.getExtension;
      return context;
    } as typeof HTMLCanvasElement.prototype.getContext;

    const factory = createParticleAnimation({ duration: 20, stagger: 0 });
    const playbacks = Array.from({ length: 5 }, () => {
      const snapshot = document.createElement('canvas');
      snapshot.width = 16;
      snapshot.height = 16;
      const source = snapshot.getContext('2d')!;
      source.fillStyle = '#8b5cf6';
      source.fillRect(0, 0, snapshot.width, snapshot.height);
      const playback = factory({
        operation: 'remove',
        element: document.createElement('div'),
        layer: document.createElement('div'),
        visual: null,
        snapshot,
        bounds: new DOMRect(0, 0, 16, 16),
        signal: new AbortController().signal,
        reducedMotion: false,
        random: () => 0.5,
        addCleanup: () => undefined,
      }) as import('../../src/particle-renderer').ParticleRenderer | null;
      if (playback !== null) document.body.append(playback.element);
      return playback;
    }).filter((playback): playback is import('../../src/particle-renderer').ParticleRenderer => playback !== null);

    await Promise.all(playbacks.map((playback) => playback.finished));
    for (const playback of playbacks) {
      playback.dispose();
      playback.element.remove();
    }
    const releasedAfterDispose = released;
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    return { created, releasedAfterDispose, releasedAfterPagehide: released };
  });

  expect(result).toEqual({ created: 4, releasedAfterDispose: 2, releasedAfterPagehide: 4 });
});

test('uses a synchronized WebGL surface and hides it after context loss', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium');
  const result = await page.evaluate(async () => {
    const { createParticleAnimation } = await import('../../src/particles');
    const snapshot = document.createElement('canvas');
    snapshot.width = 16;
    snapshot.height = 16;
    const source = snapshot.getContext('2d')!;
    source.fillStyle = '#ff756b';
    source.fillRect(0, 0, snapshot.width, snapshot.height);

    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    let requestedAttributes: WebGLContextAttributes | undefined;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, contextId: string, options?: unknown) {
      if (contextId === 'webgl2') requestedAttributes = { ...(options as WebGLContextAttributes) };
      return originalGetContext.call(this, contextId, options as never);
    } as typeof HTMLCanvasElement.prototype.getContext;

    const playback = createParticleAnimation({ duration: 1000, stagger: 0 })({
      operation: 'remove',
      element: document.createElement('div'),
      layer: document.createElement('div'),
      visual: null,
      snapshot,
      bounds: new DOMRect(0, 0, 16, 16),
      signal: new AbortController().signal,
      reducedMotion: false,
      random: () => 0.5,
      addCleanup: () => undefined,
    }) as import('../../src/particle-renderer').ParticleRenderer | null;

    try {
      if (playback === null) return { available: false };
      document.body.append(playback.element);
      playback.element.dispatchEvent(new Event('webglcontextlost'));
      return {
        available: true,
        desynchronized: requestedAttributes?.desynchronized,
        powerPreference: requestedAttributes?.powerPreference,
        visibility: playback.element.style.visibility,
      };
    } finally {
      playback?.cancel();
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    }
  });

  expect(result).toEqual({
    available: true,
    desynchronized: false,
    powerPreference: 'default',
    visibility: 'hidden',
  });
});

test('does not allocate WebGL before snapshot pixels are readable', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { createParticleAnimation } = await import('../../src/particles');
    const snapshot = document.createElement('canvas');
    snapshot.width = 4;
    snapshot.height = 4;
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    let webglRequests = 0;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, contextId: string, options?: unknown) {
      if (contextId === 'webgl2') webglRequests += 1;
      if (contextId === '2d' && this !== snapshot) {
        return {
          drawImage: () => undefined,
          getImageData: () => {
            throw new DOMException('The canvas is tainted.', 'SecurityError');
          },
        } as unknown as CanvasRenderingContext2D;
      }
      return originalGetContext.call(this, contextId, options as never);
    } as typeof HTMLCanvasElement.prototype.getContext;

    let errorName = '';
    try {
      createParticleAnimation()({
        operation: 'remove',
        element: document.createElement('div'),
        layer: document.createElement('div'),
        visual: null,
        snapshot,
        bounds: new DOMRect(0, 0, 4, 4),
        signal: new AbortController().signal,
        reducedMotion: false,
        random: Math.random,
        addCleanup: () => undefined,
      });
    } catch (error) {
      errorName = error instanceof Error ? error.name : 'unknown';
    }
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    return { errorName, webglRequests };
  });

  expect(result).toEqual({ errorName: 'SecurityError', webglRequests: 0 });
});

test('releases WebGL when renderer setup fails', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium');
  const result = await page.evaluate(async () => {
    const { createParticleAnimation } = await import('../../src/particles');
    const snapshot = document.createElement('canvas');
    snapshot.width = 4;
    snapshot.height = 4;
    const source = snapshot.getContext('2d')!;
    source.fillStyle = '#000';
    source.fillRect(0, 0, 4, 4);
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    let released = 0;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, contextId: string, options?: unknown) {
      const context = originalGetContext.call(this, contextId, options as never);
      if (contextId !== 'webgl2' || context === null) return context;
      const gl = context as WebGL2RenderingContext;
      Object.defineProperty(gl, 'createShader', { configurable: true, value: () => null });
      const getExtension = gl.getExtension.bind(gl);
      gl.getExtension = ((name: string) =>
        name === 'WEBGL_lose_context'
          ? { loseContext: () => (released += 1) }
          : getExtension(name)) as typeof gl.getExtension;
      return gl;
    } as typeof HTMLCanvasElement.prototype.getContext;

    let threw = false;
    try {
      createParticleAnimation()({
        operation: 'remove',
        element: document.createElement('div'),
        layer: document.createElement('div'),
        visual: null,
        snapshot,
        bounds: new DOMRect(0, 0, 4, 4),
        signal: new AbortController().signal,
        reducedMotion: false,
        random: Math.random,
        addCleanup: () => undefined,
      });
    } catch {
      threw = true;
    }
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    return { released, threw };
  });

  expect(result).toEqual({ released: 1, threw: true });
});
