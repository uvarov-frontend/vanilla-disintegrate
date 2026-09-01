import { defineEffect } from './effects';
import { createParticleAnimation, createParticleRestoreAnimation } from './particle-renderer';
import type { EffectDefinition, ParticleOptions } from './types';

/** Independent particle configurations for removal and restoration. */
export interface ParticleEffectOptions {
  readonly remove?: ParticleOptions;
  /** Falls back to `remove` when omitted. */
  readonly restore?: ParticleOptions;
}

/** Creates a visual effect with independently configurable remove and restore motion. */
export function createParticleEffect(options: ParticleEffectOptions = {}): EffectDefinition {
  const remove = options.remove ?? {};
  const restore = options.restore ?? remove;
  return defineEffect({
    remove: {
      animate: createParticleAnimation(remove),
    },
    restore: {
      animate: createParticleRestoreAnimation(restore),
    },
  });
}
