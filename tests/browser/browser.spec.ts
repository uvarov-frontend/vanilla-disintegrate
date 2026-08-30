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

test('runs and releases a real WebGL2 particle renderer', async ({ page, browserName }) => {
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

    const target = document.createElement('div');
    Object.assign(target.style, { background: '#8b5cf6', height: '48px', width: '64px' });
    document.body.append(target);
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
    const operation = await disintegrator.remove(target).finished;
    disintegrator.destroy();
    HTMLCanvasElement.prototype.getContext = originalGetContext;

    return { created, released, status: operation.status };
  });

  expect(result.status).toBe('completed');
  expect(result.created).toBeGreaterThan(0);
  expect(result.released).toBe(result.created);
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
