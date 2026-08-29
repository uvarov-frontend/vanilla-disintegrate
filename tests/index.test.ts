import { beforeEach, describe, expect, it, vi } from 'vitest';

import Disintegrator, { builtInEffects, defineEffect } from '../src';
import type { AnimationFactory } from '../src/types';

function rect(): DOMRect {
  return {
    bottom: 80,
    height: 80,
    left: 0,
    right: 240,
    top: 0,
    width: 240,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  };
}

function snapshot() {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;
  return canvas;
}

function target() {
  const element = document.createElement('article');
  document.body.append(element);
  Object.defineProperty(element, 'getBoundingClientRect', { value: rect });
  return element;
}

function customEffect(animate = vi.fn(() => Promise.resolve())) {
  return defineEffect({
    remove: { needsSnapshot: false, animate, sound: null },
    restore: { needsSnapshot: false, animate, sound: null },
  });
}

beforeEach(() => document.body.replaceChildren());

describe('public entries', () => {
  it('contains four paired effects and eight explicit audio slots', () => {
    expect(Object.keys(builtInEffects)).toEqual(['dust', 'vapor', 'scatter', 'wind']);
    for (const effect of Object.values(builtInEffects)) {
      expect(effect.remove.animate).toBeTypeOf('function');
      expect(effect.restore.animate).toBeTypeOf('function');
      expect('sound' in effect.remove).toBe(true);
      expect('sound' in effect.restore).toBe(true);
    }
    expect(builtInEffects.dust.remove.sound).not.toBeNull();
    expect(builtInEffects.wind.remove.sound).not.toBeNull();
    expect(
      Object.values(builtInEffects)
        .flatMap((effect) => [effect.remove.sound, effect.restore.sound])
        .filter(Boolean),
    ).toHaveLength(2);
  });

  it('uses the capture adapter supplied to the core entry', async () => {
    const element = target();
    const capture = vi.fn().mockResolvedValue(snapshot());
    const effect = new Disintegrator({ capture, effect: 'dust', layout: false, sound: false });

    await effect.remove(element).finished;

    expect(capture).toHaveBeenCalledWith(element, expect.objectContaining({ operation: 'remove' }));
    effect.destroy();
  });

  it('runs snapshotless effects without requiring a capture adapter', async () => {
    const element = target();
    const animate = vi.fn(() => Promise.resolve());
    const effect = new Disintegrator({ effect: customEffect(animate), layout: false });

    const result = await effect.remove(element).finished;

    expect(result.status).toBe('completed');
    expect(animate).toHaveBeenCalledOnce();
    effect.destroy();
  });

  it('commits built-in content operations without substituting a renderer when WebGL2 is absent', async () => {
    const element = target();
    const effect = new Disintegrator({
      capture: vi.fn().mockResolvedValue(snapshot()),
      effect: 'dust',
      layout: false,
      sound: false,
    });

    const result = await effect.remove(element).finished;

    expect(result.status).toBe('skipped');
    expect(element.isConnected).toBe(false);
    effect.destroy();
  });

  it('leaves effect audio silent unless it is opted into', async () => {
    const element = target();
    const played: unknown[] = [];
    const animate = vi.fn(() => Promise.resolve());
    const sound = vi.fn(() => {
      played.push(true);
    });
    const effect = new Disintegrator({
      effect: defineEffect({
        remove: { needsSnapshot: false, animate, sound },
        restore: { needsSnapshot: false, animate, sound },
      }),
      layout: false,
    });

    await effect.remove(element).finished;

    expect(sound).not.toHaveBeenCalled();
    expect(played).toHaveLength(0);
    effect.destroy();
  });

  it('plays the phase sound once audio is enabled', async () => {
    const element = target();
    const animate = vi.fn(() => Promise.resolve());
    const sound = vi.fn();
    const effect = new Disintegrator({
      effect: defineEffect({
        remove: { needsSnapshot: false, animate, sound },
        restore: { needsSnapshot: false, animate, sound },
      }),
      layout: false,
      sound: true,
    });

    await effect.remove(element).finished;

    expect(sound).toHaveBeenCalledOnce();
    effect.destroy();
  });

  it('resolves registered custom effects by name', async () => {
    const element = target();
    const animate = vi.fn(() => Promise.resolve());
    const effect = new Disintegrator({
      effect: 'fold',
      effects: { fold: customEffect(animate) },
      layout: false,
    });

    await effect.remove(element).finished;

    expect(animate).toHaveBeenCalledOnce();
    effect.destroy();
  });

  it('normalizes a native WAAPI animation returned by a custom phase', async () => {
    const element = target();
    const animate = vi.fn<AnimationFactory>(({ visual }) => {
      expect(visual).toBeInstanceOf(HTMLCanvasElement);
      return visual!.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 20 });
    });
    const custom = defineEffect({
      remove: { animate, sound: null },
      restore: { animate, sound: null },
    });
    const effect = new Disintegrator({
      capture: vi.fn().mockResolvedValue(snapshot()),
      effect: custom,
      layout: false,
    });

    await effect.remove(element).finished;

    expect(animate).toHaveBeenCalledOnce();
    effect.destroy();
  });
});
