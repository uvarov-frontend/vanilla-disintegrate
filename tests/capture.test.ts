import type { SnapdomOptions, SnapdomPlugin } from '@zumer/snapdom';
import { describe, expect, it, vi } from 'vitest';

const { toCanvas } = vi.hoisted(() => ({
  toCanvas: vi.fn((element: Element, options?: SnapdomOptions) => {
    void element;
    void options;
    return Promise.resolve(document.createElement('canvas'));
  }),
}));

vi.mock('@zumer/snapdom', () => ({ snapdom: { toCanvas } }));

import { createSnapdomCapture } from '../src/capture';

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
});
