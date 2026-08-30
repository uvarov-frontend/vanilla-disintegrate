import type { SnapdomOptions, SnapdomPlugin } from '@zumer/snapdom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { toCanvas } = vi.hoisted(() => ({
  toCanvas: vi.fn((element: Element, options?: SnapdomOptions) => {
    void element;
    void options;
    return Promise.resolve(document.createElement('canvas'));
  }),
}));

vi.mock('@zumer/snapdom', () => ({ snapdom: { toCanvas } }));

import { createSnapdomCapture } from '../src/capture';
import { Disintegrator as SnapdomDisintegrator } from '../src/snapdom';
import { Disintegrator as BuiltInDisintegrator } from '../src/index';

beforeEach(() => {
  toCanvas.mockClear();
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 });
});

describe('SnapDOM capture adapter', () => {
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
    const effect = new SnapdomDisintegrator({ effect: 'dust', layout: false });

    await effect.remove(element).finished;

    expect(toCanvas).toHaveBeenCalledWith(element, expect.objectContaining({ fast: true }));
    effect.destroy();
  });

  it('leaves the default built-in entry without a capture adapter', async () => {
    const element = target();
    const onError = vi.fn();
    const effect = new BuiltInDisintegrator({ effect: 'dust', layout: false, onError });

    const result = await effect.remove(element).finished;

    expect(result.status).toBe('skipped');
    expect(toCanvas).not.toHaveBeenCalled();
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(TypeError);
    effect.destroy();
  });
});
