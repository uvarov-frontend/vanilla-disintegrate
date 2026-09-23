import type {
  CanvasExportOptions,
  CaptureContext,
  CaptureMeta,
  CaptureResult,
  SnapdomOptions,
  SnapdomPlugin,
} from '@zumer/snapdom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { snapdom, toCanvas, rendered } = vi.hoisted(() => ({
  snapdom:
    vi.fn<
      (element: HTMLElement, options: SnapdomOptions) => Promise<Pick<CaptureResult, 'meta' | 'toRaw' | 'toCanvas'>>
    >(),
  toCanvas: vi.fn<(options: CanvasExportOptions) => Promise<HTMLCanvasElement>>(),
  rendered: { context: null as CaptureContext | null },
}));
vi.mock('@zumer/snapdom', () => ({ snapdom }));

import { createSnapdomCapture } from '../src/capture';
import { Disintegrator as SnapdomDisintegrator, type SnapdomCaptureOptions } from '../src/snapdom';
import { Disintegrator as BuiltInDisintegrator } from '../src/index';

const defaultUserAgent = navigator.userAgent;
const context = () => ({ operation: 'prepare' as const, signal: new AbortController().signal });
const safari = () =>
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    value: 'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/26.5 Safari/605.1.15',
  });

beforeEach(() => {
  snapdom.mockReset();
  toCanvas.mockReset();
  rendered.context = null;
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 });
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: defaultUserAgent });
  toCanvas.mockImplementation((options: CanvasExportOptions) => {
    const canvas = document.createElement('canvas');
    canvas.width = (options.width ?? 240) * (options.dpr ?? 1);
    canvas.height = (options.height ?? 80) * (options.dpr ?? 1);
    return Promise.resolve(canvas);
  });
  snapdom.mockImplementation(async (element: HTMLElement, options: SnapdomOptions) => {
    const bounds = element.getBoundingClientRect();
    const width = bounds.width || 240;
    const height = bounds.height || 80;
    const meta: CaptureMeta = {
      w0: width,
      h0: height,
      vbW: width,
      vbH: height,
      targetW: width,
      targetH: height,
      contentX: 0,
      contentY: 0,
      clip: null,
    };
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject x="0" y="0" width="${width}" height="${height}"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px"></div></foreignObject></svg>`;
    const captureContext = {
      ...options,
      element,
      meta,
      clone: element.cloneNode(true),
      svgString: svg,
      dataURL: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    } as unknown as CaptureContext;
    for (const plugin of options.plugins ?? []) await (plugin as SnapdomPlugin).beforeRender?.(captureContext);
    for (const plugin of options.plugins ?? []) await (plugin as SnapdomPlugin).afterRender?.(captureContext);
    rendered.context = captureContext;
    return { meta, toRaw: () => captureContext.dataURL!, toCanvas };
  });
});

describe('SnapDOM capture adapter', () => {
  it.each([
    { options: { dpr: 2 }, expected: Math.sqrt(2) },
    { options: { dpr: 2, maxCapturePixels: 1_000_000 }, expected: 0.5 },
    { options: { dpr: 2, maxCapturePixels: false as const }, expected: 2 },
    { options: { dpr: 2, width: 4000, maxCapturePixels: 1_000_000 }, expected: 0.25 },
    { options: { dpr: 2, height: 4000, maxCapturePixels: 1_000_000 }, expected: 0.25 },
    { options: { dpr: 2, width: 2000, scale: 2, maxCapturePixels: 1_000_000 }, expected: 0.5 },
  ])('bounds raster allocation with $options', async ({ options, expected }) => {
    const element = document.createElement('article');
    element.getBoundingClientRect = () => new DOMRect(0, 0, 2000, 2000);
    const canvas = await createSnapdomCapture(options)(element, context());
    expect(snapdom.mock.calls.at(-1)?.[1].dpr).toBeCloseTo(expected);
    expect(snapdom.mock.calls.at(-1)?.[1]).not.toHaveProperty('maxCapturePixels');
    const budget = options.maxCapturePixels === false ? Infinity : (options.maxCapturePixels ?? 8_000_000);
    expect(canvas.width * canvas.height).toBeLessThanOrEqual(budget);
    expect(canvas.width * canvas.height).toBeGreaterThan(0);
  });

  it.each([
    { width: 320, scale: 2, expected: [640, 213] },
    { height: 160, scale: 0.5, expected: [960, 320] },
    { width: 320, height: 100, scale: 2, expected: [640, 200] },
    { scale: 2, expected: [960, 320] },
  ])('uses native output sizing without mutating options: $expected', async ({ expected, ...options }) => {
    const original = { ...options };
    const capture = createSnapdomCapture(Object.freeze({ ...options, dpr: 2 }));
    for (let i = 0; i < 2; i++) {
      const canvas = await capture(document.createElement('article'), context());
      expect([canvas.width, canvas.height]).toEqual(expected);
      expect(snapdom.mock.calls.at(-1)?.[1]).toMatchObject(options);
    }
    expect(options).toEqual(original);
  });

  it('leaves native policies unchanged and allows repeat memoization', async () => {
    await createSnapdomCapture()(document.createElement('article'), context());
    expect(snapdom.mock.calls[0]?.[1]).toEqual({
      dpr: 1,
      engine: 'svg',
      plugins: [expect.objectContaining({ pure: true })],
    });
  });

  it('passes filters, exclusions, image fallbacks and plugins without wrapping them', async () => {
    const filter = vi.fn(() => true);
    const options: SnapdomCaptureOptions = {
      filter,
      filterMode: 'hide',
      exclude: ['.private'],
      excludeMode: 'remove',
      fallbackURL: '/fallback.png',
      placeholders: false,
      cache: 'soft',
    };
    await createSnapdomCapture(options)(document.createElement('article'), context());
    expect(snapdom.mock.calls[0]?.[1]).toMatchObject(options);
    expect(snapdom.mock.calls[0]?.[1].filter).toBe(filter);
    expect(filter).not.toHaveBeenCalled();
  });

  it('refreshes the renderer when its owner invalidates, even with invalidate:false in options', async () => {
    const capture = createSnapdomCapture({ invalidate: false });
    await capture(document.createElement('article'), { ...context(), invalidate: true });
    expect(snapdom.mock.calls[0]?.[1].invalidate).toBe(true);
  });

  it('preserves user plugins before restoring opacity without revealing the live element', async () => {
    const element = document.createElement('article');
    element.style.opacity = '0';
    const plugin: SnapdomPlugin = { name: 'application', beforeRender: vi.fn() };
    const plugins = [plugin];
    await createSnapdomCapture({ plugins })(element, { ...context(), operation: 'restore', restoreRootOpacity: '0.7' });
    expect(snapdom.mock.calls[0]?.[1].plugins).toEqual([
      plugin,
      expect.objectContaining({ name: 'vanilla-disintegrate:restore-root-opacity' }),
      expect.objectContaining({ name: 'vanilla-disintegrate:capture-geometry' }),
    ]);
    expect(rendered.context?.clone?.style.getPropertyValue('opacity')).toBe('0.7');
    expect(rendered.context?.clone?.style.getPropertyPriority('opacity')).toBe('important');
    expect(element.style.opacity).toBe('0');
    expect(plugins).toEqual([plugin]);
  });

  it('refuses cancelled work before entering SnapDOM', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      createSnapdomCapture()(document.createElement('article'), { operation: 'prepare', signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(snapdom).not.toHaveBeenCalled();
  });

  it('caps automatic display density and respects an explicit dpr', async () => {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 3 });
    await createSnapdomCapture()(document.createElement('article'), context());
    expect(snapdom.mock.calls.at(-1)?.[1].dpr).toBe(2);
    await createSnapdomCapture({ dpr: 1 })(document.createElement('article'), context());
    expect(snapdom.mock.calls.at(-1)?.[1].dpr).toBe(1);
  });

  it('owns each canvas even when JavaScript supplies a shared target', async () => {
    const capture = createSnapdomCapture({ canvas: document.createElement('canvas') } as SnapdomCaptureOptions);
    const first = await capture(document.createElement('article'), context());
    const second = await capture(document.createElement('article'), context());
    expect(first).not.toBe(second);
    expect(snapdom.mock.calls[0]?.[1]).not.toHaveProperty('canvas');
  });

  it.each([
    { options: { dpr: 2 }, dimensions: [480, 160], density: '2 2' },
    { options: { width: 480, scale: 2, dpr: 1 }, dimensions: [480, 160], density: '2 2' },
    { options: { width: 480, height: 80, dpr: 1 }, dimensions: [480, 80], density: '2 1' },
  ])('keeps Safari sharp with native output sizing: $options', async ({ options, dimensions, density }) => {
    safari();
    const canvas = await createSnapdomCapture(options)(document.createElement('article'), context());
    expect([canvas.width, canvas.height]).toEqual(dimensions);
    const renderedContext = rendered.context!;
    const svg = new DOMParser().parseFromString(renderedContext.svgString!, 'image/svg+xml');
    expect(svg.documentElement.getAttribute('data-disintegrate-density')).toBe(density);
    expect(svg.documentElement.getAttribute('width')).toBe(String(dimensions[0]));
    expect(svg.documentElement.getAttribute('height')).toBe(String(dimensions[1]));
    expect(renderedContext.dataURL).toBe(
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderedContext.svgString!)}`,
    );
    expect(toCanvas.mock.calls[0]?.[0]).toMatchObject({ dpr: 1, scale: 1 });
    const plugin = snapdom.mock.calls[0]?.[1].plugins?.at(-1) as SnapdomPlugin;
    expect(plugin.pure).toBe(true);
    const once = renderedContext.svgString;
    await plugin.afterRender!(renderedContext);
    expect(renderedContext.svgString).toBe(once);
  });

  it('exports a memoized Safari capture with the same size on every call', async () => {
    safari();
    const capture = createSnapdomCapture({ dpr: 2 });
    const element = document.createElement('article');
    const first = await capture(element, context());
    const memo = { meta: rendered.context!.meta!, toRaw: () => rendered.context!.dataURL!, toCanvas };
    snapdom.mockResolvedValue(memo);
    const second = await capture(element, context());
    expect([first.width, first.height, second.width, second.height]).toEqual([480, 160, 480, 160]);
    expect(first).not.toBe(second);
  });

  it('preserves explicit clip and shadow policies', async () => {
    await createSnapdomCapture({ clip: null, outerShadows: true })(document.createElement('article'), context());
    expect(snapdom.mock.calls[0]?.[1]).toMatchObject({ clip: null, outerShadows: true });
    expect(toCanvas.mock.calls[0]?.[0]).not.toHaveProperty('crop');
  });
});

function target() {
  const element = document.createElement('article');
  document.body.append(element);
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: (): DOMRect => ({
      bottom: 80,
      height: 80,
      left: 0,
      right: 240,
      top: 0,
      width: 240,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  });
  return element;
}

describe('entry points', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('wires SnapDOM as the default capture on the ./snapdom entry', async () => {
    const element = target();
    const effect = new SnapdomDisintegrator({ preset: 'dust', layout: false, sound: false });

    await effect.remove(element).finished;

    expect(snapdom).toHaveBeenCalledWith(element, expect.objectContaining({ dpr: 1 }));
    effect.destroy();
  });

  it('leaves the default built-in entry without a capture adapter', async () => {
    const element = target();
    const onError = vi.fn();
    const effect = new BuiltInDisintegrator({ preset: 'dust', layout: false, onError, sound: false });

    const result = await effect.remove(element).finished;

    expect(result.status).toBe('skipped');
    expect(toCanvas).not.toHaveBeenCalled();
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(TypeError);
    effect.destroy();
  });

  it('honors custom capture on the SnapDOM entry', async () => {
    const capture = vi.fn(() => document.createElement('canvas'));
    const effect = new SnapdomDisintegrator({
      preset: 'dust',
      capture,
      snapdom: { dpr: 2 },
      layout: false,
      sound: false,
    });
    await effect.remove(target()).finished;
    expect(capture).toHaveBeenCalledOnce();
    expect(toCanvas).not.toHaveBeenCalled();
    expect(snapdom).not.toHaveBeenCalled();
    effect.destroy();
  });
});
