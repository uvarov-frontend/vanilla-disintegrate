import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/fixture.html');
});

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

test('configures and runs the home-page particle playground', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium');
  await page.goto('http://localhost:4321/');

  const root = page.locator('[data-particle-playground]');
  await root.scrollIntoViewIfNeeded();
  await expect(root.locator('[data-preset="dust"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(root.locator('[data-operation="remove"]')).toHaveAttribute('aria-selected', 'true');
  await expect(root.locator('[data-operation="restore"]')).toHaveAttribute('aria-selected', 'false');
  await expect(root.locator('[data-curve]')).toHaveValue('settle');
  await expect(root.locator('[data-sound-enabled]')).toBeChecked();
  await expect(root.locator('[data-sound-source]')).toHaveValue('dust');
  await expect(root.locator('[data-sound-reverse]')).not.toBeChecked();
  await expect(root.locator('[data-group-panel="sound"] input[type="range"]')).toHaveCount(4);
  await expect(root.locator('[data-group-panel="sound"]')).toBeHidden();
  await expect(root.locator('.playground-field-heading').first().locator('small')).toBeVisible();
  await root.locator('[data-group-tab="sound"]').click();
  await expect(root.locator('[data-group-panel="sound"]')).toBeVisible();
  await root.locator('[data-sound-source]').selectOption('scatter');
  await root.locator('[data-preset="vapor"]').click();
  await expect(root.locator('[data-sound-source]')).toHaveValue('vapor');
  await root.locator('[data-operation="restore"]').click();
  await expect(root.locator('[data-sound-source]')).toHaveValue('vapor');
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
  await expect(root.locator('[data-code]')).toContainText("preset: 'vapor'");
  await expect(root.locator('[data-code]')).not.toContainText('createParticleEffect');
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
  expect(await page.evaluate(() => window.location.hash.length)).toBeLessThan(80);
  await expect(root.locator('[data-status]')).toContainText('remove · completed', { timeout: 15_000 });

  await root.locator('[data-operation="restore"]').click();
  await expect(root.locator('[data-option="verticalMin"]')).toHaveValue('-230');
  await setRange('verticalMin', '-120');
  await expect(root.locator('[data-code]')).toContainText('verticalTravel: [-120, -120]');
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

  await expect(ranges).toHaveCount(14);
  await expect(values).toHaveCount(14);
  await expect(root.locator('[data-value]:not([type="number"])')).toHaveCount(0);
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
  await expect(root.locator('[data-value="endScale"]')).toHaveValue('0.70');
  await expect(root.locator('[data-value="soundPlaybackRate"]')).toHaveValue('1.00');
  await expect(root.locator('[data-value="soundFadeDuration"]')).toHaveValue('0.18');
  await expect(root.locator('[data-value="soundVolume"]')).toHaveValue('32');
  await expect(await enterValue('endScale', '0.4')).toHaveValue('0.40');
  await expect(code).toContainText('endScale: 0.4');

  await expect(await enterValue('duration', '926')).toHaveValue('926');
  await expect(code).toContainText('duration: 926');
  await expect(root.locator('[data-preset][aria-pressed="true"]')).toHaveCount(0);

  await expect(await enterValue('swirl', '19')).toHaveValue('19');
  await expect(root.locator('[data-value="duration"]')).toHaveValue('926');
  await expect(code).toContainText('duration: 926');
  await expect(page).toHaveURL(/#p=[\w-]+$/);

  await page.reload();
  await expect(root.locator('[data-value="duration"]')).toHaveValue('926');
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

test('keeps a selected preset across operation tabs and hash reloads', async ({ page, browserName }) => {
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
  await expect(code).toContainText("preset: 'scatter'");
  await expect(code).not.toContainText('createParticleEffect');

  await root.locator('[data-operation="remove"]').click();
  await expect(scatter).toHaveAttribute('aria-pressed', 'true');
  await expect(code).toContainText("preset: 'scatter'");
  await expect(code).not.toContainText('createParticleEffect');
  await expect(page).toHaveURL(/#p=[\w-]+$/);
  expect(await page.evaluate(() => window.location.hash.length)).toBeLessThan(80);

  const previousHash = await page.evaluate(() => window.location.hash);
  await root.locator('[data-operation="restore"]').click();
  await root.locator('[data-width-option="narrow"]').click();
  await expect(root.locator('[data-operation="restore"]')).toHaveAttribute('aria-selected', 'true');
  await expect(root.locator('[data-width-option="narrow"]')).toHaveAttribute('aria-pressed', 'true');
  await root.locator('[data-copy="link"]').dispatchEvent('click');
  await expect.poll(() => page.evaluate(() => window.location.hash)).not.toBe(previousHash);
  await expect.poll(() => page.evaluate(() => window.location.hash.length)).toBeLessThan(80);

  await page.reload();
  await expect(scatter).toHaveAttribute('aria-pressed', 'true');
  await expect(code).toContainText("preset: 'scatter'");
  await expect(code).not.toContainText('createParticleEffect');
  await expect(root.locator('[data-operation="restore"]')).toHaveAttribute('aria-selected', 'true');
  await expect(root.locator('[data-width-option="narrow"]')).toHaveAttribute('aria-pressed', 'true');
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
  await setRange('duration', '925');
  await expect(code).toContainText('const sharedParticleOptions: ParticleOptions');
  await expect(code).toContainText('duration: 925');
  await expect(code).toContainText('duration: 900');
  await expectOccurrences(/curve: 'float'/g, 1);
  await expectOccurrences(/\.\.\.sharedParticleOptions/g, 2);
  await expect(code).toContainText('const sharedSoundOptions =');
  await expectOccurrences(/src: 'vapor'/g, 1);
  await expectOccurrences(/\.\.\.sharedSoundOptions/g, 2);
  await expectOccurrences(/reverse: false/g, 1);
  await expectOccurrences(/reverse: true/g, 1);
  await expect(code).not.toContainText('const removeOptions');
  await expect(code).not.toContainText('const restoreOptions');
  expect(await generatedEffect()).toContain('restore: {');

  await root.locator('[data-operation="restore"]').click();
  await setRange('duration', '925');
  await expectOccurrences(/duration: 925/g, 1);
  await expectOccurrences(/duration: 900/g, 0);
  await expectOccurrences(/sharedParticleOptions/g, 0);
  expect(await generatedEffect()).not.toContain('restore:');

  await setRange('swirl', '19');
  await expectOccurrences(/swirl: 18/g, 1);
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

  await setRange('duration', '850');
  expect(
    await root.evaluate((element) => ({
      curve: (element.querySelector('[data-curve]') as HTMLSelectElement).value,
      release: (element.querySelector('[data-release]') as HTMLSelectElement).value,
      duration: (element.querySelector('[data-option="duration"]') as HTMLInputElement).value,
      stagger: (element.querySelector('[data-option="stagger"]') as HTMLInputElement).value,
      horizontalDrift: (element.querySelector('[data-option="horizontalDrift"]') as HTMLInputElement).value,
      horizontalMin: (element.querySelector('[data-option="horizontalMin"]') as HTMLInputElement).value,
      horizontalMax: (element.querySelector('[data-option="horizontalMax"]') as HTMLInputElement).value,
      verticalMin: (element.querySelector('[data-option="verticalMin"]') as HTMLInputElement).value,
      verticalMax: (element.querySelector('[data-option="verticalMax"]') as HTMLInputElement).value,
      convergence: (element.querySelector('[data-option="convergence"]') as HTMLInputElement).value,
      swirl: (element.querySelector('[data-option="swirl"]') as HTMLInputElement).value,
      endScale: (element.querySelector('[data-option="endScale"]') as HTMLInputElement).value,
    })),
  ).toEqual({
    curve: 'settle',
    release: 'left',
    duration: '850',
    stagger: '130',
    horizontalDrift: '70',
    horizontalMin: '40',
    horizontalMax: '190',
    verticalMin: '-210',
    verticalMax: '-30',
    convergence: '0',
    swirl: '34',
    endScale: '0.55',
  });
  await expect(dust).toHaveAttribute('aria-pressed', 'true');
  await expect(code).toContainText("preset: 'dust'");
  await expect(code).not.toContainText('createParticleEffect');
  await expect(page).toHaveURL(/#p=[\w-]+$/);

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

test('runs, reuses and releases a real WebGL2 particle renderer', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium');
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

test('caps active WebGL2 contexts and retains at most two while idle', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium');
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
