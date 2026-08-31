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
      remove: { needsSnapshot: false, animate, sound: null },
      restore: { needsSnapshot: false, animate, sound: null },
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
  await expect(root.locator('[data-group-panel="sound"] input[type="range"]')).toHaveCount(4);
  await expect(root.locator('[data-group-panel="sound"]')).toBeHidden();
  await expect(root.locator('.playground-field-heading').first().locator('small')).toBeVisible();
  await root.locator('[data-group-tab="sound"]').click();
  await expect(root.locator('[data-group-panel="sound"]')).toBeVisible();
  await root.locator('[data-group-tab="timing"]').click();
  await expect(root.locator('[data-view-panel="preview"]')).toBeVisible();
  await expect(root.locator('[data-view-panel="code"]')).toBeHidden();
  await root.locator('[data-view-tab="code"]').click();
  await expect(root.locator('[data-view-panel="code"]')).toBeVisible();
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
  await setRange('soundGain', '0.5');
  await expect(root.locator('[data-preset][aria-pressed="true"]')).toHaveCount(0);
  await expect(root.locator('[data-code]')).toContainText('verticalTravel: [-180, -30]');
  await expect(root.locator('[data-code]')).toContainText('gain: 0.5');
  await expect(page).toHaveURL(/#playground\?/);
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
      remove: { animate: createParticleAnimation({ duration: 40, stagger: 0 }), sound: null },
      restore: { animate: createParticleRestoreAnimation({ duration: 40, stagger: 0 }), sound: null },
    });
    const disintegrator = new Disintegrator({ capture, effect: particle, layout: false, preparation: false });
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

test('retains at most two idle WebGL2 contexts', async ({ page, browserName }) => {
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
    const playbacks = Array.from({ length: 3 }, () => {
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
      }) as import('../../src/particle-renderer').ParticleRenderer;
      document.body.append(playback.element);
      return playback;
    });

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

  expect(result).toEqual({ created: 3, releasedAfterDispose: 1, releasedAfterPagehide: 3 });
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
    const sourceGetContext = snapshot.getContext.bind(snapshot);
    snapshot.getContext = ((contextId: string, options?: unknown) => {
      if (contextId !== '2d') return sourceGetContext(contextId as never, options as never);
      return {
        getImageData: () => {
          throw new DOMException('The canvas is tainted.', 'SecurityError');
        },
      } as unknown as CanvasRenderingContext2D;
    }) as typeof snapshot.getContext;
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    let webglRequests = 0;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, contextId: string, options?: unknown) {
      if (contextId === 'webgl2') webglRequests += 1;
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
