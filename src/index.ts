import { Disintegrator as CoreDisintegrator } from './disintegrator';
import { builtInEffects } from './presets';
import type { DisintegratorOptions } from './types';

/** Disintegrator configured with the four built-in particle effects. */
export class Disintegrator extends CoreDisintegrator {
  constructor(options: DisintegratorOptions = {}) {
    super({
      ...options,
      effect: options.effect ?? 'dust',
      effects: { ...builtInEffects, ...options.effects },
    });
  }
}

export { defineEffect } from './effects';
export { createParticleAnimation, createParticleRestoreAnimation } from './particle-renderer';
export { builtInEffects } from './presets';
export type * from './types';

export default Disintegrator;
