import { describe, expect, it } from 'vitest';

import { resolveParticles } from '../src/defaults';
import { createParticleAnimation, createParticleField, createParticleRestoreAnimation } from '../src/particle-renderer';
import type { AnimationContext } from '../src/types';

describe('particle renderer', () => {
  it('assigns every visible source block to exactly one particle', () => {
    const width = 4;
    const height = 3;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let index = 3; index < pixels.length; index += 4) pixels[index] = 255;

    const field = createParticleField(pixels, width, height, resolveParticles(), 1, 1, () => 0.5);
    const sources = Array.from({ length: field.data.length / 7 }, (_, index) => {
      const offset = index * 7;
      return `${String(field.data[offset])}:${String(field.data[offset + 1])}`;
    });

    expect(field.blockSize).toBe(1);
    expect(sources).toHaveLength(width * height);
    expect(new Set(sources).size).toBe(sources.length);
    expect(field.thresholdMap.every((threshold) => threshold > 0 && threshold < 255)).toBe(true);
    expect(field.layoutReleaseProgress).toBeGreaterThan(0);
    expect(field.layoutReleaseProgress).toBeLessThan(1);

    const particleThresholds = Array.from({ length: field.data.length / 7 }, (_, index) => {
      const offset = index * 7;
      const x = field.data[offset] ?? 0;
      const y = field.data[offset + 1] ?? 0;
      return field.thresholdMap[y * width + x] ?? 0;
    }).sort((first, second) => first - second);
    const releaseIndex = Math.ceil(particleThresholds.length * 0.6) - 1;
    expect(field.layoutReleaseProgress).toBe((particleThresholds[releaseIndex] ?? 0) / 255);
  });

  it('does not create particles for fully transparent source blocks', () => {
    const pixels = new Uint8ClampedArray(4 * 4 * 4);
    pixels[3] = 255;

    const field = createParticleField(pixels, 4, 4, resolveParticles(), 1, 1, () => 0.5);

    expect(field.data.length / 7).toBe(1);
  });

  it('keeps WebGL particle density independent from timeline options', () => {
    const width = 250;
    const height = 200;
    const pixels = new Uint8ClampedArray(width * height * 4);
    const short = createParticleField(pixels, width, height, resolveParticles({ duration: 200 }), 1, 1, () => 0.5);
    const long = createParticleField(pixels, width, height, resolveParticles({ duration: 4000 }), 1, 1, () => 0.5);

    expect(short.blockSize).toBe(1);
    expect(long.blockSize).toBe(1);
  });

  it('reserves enough timeline for the last particles to fade naturally', () => {
    const pixels = new Uint8ClampedArray([255, 255, 255, 255]);
    const field = createParticleField(pixels, 1, 1, resolveParticles({ origin: 'random' }), 1, 1, () => 1);

    expect(field.data[2]).toBeCloseTo(0.68);
  });

  it('keeps the original upward scatter field geometry', () => {
    const pixels = new Uint8ClampedArray([255, 255, 255, 255]);
    const values = [0.5, 0.25, 0.5, 0.5, 0.5, 0.5];
    const scatter = createParticleField(
      pixels,
      1,
      1,
      resolveParticles({ motion: 'scatter', horizontalTravel: [-100, 100], rise: [50, 100] }),
      1,
      1,
      () => values.shift() ?? 0.5,
    );

    expect(scatter.data[3]).toBe(-50);
    expect(scatter.data[4]).toBe(-75);
  });

  it('does not substitute another renderer when WebGL2 is unavailable', () => {
    const snapshot = document.createElement('canvas');
    snapshot.width = 2;
    snapshot.height = 2;
    const context: AnimationContext = {
      operation: 'remove',
      element: document.createElement('div'),
      layer: document.createElement('div'),
      visual: null,
      snapshot,
      bounds: new DOMRect(0, 0, 2, 2),
      signal: new AbortController().signal,
      reducedMotion: false,
      random: () => 0.5,
      addCleanup: () => undefined,
    };

    expect(createParticleAnimation()(context)).toBeNull();
    expect(createParticleRestoreAnimation()({ ...context, operation: 'restore' })).toBeNull();
  });
});
