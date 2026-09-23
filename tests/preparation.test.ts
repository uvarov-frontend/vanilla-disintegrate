import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Disintegrator } from '../src/disintegrator';
import { defineEffect } from '../src/effects';
import { SnapshotPreparation } from '../src/preparation';
import { resolvePreparation } from '../src/defaults';
import type { AnimationContext, SnapshotCapture, SnapshotCaptureContext } from '../src/types';

function rect(): DOMRect {
  return {
    bottom: 10,
    height: 10,
    left: 0,
    right: 10,
    top: 0,
    width: 10,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  };
}

function element() {
  const target = document.createElement('div');
  Object.defineProperty(target, 'getBoundingClientRect', { configurable: true, value: rect });
  document.body.append(target);
  return target;
}

function snapshot() {
  const canvas = document.createElement('canvas');
  canvas.width = 10;
  canvas.height = 10;
  return canvas;
}

function snapshotEffect() {
  return defineEffect({
    remove: { animate: () => Promise.resolve() },
    restore: { animate: () => Promise.resolve() },
  });
}

beforeEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('snapshot preparation', () => {
  it.each(['invalidate', 'clear'] as const)('does not retain an operation snapshot after %s', async (action) => {
    const target = element();
    const preparation = new SnapshotPreparation(() => snapshot(), resolvePreparation(true), vi.fn());
    const captured = await preparation.take(target, 'remove', new AbortController().signal);
    if (action === 'invalidate') preparation.invalidate([target]);
    else preparation.clear();
    expect(preparation.cacheRetained(target, captured)).toBe(false);
    captured.width = captured.height = 0;
    preparation.destroy();
  });

  it.each(['invalidate', 'clear'] as const)('rejects an old claim after %s and a newer capture', async (action) => {
    const target = element();
    const preparation = new SnapshotPreparation(() => snapshot(), resolvePreparation(true), vi.fn());
    const signal = new AbortController().signal;
    const stale = await preparation.take(target, 'remove', signal);
    if (action === 'invalidate') preparation.invalidate([target]);
    else preparation.clear();
    const fresh = await preparation.take(target, 'restore', signal);
    expect(preparation.cacheRetained(target, fresh)).toBe(true);
    expect(preparation.cacheRetained(target, stale)).toBe(false);
    expect(fresh.width).toBe(10);
    stale.width = stale.height = 0;
    preparation.destroy();
    expect(fresh.width).toBe(0);
  });
  it('consumes explicit engine invalidation only after a successful current capture', async () => {
    const target = element();
    const capture = vi.fn<(element: HTMLElement, context: SnapshotCaptureContext) => Promise<HTMLCanvasElement>>(() =>
      Promise.resolve(snapshot()),
    );
    const preparation = new SnapshotPreparation(capture, resolvePreparation(false), vi.fn());
    const signal = new AbortController().signal;
    preparation.invalidate([target]);
    capture.mockRejectedValueOnce(new Error('Capture failed'));
    await expect(preparation.take(target, 'remove', signal)).rejects.toThrow('Capture failed');
    await preparation.take(target, 'remove', signal);
    await preparation.take(target, 'remove', signal);
    expect(capture.mock.calls.map((call) => call[1].invalidate)).toEqual([true, true, undefined]);
    preparation.clear();
    await preparation.take(target, 'remove', signal);
    expect(capture.mock.calls.at(-1)?.[1].invalidate).toBe(true);
    preparation.destroy();
  });

  it('does not consume an invalidation that arrived while another capture was running', async () => {
    const target = element();
    let release!: (canvas: HTMLCanvasElement) => void;
    const capture = vi.fn<(element: HTMLElement, context: SnapshotCaptureContext) => Promise<HTMLCanvasElement>>(() =>
      Promise.resolve(snapshot()),
    );
    capture.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const preparation = new SnapshotPreparation(capture, resolvePreparation(false), vi.fn());
    const signal = new AbortController().signal;
    preparation.invalidate([target]);
    const pending = preparation.take(target, 'remove', signal);
    preparation.invalidate([target]);
    release(snapshot());
    await pending;
    await preparation.take(target, 'remove', signal);
    expect(capture.mock.calls.map((call) => call[1].invalidate)).toEqual([true, true]);
    preparation.destroy();
  });

  it('drops a stale snapshot without recapturing during inline style churn', async () => {
    const target = element();
    const capturedColors: string[] = [];
    const capture = vi.fn((candidate: HTMLElement) => {
      capturedColors.push(candidate.style.backgroundColor);
      return Promise.resolve(snapshot());
    });
    const effects = new Disintegrator({
      capture,
      effect: snapshotEffect(),
      preparation: { strategy: 'immediate', observeMutations: true },
      layout: false,
      sound: false,
    });

    effects.register(target);
    await vi.waitFor(() => expect(capture).toHaveBeenCalledTimes(1));

    const colors = ['rgb(10, 20, 30)', 'rgb(20, 30, 40)', 'rgb(30, 40, 50)'];
    for (const color of colors) {
      target.style.backgroundColor = color;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    expect(capture).toHaveBeenCalledTimes(1);

    const removal = effects.remove(target);
    await expect(removal.finished).resolves.toMatchObject({ status: 'completed' });

    expect(capture).toHaveBeenCalledTimes(2);
    expect(capture).toHaveBeenLastCalledWith(target, expect.objectContaining({ operation: 'remove' }));
    expect(capturedColors).toEqual(['', colors.at(-1)]);

    effects.destroy();
  });

  it('recaptures on rendered content changes other than inline styles', async () => {
    const target = element();
    const title = document.createElement('h3');
    title.textContent = 'Story';
    const image = document.createElement('img');
    target.append(title, image);
    const capture = vi.fn(() => Promise.resolve(snapshot()));
    const effects = new Disintegrator({
      capture,
      effect: snapshotEffect(),
      preparation: { strategy: 'immediate', observeMutations: true },
      sound: false,
    });

    effects.register(target);
    await vi.waitFor(() => expect(capture).toHaveBeenCalledTimes(1));

    let expected = 1;
    const changes: Array<[string, () => void]> = [
      ['class', () => target.classList.add('loaded')],
      ['text', () => (title.textContent = 'Renamed')],
      ['child node', () => target.append(document.createElement('span'))],
      ['image source', () => image.setAttribute('src', '/poster.png')],
      ['non-class attribute', () => target.setAttribute('hidden', '')],
    ];
    for (const [name, change] of changes) {
      change();
      expected += 1;
      await vi.waitFor(() => expect(capture, `${name} must invalidate the snapshot`).toHaveBeenCalledTimes(expected));
    }

    image.dispatchEvent(new Event('load'));
    await vi.waitFor(() => expect(capture).toHaveBeenCalledTimes(expected + 1));

    effects.destroy();
  });

  it('does not start observers or capture when background preparation is disabled', async () => {
    const capture = vi.fn().mockResolvedValue(snapshot());
    const observer = vi.fn();
    vi.stubGlobal('IntersectionObserver', observer);
    const effect = new Disintegrator({ capture, effect: snapshotEffect(), preparation: false, sound: false });

    const unregister = effect.register(element());
    await Promise.resolve();

    expect(observer).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
    unregister();
    effect.destroy();
  });

  it('ignores the initial ResizeObserver notification and recaptures only after a real size change', async () => {
    let resizeCallback: ResizeObserverCallback | undefined;
    class ResizeObserverMock {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    const target = element();
    let width = 10;
    Object.defineProperty(target, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ ...rect(), bottom: 10, right: width, width }),
    });
    const capture = vi.fn().mockResolvedValue(snapshot());
    const effect = new Disintegrator({
      capture,
      effect: snapshotEffect(),
      preparation: { strategy: 'immediate' },
      sound: false,
    });

    effect.register(target);
    await vi.waitFor(() => expect(capture).toHaveBeenCalledOnce());

    resizeCallback?.([{ target } as unknown as ResizeObserverEntry], {} as ResizeObserver);
    await Promise.resolve();
    expect(capture).toHaveBeenCalledOnce();

    width = 20;
    resizeCallback?.([{ target } as unknown as ResizeObserverEntry], {} as ResizeObserver);
    await vi.waitFor(() => expect(capture).toHaveBeenCalledTimes(2));

    effect.destroy();
  });

  it('supports explicit immediate preparation even when background work is disabled', async () => {
    const target = element();
    const capture = vi.fn().mockResolvedValue(snapshot());
    const effect = new Disintegrator({ capture, effect: snapshotEffect(), preparation: false, sound: false });

    await effect.prepare(target);

    expect(capture).toHaveBeenCalledWith(target, expect.objectContaining({ operation: 'prepare' }));
    effect.clearPrepared();
    effect.destroy();
  });

  it('does not start an explicit capture after the cache was cleared in the same turn', async () => {
    const capture = vi.fn().mockResolvedValue(snapshot());
    const effect = new Disintegrator({
      capture,
      effect: snapshotEffect(),
      preparation: false,
      sound: false,
    });

    const preparation = effect.prepare(element());
    effect.clearPrepared();
    await preparation;

    expect(capture).not.toHaveBeenCalled();
    effect.destroy();
  });

  it('does not start or retain an explicit capture after destroy in the same turn', async () => {
    const capture = vi.fn().mockResolvedValue(snapshot());
    const effect = new Disintegrator({
      capture,
      effect: snapshotEffect(),
      preparation: false,
      sound: false,
    });

    const preparation = effect.prepare(element());
    effect.destroy();
    await preparation;

    expect(capture).not.toHaveBeenCalled();
  });

  it('disposes an in-flight snapshot that resolves after the cache was cleared', async () => {
    let resolveCapture!: (value: HTMLCanvasElement) => void;
    const capture = vi.fn(
      () =>
        new Promise<HTMLCanvasElement>((resolve) => {
          resolveCapture = resolve;
        }),
    );
    const effect = new Disintegrator({
      capture,
      effect: snapshotEffect(),
      preparation: false,
      sound: false,
    });
    const preparation = effect.prepare(element());
    await vi.waitFor(() => expect(capture).toHaveBeenCalledOnce());
    const source = snapshot();

    effect.clearPrepared();
    resolveCapture(source);
    await preparation;

    expect(source.width).toBe(0);
    expect(source.height).toBe(0);
    effect.destroy();
  });

  it('handles a capture adapter that clears preparation reentrantly', async () => {
    const source = snapshot();
    const capture = vi.fn(() => {
      effect.clearPrepared();
      return source;
    });
    const effect: Disintegrator = new Disintegrator({
      capture,
      effect: snapshotEffect(),
      preparation: false,
      sound: false,
    });

    await effect.prepare(element());

    expect(capture).toHaveBeenCalledOnce();
    expect(source.width).toBe(0);
    expect(source.height).toBe(0);
    effect.destroy();
  });

  it('lets an explicit invalidation supersede a preparation waiting for a capture slot', async () => {
    const capture = vi.fn().mockResolvedValue(snapshot());
    const target = element();
    const effect = new Disintegrator({
      capture,
      effect: snapshotEffect(),
      preparation: false,
      sound: false,
    });

    const preparation = effect.prepare(target);
    effect.invalidate(target);
    await preparation;

    expect(capture).not.toHaveBeenCalled();
    effect.destroy();
  });

  it('applies the capture concurrency budget to explicit preparation', async () => {
    const resolvers: Array<(value: HTMLCanvasElement) => void> = [];
    const capture = vi.fn(
      () =>
        new Promise<HTMLCanvasElement>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const effect = new Disintegrator({
      capture,
      effect: snapshotEffect(),
      preparation: { concurrency: 2, invalidateOnResize: false },
      sound: false,
    });
    const targets = [element(), element(), element()];

    const preparation = effect.prepare(targets);
    await vi.waitFor(() => expect(capture).toHaveBeenCalledTimes(2));
    resolvers[0]?.(snapshot());
    await vi.waitFor(() => expect(capture).toHaveBeenCalledTimes(3));
    resolvers[1]?.(snapshot());
    resolvers[2]?.(snapshot());
    await preparation;

    effect.destroy();
  });

  it('respects immediate scheduling and capture concurrency', async () => {
    const resolvers: Array<(snapshot: HTMLCanvasElement) => void> = [];
    const capture = vi.fn(
      () =>
        new Promise<HTMLCanvasElement>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const effect = new Disintegrator({
      capture,
      effect: snapshotEffect(),
      preparation: { strategy: 'immediate', concurrency: 2, invalidateOnResize: false },
      sound: false,
    });
    effect.register([element(), element(), element()]);

    await vi.waitFor(() => expect(capture).toHaveBeenCalledTimes(2));
    resolvers[0]?.(snapshot());
    await vi.waitFor(() => expect(capture).toHaveBeenCalledTimes(3));
    resolvers[1]?.(snapshot());
    resolvers[2]?.(snapshot());
    await Promise.resolve();
    effect.destroy();
  });

  it('keeps preparation active until every registration is released', async () => {
    const capture = vi.fn().mockResolvedValue(snapshot());
    const effect = new Disintegrator({
      capture,
      effect: snapshotEffect(),
      preparation: { strategy: 'immediate', invalidateOnResize: false },
      sound: false,
    });
    const target = element();
    const unregisterFirst = effect.register(target);
    const unregisterSecond = effect.register(target);

    await vi.waitFor(() => expect(capture).toHaveBeenCalledOnce());
    unregisterFirst();
    effect.invalidate(target);
    await vi.waitFor(() => expect(capture).toHaveBeenCalledTimes(2));

    unregisterSecond();
    effect.invalidate(target);
    await Promise.resolve();
    expect(capture).toHaveBeenCalledTimes(2);

    effect.destroy();
  });

  it('waits for intersection and idle time in visible-idle mode', async () => {
    let intersectionCallback: IntersectionObserverCallback | undefined;
    class IntersectionObserverMock {
      constructor(callback: IntersectionObserverCallback) {
        intersectionCallback = callback;
      }
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
    let idleCallback: IdleRequestCallback | undefined;
    vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
    Object.defineProperty(window, 'requestIdleCallback', {
      configurable: true,
      value: vi.fn((callback: IdleRequestCallback) => {
        idleCallback = callback;
        return 1;
      }),
    });
    Object.defineProperty(window, 'cancelIdleCallback', { configurable: true, value: vi.fn() });
    const target = element();
    const capture = vi.fn().mockResolvedValue(snapshot());
    const effect = new Disintegrator({ capture, effect: snapshotEffect(), sound: false });

    effect.register(target);
    expect(capture).not.toHaveBeenCalled();
    intersectionCallback?.(
      [{ isIntersecting: true, target } as unknown as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
    expect(capture).not.toHaveBeenCalled();
    idleCallback?.({ didTimeout: false, timeRemaining: () => 10 });

    await vi.waitFor(() => expect(capture).toHaveBeenCalledOnce());
    effect.destroy();
  });

  it('supports idle scheduling with a user preparation condition', async () => {
    let idleCallback: IdleRequestCallback | undefined;
    Object.defineProperty(window, 'requestIdleCallback', {
      configurable: true,
      value: vi.fn((callback: IdleRequestCallback) => {
        idleCallback = callback;
        return 1;
      }),
    });
    Object.defineProperty(window, 'cancelIdleCallback', { configurable: true, value: vi.fn() });
    const rejected = element();
    const accepted = element();
    accepted.dataset.prepare = 'true';
    const capture = vi.fn().mockResolvedValue(snapshot());
    const effect = new Disintegrator({
      capture,
      effect: snapshotEffect(),
      preparation: {
        strategy: 'idle',
        invalidateOnResize: false,
        shouldPrepare: (candidate) => candidate.dataset.prepare === 'true',
      },
      sound: false,
    });

    effect.register([rejected, accepted]);
    idleCallback?.({ didTimeout: false, timeRemaining: () => 10 });

    await vi.waitFor(() => expect(capture).toHaveBeenCalledOnce());
    expect(capture).toHaveBeenCalledWith(accepted, expect.objectContaining({ operation: 'prepare' }));
    effect.destroy();
  });

  it('cancels an in-flight background snapshot before an operation claims the element', async () => {
    let resolvePreparation!: (value: HTMLCanvasElement) => void;
    const pendingPreparation = new Promise<HTMLCanvasElement>((resolve) => {
      resolvePreparation = resolve;
    });
    const capture = vi.fn((_element: HTMLElement, context: { operation: string }) =>
      context.operation === 'prepare' ? pendingPreparation : Promise.resolve(snapshot()),
    );
    const effect = new Disintegrator({
      capture,
      effect: snapshotEffect(),
      preparation: { strategy: 'immediate', invalidateOnResize: false },
      layout: false,
      sound: false,
    });
    const target = element();
    effect.register(target);
    await vi.waitFor(() =>
      expect(capture).toHaveBeenCalledWith(target, expect.objectContaining({ operation: 'prepare' })),
    );

    const immediate = defineEffect({
      remove: { animate: () => Promise.resolve() },
      restore: { animate: () => Promise.resolve() },
    });
    const removal = effect.remove(target, { effect: immediate });

    await vi.waitFor(() =>
      expect(capture).toHaveBeenCalledWith(target, expect.objectContaining({ operation: 'remove' })),
    );
    resolvePreparation(snapshot());
    await removal.finished;

    expect(capture).toHaveBeenCalledTimes(2);
    effect.destroy();
  });

  it('does not capture a queued preparation while restore owns the element', async () => {
    const operations: string[] = [];
    const capture = vi.fn((_element: HTMLElement, context: { operation: string }) => {
      operations.push(context.operation);
      return Promise.resolve(snapshot());
    });
    const immediate = defineEffect({
      remove: { animate: () => Promise.resolve() },
      restore: { animate: () => Promise.resolve() },
    });
    const effect = new Disintegrator({
      capture,
      preparation: { strategy: 'immediate', invalidateOnResize: false },
      effect: immediate,
      layout: false,
      sound: false,
    });
    const target = element();

    effect.register(target);
    await effect.restore(target).finished;

    expect(operations).toEqual(['restore']);

    effect.destroy();
  });

  it('reuses a successful restore snapshot for the following removal', async () => {
    const operations: string[] = [];
    const capture = vi.fn((_element: HTMLElement, context: { operation: string }) => {
      operations.push(context.operation);
      return Promise.resolve(snapshot());
    });
    const immediate = defineEffect({
      remove: { animate: () => Promise.resolve() },
      restore: { animate: () => Promise.resolve() },
    });
    const effect = new Disintegrator({
      capture,
      preparation: { strategy: 'immediate', invalidateOnResize: false },
      effect: immediate,
      layout: false,
      sound: false,
    });
    const target = element();

    effect.register(target);
    await effect.restore(target).finished;
    await effect.remove(target).finished;

    expect(operations).toEqual(['restore']);
    effect.destroy();
  });

  it('does not retain operation snapshots for elements that were never registered', async () => {
    const operations: string[] = [];
    const capture = vi.fn((_element: HTMLElement, context: { operation: string }) => {
      operations.push(context.operation);
      return Promise.resolve(snapshot());
    });
    const immediate = defineEffect({
      remove: { animate: () => Promise.resolve() },
      restore: { animate: () => Promise.resolve() },
    });
    const effect = new Disintegrator({ capture, effect: immediate, layout: false, sound: false });
    const target = element();

    await effect.restore(target).finished;
    await effect.remove(target).finished;

    expect(operations).toEqual(['restore', 'remove']);
    effect.destroy();
  });

  it('reuses a retained removal snapshot for same-size restoration', async () => {
    const operations: string[] = [];
    const source = snapshot();
    const capture = vi.fn((_element: HTMLElement, context: { operation: string }) => {
      operations.push(context.operation);
      return Promise.resolve(source);
    });
    const immediate = defineEffect({
      remove: { animate: () => Promise.resolve() },
      restore: { animate: () => Promise.resolve() },
    });
    const effect = new Disintegrator({
      capture,
      preparation: { strategy: 'immediate', invalidateOnResize: false },
      effect: immediate,
      layout: false,
      sound: false,
    });
    const target = element();
    effect.register(target);
    await vi.waitFor(() => expect(operations).toEqual(['prepare']));

    const removal = effect.remove(target, { retain: true });
    await removal.finished;
    const retained = effect.take(removal.removalId!);
    document.body.append(retained!);
    await effect.restore(retained!).finished;

    expect(operations).toEqual(['prepare']);
    effect.destroy();
  });

  it('reuses one snapshot across cancelled removal and restoration while releasing every visual', async () => {
    const source = snapshot();
    const capture = vi.fn(() => source);
    const cancel = vi.fn();
    const dispose = vi.fn();
    const cleanup = vi.fn();
    const seen: HTMLCanvasElement[] = [];
    const animate = (context: AnimationContext) => {
      seen.push(context.snapshot!);
      context.addCleanup(cleanup);
      return { finished: new Promise<void>(() => {}), cancel, dispose };
    };
    const effect = new Disintegrator({
      capture,
      effect: { remove: { animate }, restore: { animate } },
      preparation: { strategy: 'idle', invalidateOnResize: false },
      layout: false,
      sound: false,
    });
    const target = element();
    await effect.prepare(target);
    effect.register(target);
    try {
      for (const [index, kind] of (['remove', 'restore', 'remove', 'restore'] as const).entries()) {
        const operation = kind === 'remove' ? effect.remove(target, { retain: true }) : effect.restore(target);
        await vi.waitFor(() => expect(seen).toHaveLength(index + 1));
        operation.cancel();
        expect((await operation.finished).status).toBe('cancelled');
        expect(source.width).toBe(10);
        if (kind === 'remove') document.body.append(effect.take(operation.removalId!)!);
        expect(target.style.pointerEvents).toBe('');
        expect(document.querySelector('[aria-hidden="true"]')).toBeNull();
      }
      expect(seen).toEqual([source, source, source, source]);
      expect(capture).toHaveBeenCalledOnce();
      expect(cancel).toHaveBeenCalledTimes(4);
      expect(dispose).toHaveBeenCalledTimes(4);
      expect(cleanup).toHaveBeenCalledTimes(4);
      effect.clearPrepared();
      expect(source.width).toBe(0);
    } finally {
      effect.destroy();
    }
  });

  it.each(['invalidate', 'clearPrepared'] as const)(
    'recaptures after cancellation when %s was called during the animation',
    async (action) => {
      const source = snapshot();
      const capture = vi.fn<SnapshotCapture>(() => snapshot()).mockReturnValueOnce(source);
      const animate = vi.fn(() => new Promise<void>(() => {}));
      const effect = new Disintegrator({
        capture,
        effect: { remove: { animate }, restore: { animate } },
        layout: false,
        sound: false,
      });
      const target = element();
      const operation = effect.remove(target, { retain: true });
      await vi.waitFor(() => expect(animate).toHaveBeenCalledOnce());
      if (action === 'invalidate') effect.invalidate(target);
      else effect.clearPrepared();
      operation.cancel();
      await operation.finished;
      expect(source.width).toBe(0);
      document.body.append(effect.take(operation.removalId!)!);
      await effect.restore(target, { effect: snapshotEffect() }).finished;
      expect(capture).toHaveBeenCalledTimes(2);
      expect(capture.mock.calls.at(-1)?.[1]).toMatchObject({ invalidate: true });
      effect.destroy();
    },
  );

  it('keeps the captured dimensions when a restore is resized before cancellation', async () => {
    const capture = vi.fn(() => snapshot());
    const animate = vi.fn(() => new Promise<void>(() => {}));
    const effect = new Disintegrator({
      capture,
      effect: { remove: { animate }, restore: { animate } },
      preparation: { strategy: 'idle', invalidateOnResize: false },
      layout: false,
      sound: false,
    });
    const target = element();
    await effect.prepare(target);
    effect.register(target);
    const operation = effect.restore(target);
    await vi.waitFor(() => expect(animate).toHaveBeenCalledOnce());
    Object.defineProperty(target, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ ...rect(), width: 20 }),
    });
    operation.cancel();
    await operation.finished;
    await effect.remove(target, { effect: snapshotEffect() }).finished;
    expect(capture).toHaveBeenCalledTimes(2);
    effect.destroy();
  });

  it.each(['disabled', 'budget', 'discard', 'destroy', 'failure'] as const)(
    'releases a retained operation source on %s',
    async (reason) => {
      const source = snapshot();
      const capture = vi.fn(() => source);
      let reject!: (error: Error) => void;
      const animate = vi.fn(() => new Promise<void>((_resolve, fail) => (reject = fail)));
      const effect = new Disintegrator({
        capture,
        effect: { remove: { animate }, restore: { animate } },
        preparation: reason === 'disabled' ? false : { cachePixelBudget: reason === 'budget' ? 1 : 100 },
        layout: false,
        sound: false,
        onError: vi.fn(),
      });
      const operation = effect.remove(element(), { retain: true });
      await vi.waitFor(() => expect(animate).toHaveBeenCalledOnce());
      if (reason === 'destroy') effect.destroy();
      else if (reason === 'failure') reject(new Error('Playback failed'));
      else {
        if (reason === 'discard') effect.discard(operation.removalId!);
        operation.cancel();
      }
      expect((await operation.finished).status).toBe(reason === 'failure' ? 'skipped' : 'cancelled');
      expect(source.width).toBe(0);
      expect(source.height).toBe(0);
      effect.destroy();
    },
  );

  it('recaptures a retained element when its restoration size changed', async () => {
    const operations: string[] = [];
    const capture = vi.fn((_element: HTMLElement, context: { operation: string }) => {
      operations.push(context.operation);
      return Promise.resolve(snapshot());
    });
    const immediate = defineEffect({
      remove: { animate: () => Promise.resolve() },
      restore: { animate: () => Promise.resolve() },
    });
    const effect = new Disintegrator({
      capture,
      preparation: { strategy: 'immediate', invalidateOnResize: false },
      effect: immediate,
      layout: false,
      sound: false,
    });
    const target = element();
    effect.register(target);
    await vi.waitFor(() => expect(operations).toEqual(['prepare']));

    const removal = effect.remove(target, { retain: true });
    await removal.finished;
    const retained = effect.take(removal.removalId!);
    Object.defineProperty(retained!, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ ...rect(), height: 20, width: 20 }),
    });
    document.body.append(retained!);
    await effect.restore(retained!).finished;

    expect(operations).toEqual(['prepare', 'restore']);
    effect.destroy();
  });

  it('releases a retained snapshot when its removal id is discarded', async () => {
    const source = snapshot();
    const capture = vi.fn().mockResolvedValue(source);
    const immediate = defineEffect({
      remove: { animate: () => Promise.resolve() },
      restore: { animate: () => Promise.resolve() },
    });
    const effect = new Disintegrator({
      capture,
      preparation: { strategy: 'immediate', invalidateOnResize: false },
      effect: immediate,
      layout: false,
      sound: false,
    });
    const target = element();
    effect.register(target);
    await vi.waitFor(() => expect(capture).toHaveBeenCalledOnce());

    const removal = effect.remove(target, { retain: true });
    await removal.finished;
    expect(source.width).toBe(10);
    expect(effect.discard(removal.removalId!)).toBe(true);

    expect(source.width).toBe(0);
    effect.destroy();
  });

  it('uses an LRU pixel budget and captures an evicted element on demand', async () => {
    const first = element();
    const second = element();
    const capture = vi.fn(() => Promise.resolve(snapshot()));
    const effect = new Disintegrator({
      capture,
      effect: snapshotEffect(),
      preparation: { strategy: 'immediate', cachePixelBudget: 100, invalidateOnResize: false },
      layout: false,
      sound: false,
    });

    await effect.prepare([first, second]);
    expect(capture).toHaveBeenCalledTimes(2);
    await effect.remove(first).finished;

    expect(capture).toHaveBeenCalledTimes(3);
    effect.destroy();
  });

  it('invalidates a prepared snapshot and schedules a fresh one for a registered element', async () => {
    const target = element();
    const capture = vi.fn(() => Promise.resolve(snapshot()));
    const effect = new Disintegrator({
      capture,
      effect: snapshotEffect(),
      preparation: { strategy: 'immediate', invalidateOnResize: false },
      sound: false,
    });
    effect.register(target);
    await vi.waitFor(() => expect(capture).toHaveBeenCalledOnce());

    effect.invalidate(target);

    await vi.waitFor(() => expect(capture).toHaveBeenCalledTimes(2));
    effect.destroy();
  });
});
