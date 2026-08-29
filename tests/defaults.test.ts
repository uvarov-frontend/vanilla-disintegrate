import { describe, expect, it } from 'vitest';

import { resolveLayout, resolveParticles, resolvePreparation } from '../src/defaults';
import type { LayoutOptions } from '../src/types';

describe('option resolvers', () => {
  it('normalizes particle ranges and finite values', () => {
    const particles = resolveParticles({
      duration: -1,
      horizontalTravel: [280, 120],
      rise: [80, Number.NaN],
      swirl: -10,
    });

    expect(particles.duration).toBe(0);
    expect(particles.horizontalTravel).toEqual([120, 280]);
    expect(particles.rise).toEqual([80, 100]);
    expect(particles.swirl).toBe(0);
  });

  it('resolves layout without allowing undefined values to erase defaults', () => {
    expect(resolveLayout(false).enabled).toBe(false);
    const javascriptInput = { enabled: undefined, duration: undefined } as unknown as LayoutOptions;
    expect(resolveLayout(javascriptInput)).toMatchObject({ enabled: true, duration: 300 });
  });

  it('keeps background preparation disabled unless explicitly enabled', () => {
    expect(resolvePreparation(undefined).enabled).toBe(false);
    expect(resolvePreparation(true)).toMatchObject({ enabled: true, strategy: 'visible-idle', concurrency: 1 });
    expect(resolvePreparation({ strategy: 'idle', concurrency: 20, cachePixelBudget: -1 })).toMatchObject({
      enabled: true,
      strategy: 'idle',
      concurrency: 8,
      cachePixelBudget: 0,
    });
  });
});
