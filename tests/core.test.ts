import { describe, expect, it, vi } from 'vitest';

import { CoreDisintegrator } from '../src/core';
import { resolvedAnimation } from './setup';

function rect(top: number, height = 80, left = 0, width = 240): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

function snapshot() {
  const canvas = document.createElement('canvas');
  canvas.width = 3;
  canvas.height = 2;
  return canvas;
}

function createList() {
  const list = document.createElement('div');
  const previous = document.createElement('article');
  const target = document.createElement('article');
  const following = document.createElement('article');
  list.style.display = 'grid';
  list.append(previous, target, following);
  document.body.append(list);

  Object.defineProperty(target, 'getBoundingClientRect', { value: () => rect(100) });
  Object.defineProperty(previous, 'getBoundingClientRect', { value: () => rect(0) });
  Object.defineProperty(following, 'getBoundingClientRect', {
    value: () => rect(target.style.display === 'none' ? 100 : 200),
  });
  Object.defineProperty(list, 'getBoundingClientRect', {
    value: () => rect(0, target.style.display === 'none' ? 160 : 240),
  });

  const previousAnimate = vi.fn(resolvedAnimation);
  const followingAnimate = vi.fn(resolvedAnimation);
  Object.defineProperty(previous, 'animate', { value: previousAnimate });
  Object.defineProperty(following, 'animate', { value: followingAnimate });

  return { list, previous, target, following, previousAnimate, followingAnimate };
}

describe('CoreDisintegrator', () => {
  it('disintegrates the target and only pulls following siblings into place', async () => {
    const capture = vi.fn().mockResolvedValue(snapshot());
    const onStart = vi.fn();
    const onComplete = vi.fn();
    const { target, previousAnimate, followingAnimate } = createList();
    const effect = new CoreDisintegrator({
      capture,
      particles: { frames: 4, repetitions: 1 },
      preparation: false,
      onStart,
      onComplete,
      random: () => 0.5,
    });

    const handle = await effect.disintegrate(target);

    expect(handle.status).toBe('running');
    expect(capture).toHaveBeenCalledOnce();
    expect(target.style.display).toBe('none');
    expect(onStart).toHaveBeenCalledOnce();
    expect(previousAnimate).not.toHaveBeenCalled();
    expect(followingAnimate).toHaveBeenCalledWith(
      [{ transform: 'translate3d(0px, 100px, 0)' }, { transform: 'translate3d(0, 0, 0)' }],
      expect.objectContaining({ duration: 300 }),
    );

    await handle.finished;
    expect(onComplete).toHaveBeenCalledOnce();
    effect.destroy();
  });

  it('removes the original node while the particle effect continues in a fixed overlay', async () => {
    const { target } = createList();
    const effect = new CoreDisintegrator({
      capture: vi.fn().mockResolvedValue(snapshot()),
      particles: { frames: 2 },
      preparation: false,
    });

    const handle = await effect.remove(target);

    expect(handle.status).toBe('running');
    expect(target.isConnected).toBe(false);
    await handle.finished;
    effect.destroy();
  });

  it('skips capture and DOM changes for reduced motion', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    });
    const capture = vi.fn().mockResolvedValue(snapshot());
    const { target } = createList();
    const effect = new CoreDisintegrator({ capture, preparation: false });

    const handle = await effect.disintegrate(target);

    expect(handle.status).toBe('skipped');
    expect(capture).not.toHaveBeenCalled();
    expect(target.style.display).toBe('');
    effect.destroy();
  });

  it('still performs remove() when animation is skipped', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    });
    const capture = vi.fn().mockResolvedValue(snapshot());
    const { target } = createList();
    const effect = new CoreDisintegrator({ capture, preparation: false });

    const handle = await effect.remove(target);

    expect(handle.status).toBe('skipped');
    expect(capture).not.toHaveBeenCalled();
    expect(target.isConnected).toBe(false);
    effect.destroy();
  });

  it('reports capture errors and restores interactivity', async () => {
    const error = new Error('capture failed');
    const onError = vi.fn();
    const { target } = createList();
    target.style.pointerEvents = 'auto';
    const effect = new CoreDisintegrator({
      capture: vi.fn().mockRejectedValue(error),
      preparation: false,
      onError,
    });

    const handle = await effect.disintegrate(target);

    expect(handle.status).toBe('skipped');
    expect(target.style.pointerEvents).toBe('auto');
    expect(onError).toHaveBeenCalledWith(error, { element: target, overlay: null });
    effect.destroy();
  });
});
