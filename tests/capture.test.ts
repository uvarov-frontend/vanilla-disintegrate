import type { SnapdomOptions, SnapdomPlugin } from '@zumer/snapdom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { snapdom, toCanvas } = vi.hoisted(() => {
  const toCanvas = vi.fn((element: Element, options?: SnapdomOptions) => {
    void element;
    void options;
    return Promise.resolve(document.createElement('canvas'));
  });
  return { snapdom: Object.assign(vi.fn(), { toCanvas }), toCanvas };
});

vi.mock('@zumer/snapdom', () => ({ snapdom }));

import { createSnapdomCapture } from '../src/capture';
import { Disintegrator as SnapdomDisintegrator } from '../src/snapdom';
import { Disintegrator as BuiltInDisintegrator } from '../src/index';

const defaultUserAgent = navigator.userAgent;

beforeEach(() => {
  snapdom.mockReset();
  toCanvas.mockClear();
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 });
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: defaultUserAgent });
});

describe('SnapDOM capture adapter', () => {
  it('refuses an already-aborted capture without running the SnapDOM pipeline', async () => {
    const controller = new AbortController();
    controller.abort();
    const capture = createSnapdomCapture();

    await expect(
      capture(document.createElement('article'), { operation: 'prepare', signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(toCanvas).not.toHaveBeenCalled();
  });

  it('restores the captured root opacity without revealing the live restore target', async () => {
    const target = document.createElement('article');
    const capture = createSnapdomCapture();

    await capture(target, {
      operation: 'restore',
      restoreRootOpacity: '0.65',
      signal: new AbortController().signal,
    });

    const options = toCanvas.mock.calls[0]?.[1] as SnapdomOptions;
    const plugin = options.plugins?.at(-1) as SnapdomPlugin;
    const clone = target.cloneNode(true) as HTMLElement;
    clone.style.opacity = '0';
    await plugin.beforeRender?.({ clone } as never);

    expect(plugin.name).toBe('vanilla-disintegrate:restore-root-opacity');
    expect(clone.style.getPropertyValue('opacity')).toBe('0.65');
    expect(clone.style.getPropertyPriority('opacity')).toBe('important');
    expect(target.style.opacity).toBe('');
  });

  it('does not add the restore plugin to ordinary captures', async () => {
    const capture = createSnapdomCapture();

    await capture(document.createElement('article'), {
      operation: 'remove',
      signal: new AbortController().signal,
    });

    const options = toCanvas.mock.calls.at(-1)?.[1] as SnapdomOptions;
    expect(options.plugins).toBeUndefined();
  });

  it('uses a crisp display density without exceeding two physical pixels per CSS pixel', async () => {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 3 });
    const capture = createSnapdomCapture();

    await capture(document.createElement('article'), {
      operation: 'remove',
      signal: new AbortController().signal,
    });

    expect(toCanvas).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ dpr: 2, outerTransforms: true }),
    );
  });

  it('rasterizes Safari foreignObject content at physical density instead of enlarging a soft image', async () => {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/620.5.2 (KHTML, like Gecko) Version/26.5 Safari/620.5.2',
    });
    const canvas = document.createElement('canvas');
    const exportCanvas = vi.fn(() => Promise.resolve(canvas));
    let scaledSvg = '';
    let scaledDataURL = '';
    snapdom.mockImplementation(async (_element, captureOptions: SnapdomOptions) => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="166" viewBox="0 0 480 166"><foreignObject x="-2" y="3" width="484" height="170"><div xmlns="http://www.w3.org/1999/xhtml" style="transform:initial;width:484px;height:170px"></div></foreignObject></svg>';
      const context = {
        dataURL: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
        svgString: svg,
      };
      const plugin = captureOptions.plugins?.at(-1) as SnapdomPlugin;
      await plugin.afterRender?.(context as never);
      scaledSvg = context.svgString;
      scaledDataURL = context.dataURL;
      return { toCanvas: exportCanvas } as never;
    });
    const element = document.createElement('article');
    Object.defineProperty(element, 'getBoundingClientRect', {
      value: () => ({ height: 166, left: 20, top: 30, width: 480 }),
    });

    const capture = createSnapdomCapture();
    const result = await capture(element, {
      operation: 'remove',
      signal: new AbortController().signal,
    });

    const parsed = new DOMParser().parseFromString(scaledSvg, 'image/svg+xml');
    const root = parsed.documentElement;
    const foreignObject = parsed.getElementsByTagName('foreignObject')[0];
    const wrapper = parsed.getElementsByTagName('div')[0];
    expect(root.getAttribute('width')).toBe('960');
    expect(root.getAttribute('height')).toBe('332');
    expect(root.getAttribute('viewBox')).toBe('0 0 960 332');
    expect(foreignObject?.getAttribute('x')).toBe('-4');
    expect(foreignObject?.getAttribute('y')).toBe('6');
    expect(foreignObject?.getAttribute('width')).toBe('968');
    expect(foreignObject?.getAttribute('height')).toBe('340');
    expect(wrapper?.getAttribute('style')).toContain('transform:scale(2,2);transform-origin:0 0');
    expect(scaledDataURL).toBe(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(scaledSvg)}`);
    expect(exportCanvas).toHaveBeenCalledWith({ dpr: 1, height: undefined, scale: 1, width: undefined });
    expect(result).toBe(canvas);
    expect(canvas.style.width).toBe('480px');
    expect(canvas.style.height).toBe('166px');
    expect(toCanvas).not.toHaveBeenCalled();
  });

  it('falls back to the original Safari export when SnapDOM returns a base64 data URL', async () => {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/620.5.2 (KHTML, like Gecko) Version/26.5 Safari/620.5.2',
    });
    const canvas = document.createElement('canvas');
    const exportCanvas = vi.fn(() => Promise.resolve(canvas));
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="166"><foreignObject width="480" height="166"><div xmlns="http://www.w3.org/1999/xhtml"></div></foreignObject></svg>';
    const dataURL = `data:image/svg+xml;base64,${btoa(svg)}`;
    let renderedContext: { dataURL: string; svgString: string } | undefined;
    snapdom.mockImplementation(async (_element, captureOptions: SnapdomOptions) => {
      const context = { dataURL, svgString: svg };
      const plugin = captureOptions.plugins?.at(-1) as SnapdomPlugin;
      await plugin.afterRender?.(context as never);
      renderedContext = context;
      return { toCanvas: exportCanvas } as never;
    });
    const element = document.createElement('article');

    const capture = createSnapdomCapture();
    const result = await capture(element, {
      operation: 'remove',
      signal: new AbortController().signal,
    });

    expect(renderedContext).toEqual({ dataURL, svgString: svg });
    expect(exportCanvas).toHaveBeenCalledOnce();
    expect(exportCanvas.mock.calls[0]).toEqual([]);
    expect(result).toBe(canvas);
  });

  it('clips the snapshot to the measured element bounds by default', async () => {
    const element = document.createElement('article');
    Object.defineProperty(element, 'getBoundingClientRect', {
      value: () => ({ height: 220, left: 40, top: 60, width: 420 }),
    });
    const capture = createSnapdomCapture();

    await capture(element, {
      operation: 'remove',
      signal: new AbortController().signal,
    });

    expect(toCanvas).toHaveBeenCalledWith(
      element,
      expect.objectContaining({ clip: { height: 220, width: 420, x: 40, y: 60 } }),
    );
  });

  it('preserves an application-provided SnapDOM output dimension', async () => {
    const element = document.createElement('article');
    Object.defineProperty(element, 'getBoundingClientRect', {
      value: () => ({ height: 220, width: 420 }),
    });
    const capture = createSnapdomCapture({ width: 320 });

    await capture(element, {
      operation: 'remove',
      signal: new AbortController().signal,
    });

    const captureOptions = toCanvas.mock.calls.at(-1)?.[1] as SnapdomOptions;
    expect(captureOptions.width).toBe(320);
    expect(captureOptions.height).toBeUndefined();
  });

  it('preserves an application-provided SnapDOM clip', async () => {
    const element = document.createElement('article');
    const capture = createSnapdomCapture({ clip: null });

    await capture(element, {
      operation: 'remove',
      signal: new AbortController().signal,
    });

    const captureOptions = toCanvas.mock.calls.at(-1)?.[1] as SnapdomOptions;
    expect(captureOptions.clip).toBeNull();
  });

  it('allows the application to choose another capture density', async () => {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
    const capture = createSnapdomCapture({ dpr: 1 });

    await capture(document.createElement('article'), {
      operation: 'remove',
      signal: new AbortController().signal,
    });

    expect(toCanvas).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ dpr: 1 }));
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

    expect(toCanvas).toHaveBeenCalledWith(element, expect.objectContaining({ fast: true }));
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
});
