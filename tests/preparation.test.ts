import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Disintegrator } from '../src/disintegrator';
import { defineEffect } from '../src/effects';

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

beforeEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('snapshot preparation', () => {
  it('does not start observers or capture when background preparation is disabled', async () => {
    const capture = vi.fn().mockResolvedValue(snapshot());
    const observer = vi.fn();
    vi.stubGlobal('IntersectionObserver', observer);
    const effect = new Disintegrator({ capture, preparation: false });

    const unregister = effect.register(element());
    await Promise.resolve();

    expect(observer).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
    unregister();
    effect.destroy();
  });

  it('supports explicit immediate preparation even when background work is disabled', async () => {
    const target = element();
    const capture = vi.fn().mockResolvedValue(snapshot());
    const effect = new Disintegrator({ capture, preparation: false });

    await effect.prepare(target);

    expect(capture).toHaveBeenCalledWith(target, expect.objectContaining({ operation: 'prepare' }));
    effect.clearPrepared();
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
      preparation: { concurrency: 2, invalidateOnResize: false },
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
      preparation: { strategy: 'immediate', concurrency: 2, invalidateOnResize: false },
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
    const effect = new Disintegrator({
      capture,
      preparation: { strategy: 'visible-idle', invalidateOnResize: false },
    });

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
      preparation: {
        strategy: 'idle',
        invalidateOnResize: false,
        shouldPrepare: (candidate) => candidate.dataset.prepare === 'true',
      },
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
      remove: { animate: () => Promise.resolve(), sound: null },
      restore: { animate: () => Promise.resolve(), sound: null },
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
      remove: { animate: () => Promise.resolve(), sound: null },
      restore: { animate: () => Promise.resolve(), sound: null },
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
      remove: { animate: () => Promise.resolve(), sound: null },
      restore: { animate: () => Promise.resolve(), sound: null },
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

  it('reuses a retained removal snapshot for same-size restoration', async () => {
    const operations: string[] = [];
    const source = snapshot();
    const capture = vi.fn((_element: HTMLElement, context: { operation: string }) => {
      operations.push(context.operation);
      return Promise.resolve(source);
    });
    const immediate = defineEffect({
      remove: { animate: () => Promise.resolve(), sound: null },
      restore: { animate: () => Promise.resolve(), sound: null },
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

  it('recaptures a retained element when its restoration size changed', async () => {
    const operations: string[] = [];
    const capture = vi.fn((_element: HTMLElement, context: { operation: string }) => {
      operations.push(context.operation);
      return Promise.resolve(snapshot());
    });
    const immediate = defineEffect({
      remove: { animate: () => Promise.resolve(), sound: null },
      restore: { animate: () => Promise.resolve(), sound: null },
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
      remove: { animate: () => Promise.resolve(), sound: null },
      restore: { animate: () => Promise.resolve(), sound: null },
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
      preparation: { strategy: 'immediate', invalidateOnResize: false },
    });
    effect.register(target);
    await vi.waitFor(() => expect(capture).toHaveBeenCalledOnce());

    effect.invalidate(target);

    await vi.waitFor(() => expect(capture).toHaveBeenCalledTimes(2));
    effect.destroy();
  });
});
