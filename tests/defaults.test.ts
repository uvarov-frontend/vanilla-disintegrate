import { describe, expect, it } from 'vitest';

import { resolveLayout, resolveParticles, resolvePreparation } from '../src/defaults';

describe('option resolvers', () => {
  it('normalizes particle values', () => {
    const particles = resolveParticles({ frames: 2.6, repetitions: 0, duration: -1, rise: [80, 20] });

    expect(particles.frames).toBe(3);
    expect(particles.repetitions).toBe(1);
    expect(particles.duration).toBe(0);
    expect(particles.rise).toEqual([20, 80]);
  });

  it('can disable layout and idle preparation independently', () => {
    expect(resolveLayout(false).enabled).toBe(false);
    expect(resolvePreparation(false).enabled).toBe(false);
  });
});
