import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Disintegrator } from '../src/disintegrator';
import { defineEffect } from '../src/effects';
import type { AnimationFactory, AnimationPlayback } from '../src/types';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function rect(left = 12, top = 18): DOMRect {
  return {
    bottom: top + 80,
    height: 80,
    left,
    right: left + 240,
    top,
    width: 240,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

function snapshot() {
  const canvas = document.createElement('canvas');
  canvas.width = 240;
  canvas.height = 80;
  return canvas;
}

function createTarget() {
  const container = document.createElement('main');
  const target = document.createElement('article');
  const following = document.createElement('article');
  container.append(target, following);
  document.body.append(container);
  Object.defineProperty(target, 'getBoundingClientRect', { configurable: true, value: () => rect() });
  Object.defineProperty(following, 'getBoundingClientRect', { value: () => rect(12, 98) });
  Object.defineProperty(container, 'getBoundingClientRect', { value: () => rect(0, 0) });
  return { container, following, target };
}

function playback(finished: Promise<void> = Promise.resolve()): AnimationPlayback {
  return {
    element: document.createElement('canvas'),
    duration: 40,
    layoutDelay: 0,
    finished,
    cancel: vi.fn(),
    dispose: vi.fn(),
  };
}

function customEffect(remove: AnimationFactory = () => playback(), restore: AnimationFactory = () => playback()) {
  return defineEffect({
    remove: { animate: remove, sound: null },
    restore: { animate: restore, sound: null },
  });
}

beforeEach(() => document.body.replaceChildren());

describe('remove and restore lifecycle', () => {
  it('retains a removed node under an opaque id without exposing it on the operation', async () => {
    const { target } = createTarget();
    const effect = new Disintegrator({
      capture: vi.fn().mockResolvedValue(snapshot()),
      effect: customEffect(),
      layout: false,
    });

    const operation = effect.remove(target, { retain: true });
    const result = await operation.finished;

    expect(result.status).toBe('completed');
    expect(operation.removalId).not.toBeNull();
    expect('element' in operation).toBe(false);
    expect(target.isConnected).toBe(false);
    expect(effect.take(operation.removalId!)).toBe(target);
    expect(effect.take(operation.removalId!)).toBeNull();
    effect.destroy();
  });

  it('does not retain nodes unless requested', async () => {
    const { target } = createTarget();
    const effect = new Disintegrator({
      capture: vi.fn().mockResolvedValue(snapshot()),
      effect: customEffect(),
      layout: false,
    });

    const operation = effect.remove(target);
    await operation.finished;

    expect(operation.removalId).toBeNull();
    expect(target.isConnected).toBe(false);
    effect.destroy();
  });

  it('rejects a concurrent operation without committing or allocating a retention id', async () => {
    const { target } = createTarget();
    const captured = deferred<HTMLCanvasElement>();
    const animate = vi.fn<AnimationFactory>(() => playback());
    const effect = new Disintegrator({
      capture: () => captured.promise,
      effect: customEffect(animate),
      layout: false,
    });

    const first = effect.remove(target, { retain: true });
    const second = effect.remove(target, { effect: 'not-registered', retain: true });
    let rejectedSettled = false;
    void second.finished.then(() => {
      rejectedSettled = true;
    });

    await Promise.resolve();

    expect(rejectedSettled).toBe(false);
    expect(second.removalId).toBeNull();
    expect(target.isConnected).toBe(true);

    captured.resolve(snapshot());
    expect((await first.finished).status).toBe('completed');
    expect((await second.finished).status).toBe('rejected');
    expect(animate).toHaveBeenCalledOnce();
    expect(effect.take(first.removalId!)).toBe(target);
    effect.destroy();
  });

  it('settles and releases ownership when setup throws before capture', async () => {
    const { target } = createTarget();
    const error = new Error('computed style failed');
    const onError = vi.fn();
    const computedStyle = vi
      .fn()
      .mockImplementationOnce(() => {
        throw error;
      })
      .mockReturnValue({ opacity: '1' });
    vi.stubGlobal('getComputedStyle', computedStyle);
    const effectDefinition = customEffect();
    const effect = new Disintegrator({
      capture: vi.fn().mockResolvedValue(snapshot()),
      effect: effectDefinition,
      layout: false,
      onError,
    });

    expect((await effect.restore(target).finished).status).toBe('skipped');
    expect(onError).toHaveBeenCalledWith(error, expect.objectContaining({ operation: 'restore' }));
    expect((await effect.remove(target).finished).status).toBe('completed');
    effect.destroy();
  });

  it('stops setup when onTrigger destroys the instance', async () => {
    const { target } = createTarget();
    const capture = vi.fn().mockResolvedValue(snapshot());
    const effect = new Disintegrator({
      capture,
      effect: customEffect(),
      layout: false,
      onTrigger: () => effect.destroy(),
    });

    const result = await effect.remove(target).finished;

    expect(result.status).toBe('cancelled');
    expect(capture).not.toHaveBeenCalled();
    expect(target.style.pointerEvents).toBe('');
    expect(target.isConnected).toBe(false);
  });

  it('cleans resources created by an animation that destroys the instance', async () => {
    const { target } = createTarget();
    const beforeDestroy = vi.fn();
    const afterDestroy = vi.fn();
    const cancel = vi.fn();
    const dispose = vi.fn();
    const createdPlayback = { ...playback(new Promise(() => undefined)), cancel, dispose };
    const animate = vi.fn<AnimationFactory>((context) => {
      context.addCleanup(beforeDestroy);
      effect.destroy();
      context.addCleanup(afterDestroy);
      return createdPlayback;
    });
    const effect = new Disintegrator({
      capture: vi.fn().mockResolvedValue(snapshot()),
      effect: customEffect(animate),
      layout: false,
    });

    const result = await effect.remove(target).finished;
    await Promise.resolve();

    expect(result.status).toBe('cancelled');
    expect(cancel).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
    expect(beforeDestroy).toHaveBeenCalledOnce();
    expect(afterDestroy).toHaveBeenCalledOnce();
    expect(document.body.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('stops before renderer setup when the random source destroys the instance', async () => {
    const { target } = createTarget();
    const animate = vi.fn<AnimationFactory>(() => playback());
    const effect = new Disintegrator({
      capture: vi.fn().mockResolvedValue(snapshot()),
      effect: customEffect(animate),
      layout: false,
      random: () => {
        effect.destroy();
        return 0.5;
      },
    });

    const result = await effect.remove(target).finished;

    expect(result.status).toBe('cancelled');
    expect(animate).not.toHaveBeenCalled();
    expect(document.body.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('cleans every visual resource when playback completion rejects', async () => {
    const { target } = createTarget();
    const error = new Error('renderer failed');
    const dispose = vi.fn();
    const registeredCleanup = vi.fn();
    const onError = vi.fn();
    const animate = vi.fn<AnimationFactory>((context) => {
      context.addCleanup(registeredCleanup);
      return {
        element: document.createElement('canvas'),
        finished: Promise.reject(error),
        dispose,
      };
    });
    const effect = new Disintegrator({
      capture: vi.fn().mockResolvedValue(snapshot()),
      effect: customEffect(animate),
      layout: false,
      onError,
    });

    const result = await effect.remove(target).finished;

    expect(result.status).toBe('skipped');
    expect(dispose).toHaveBeenCalledOnce();
    expect(registeredCleanup).toHaveBeenCalledOnce();
    expect(document.body.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(onError).toHaveBeenCalledWith(error, expect.objectContaining({ operation: 'remove' }));
    effect.destroy();
  });

  it('lets a reactive renderer own the DOM removal through detach', async () => {
    const { target } = createTarget();
    const detach = vi.fn((element: HTMLElement) => element.remove());
    const effect = new Disintegrator({
      capture: vi.fn().mockResolvedValue(snapshot()),
      effect: customEffect(),
      layout: false,
    });

    const result = await effect.remove(target, { detach }).finished;

    expect(result.status).toBe('completed');
    expect(detach).toHaveBeenCalledOnce();
    expect(detach).toHaveBeenCalledWith(target);
    expect(target.isConnected).toBe(false);
    effect.destroy();
  });

  it('does not retain an element when detach cancels the committing operation', async () => {
    const { target } = createTarget();
    const effect = new Disintegrator({
      capture: vi.fn().mockResolvedValue(snapshot()),
      effect: customEffect(),
      layout: false,
    });
    const operation = effect.remove(target, {
      detach: (element) => {
        element.remove();
        operation.cancel();
      },
      retain: true,
    });

    const result = await operation.finished;

    expect(result.status).toBe('cancelled');
    expect(effect.take(operation.removalId!)).toBeNull();
    effect.destroy();
  });

  it('falls back to native removal when a custom detach throws', async () => {
    const { target } = createTarget();
    const error = new Error('state commit failed');
    const onError = vi.fn();
    const effect = new Disintegrator({
      capture: vi.fn().mockResolvedValue(snapshot()),
      effect: customEffect(),
      layout: false,
      onError,
    });

    const result = await effect.remove(target, {
      detach: () => {
        throw error;
      },
    }).finished;

    expect(result.status).toBe('completed');
    expect(target.isConnected).toBe(false);
    expect(onError).toHaveBeenCalledWith(error, expect.objectContaining({ operation: 'remove', element: target }));
    effect.destroy();
  });

  it('restores a retained node with its paired effect and current geometry', async () => {
    const { container, target } = createTarget();
    const restore = vi.fn<AnimationFactory>(() => playback());
    const effectDefinition = customEffect(undefined, restore);
    const effect = new Disintegrator({
      capture: vi.fn().mockResolvedValue(snapshot()),
      effect: effectDefinition,
      layout: false,
    });
    const removal = effect.remove(target, { retain: true });
    await removal.finished;
    const retained = effect.take(removal.removalId!);
    expect(retained).toBe(target);
    Object.defineProperty(target, 'getBoundingClientRect', { configurable: true, value: () => rect(60, 90) });
    container.append(target);

    const restoration = effect.restore(target);
    await restoration.finished;

    expect(restore).toHaveBeenCalledOnce();
    const restoreContext = restore.mock.calls[0]?.[0];
    expect(restoreContext?.operation).toBe('restore');
    expect(restoreContext?.bounds).toMatchObject({ left: 60, top: 90, width: 240, height: 80 });
    expect(target.style.opacity).toBe('');
    expect(target.isConnected).toBe(true);
    effect.destroy();
  });

  it('allows an explicit restore effect to override the effect retained with the element', async () => {
    const { container, target } = createTarget();
    const pairedRestore = vi.fn<AnimationFactory>(() => playback());
    const overrideRestore = vi.fn<AnimationFactory>(() => playback());
    const effect = new Disintegrator({
      capture: vi.fn().mockResolvedValue(snapshot()),
      effect: customEffect(undefined, pairedRestore),
      layout: false,
    });
    const removal = effect.remove(target, { retain: true });
    await removal.finished;
    const retained = effect.take(removal.removalId!);
    container.append(retained!);

    await effect.restore(retained!, { effect: customEffect(undefined, overrideRestore) }).finished;

    expect(pairedRestore).not.toHaveBeenCalled();
    expect(overrideRestore).toHaveBeenCalledOnce();
    effect.destroy();
  });

  it('remeasures restore geometry after same-turn layout and scroll anchoring changes', async () => {
    const { target } = createTarget();
    const captured = deferred<HTMLCanvasElement>();
    const restore = vi.fn<AnimationFactory>(() => playback());
    let currentRect = rect(30, 140);
    Object.defineProperty(target, 'getBoundingClientRect', {
      configurable: true,
      value: () => currentRect,
    });
    const effect = new Disintegrator({
      capture: vi.fn(() => captured.promise),
      effect: customEffect(undefined, restore),
      layout: false,
    });

    const operation = effect.restore(target);
    currentRect = rect(30, 206);
    captured.resolve(snapshot());
    await operation.finished;

    expect(restore.mock.calls[0]?.[0].bounds.top).toBe(206);
    expect(restore.mock.calls[0]?.[0].layer.style.top).toBe('206px');
    effect.destroy();
  });

  it('animates a newly created connected element without removal history', async () => {
    const { container } = createTarget();
    const fresh = document.createElement('article');
    Object.defineProperty(fresh, 'getBoundingClientRect', { value: () => rect(80, 110) });
    container.append(fresh);
    const restore = vi.fn<AnimationFactory>(() => playback());
    const effect = new Disintegrator({ capture: vi.fn().mockResolvedValue(snapshot()), layout: false });

    const operation = effect.restore(fresh, { effect: customEffect(undefined, restore) });
    await operation.finished;

    expect(restore).toHaveBeenCalledOnce();
    expect(fresh.style.opacity).toBe('');
    effect.destroy();
  });

  it('rejects restoration before the user inserts the element', () => {
    const detached = document.createElement('article');
    Object.defineProperty(detached, 'getBoundingClientRect', { value: () => rect() });
    const effect = new Disintegrator({ capture: vi.fn().mockResolvedValue(snapshot()) });

    expect(() => effect.restore(detached)).toThrow('connected element with measurable geometry');
    effect.destroy();
  });

  it('skips capture for a snapshotless custom effect', async () => {
    const { target } = createTarget();
    const animate = vi.fn<AnimationFactory>(({ snapshot: captured }) => {
      expect(captured).toBeNull();
      return Promise.resolve();
    });
    const effect = new Disintegrator({
      effect: defineEffect({
        remove: { needsSnapshot: false, animate, sound: null },
        restore: { needsSnapshot: false, animate, sound: null },
      }),
      layout: false,
    });

    const result = await effect.remove(target).finished;

    expect(result.status).toBe('completed');
    expect(animate).toHaveBeenCalledOnce();
    expect(target.isConnected).toBe(false);
    effect.destroy();
  });

  it('commits removal and reports a capture failure', async () => {
    const { target } = createTarget();
    const error = new Error('capture failed');
    const onError = vi.fn();
    const effect = new Disintegrator({
      capture: () => {
        throw error;
      },
      effect: customEffect(),
      layout: false,
      onError,
    });

    const result = await effect.remove(target, { retain: true }).finished;

    expect(result.status).toBe('skipped');
    expect(target.isConnected).toBe(false);
    expect(onError).toHaveBeenCalledWith(error, expect.objectContaining({ operation: 'remove', element: target }));
    effect.destroy();
  });

  it('cancels a pending visual operation but keeps the requested content result', async () => {
    const { target } = createTarget();
    const capture = deferred<HTMLCanvasElement>();
    const effect = new Disintegrator({ capture: () => capture.promise, effect: customEffect(), layout: false });

    const operation = effect.remove(target, { retain: true });
    operation.cancel();
    const result = await operation.finished;
    capture.resolve(snapshot());

    expect(result.status).toBe('cancelled');
    expect(target.isConnected).toBe(false);
    expect(effect.take(operation.removalId!)).toBe(target);
    effect.destroy();
  });

  it('can discard a retained id before its pending removal finishes', async () => {
    const { target } = createTarget();
    const capture = deferred<HTMLCanvasElement>();
    const effect = new Disintegrator({ capture: () => capture.promise, effect: customEffect(), layout: false });
    const operation = effect.remove(target, { retain: true });

    expect(effect.discard(operation.removalId!)).toBe(true);
    capture.resolve(snapshot());
    await operation.finished;

    expect(effect.take(operation.removalId!)).toBeNull();
    effect.destroy();
  });

  it('supports targeted and complete retained-element disposal', async () => {
    const first = createTarget().target;
    const second = createTarget().target;
    const effect = new Disintegrator({
      capture: vi.fn().mockResolvedValue(snapshot()),
      effect: customEffect(),
      layout: false,
    });
    const firstRemoval = effect.remove(first, { retain: true });
    const secondRemoval = effect.remove(second, { retain: true });
    await Promise.all([firstRemoval.finished, secondRemoval.finished]);

    expect(effect.discard(firstRemoval.removalId!)).toBe(true);
    expect(effect.discard(firstRemoval.removalId!)).toBe(false);
    expect(effect.discardAll()).toBe(1);
    expect(effect.take(secondRemoval.removalId!)).toBeNull();
    effect.destroy();
  });

  it('still commits content operations when reduced motion is requested', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    });
    const { target } = createTarget();
    const capture = vi.fn().mockResolvedValue(snapshot());
    const effect = new Disintegrator({ capture, effect: customEffect(), layout: false });

    const result = await effect.remove(target).finished;

    expect(result.status).toBe('skipped');
    expect(capture).not.toHaveBeenCalled();
    expect(target.isConnected).toBe(false);
    effect.destroy();
  });
});
