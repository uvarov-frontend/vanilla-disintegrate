import { describe, expect, it } from 'vitest';

import { resolveAudioPreparation, resolveLayout, resolveParticles, resolvePreparation } from '../src/defaults';
import type { LayoutOptions } from '../src/types';

describe('option resolvers', () => {
  it('normalizes particle ranges and finite values', () => {
    const particles = resolveParticles({
      duration: -1,
      horizontalTravel: [280, 120],
      verticalTravel: [80, Number.NaN],
      convergence: 2,
      swirl: -10,
      alphaThreshold: 2,
      particleSize: 0,
      releaseRandomness: 2,
      fadeStart: -1,
      rotation: [180, -90],
      layoutRelease: -1,
    });

    expect(particles.duration).toBe(0);
    expect(particles.horizontalTravel).toEqual([120, 280]);
    expect(particles.verticalTravel).toEqual([-45, 80]);
    expect(particles.convergence).toBe(1);
    expect(particles.swirl).toBe(0);
    expect(particles.alphaThreshold).toBe(1);
    expect(particles.particleSize).toBe(0.25);
    expect(particles.releaseRandomness).toBe(1);
    expect(particles.fadeStart).toBe(0);
    expect(particles.rotation).toEqual([-90, 180]);
    expect(particles.layoutRelease).toBe(0);
  });

  it('uses curve-specific visual defaults unless they are overridden', () => {
    expect(resolveParticles({ curve: 'float' })).toMatchObject({ fadeStart: 0.3, waveTurns: 1.6 });
    expect(resolveParticles({ curve: 'burst' })).toMatchObject({ fadeStart: 0.12, waveTurns: 1 });
    expect(resolveParticles({ curve: 'drift', fadeStart: 0.8, waveTurns: 3 })).toMatchObject({
      fadeStart: 0.8,
      waveTurns: 3,
    });
  });

  it('resolves automatic, exact and explicit particle render quality', () => {
    expect(resolveParticles().renderQuality).toEqual({
      maxSourcePixels: 2_000_000,
      maxSourceDimension: 2048,
      maxRenderPixels: 4_000_000,
    });
    expect(resolveParticles({ renderQuality: 'exact' }).renderQuality).toBe('exact');
    expect(
      resolveParticles({
        renderQuality: {
          maxSourcePixels: 4_000_000.9,
          maxSourceDimension: 4096.9,
          maxRenderPixels: 8_000_000.9,
        },
      }).renderQuality,
    ).toEqual({
      maxSourcePixels: 4_000_000,
      maxSourceDimension: 4096,
      maxRenderPixels: 8_000_000,
    });
  });

  it('resolves layout without allowing undefined values to erase defaults', () => {
    expect(resolveLayout(false).enabled).toBe(false);
    const javascriptInput = { enabled: undefined, duration: undefined } as unknown as LayoutOptions;
    expect(resolveLayout(javascriptInput)).toMatchObject({ enabled: true, duration: 300 });
  });

  it('uses visible-idle background preparation unless explicitly disabled', () => {
    expect(resolvePreparation(undefined)).toMatchObject({ enabled: true, strategy: 'visible-idle' });
    expect(resolvePreparation(false).enabled).toBe(false);
    expect(resolvePreparation(true)).toMatchObject({ enabled: true, strategy: 'visible-idle', concurrency: 1 });
    expect(resolvePreparation({ strategy: 'idle', concurrency: 20, cachePixelBudget: -1 })).toMatchObject({
      enabled: true,
      strategy: 'idle',
      concurrency: 8,
      cachePixelBudget: 0,
    });
  });

  it('prepares enabled audio during idle time with a bounded decoded cache', () => {
    expect(resolveAudioPreparation(undefined)).toMatchObject({
      enabled: true,
      strategy: 'idle',
      cacheByteBudget: 8 * 1024 * 1024,
    });
    expect(resolveAudioPreparation(false).enabled).toBe(false);
    expect(resolveAudioPreparation('idle').strategy).toBe('idle');
    expect(resolveAudioPreparation({ cacheByteBudget: -1 }).cacheByteBudget).toBe(0);
  });
});
