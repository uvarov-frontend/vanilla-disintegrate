import { defineEffect } from './effects';
import { createParticleAnimation, createParticleRestoreAnimation } from './particle-renderer';
import type { EffectDefinition, ParticleOptions, SoundDefinition } from './types';

/** Independent particle configurations for removal and restoration. */
export interface ParticleEffectOptions {
  readonly remove?: ParticleOptions;
  /** Falls back to `remove` when omitted. */
  readonly restore?: ParticleOptions;
}

/** Optional sounds paired with a custom particle effect. */
export interface ParticleEffectSounds {
  readonly remove?: SoundDefinition | null;
  readonly restore?: SoundDefinition | null;
}

/** Creates a paired effect with independently configurable remove and restore motion. */
export function createParticleEffect(
  options: ParticleEffectOptions = {},
  sounds: ParticleEffectSounds = {},
): EffectDefinition {
  const remove = options.remove ?? {};
  const restore = options.restore ?? remove;
  return defineEffect({
    remove: {
      animate: createParticleAnimation(remove),
      sound: sounds.remove ?? null,
    },
    restore: {
      animate: createParticleRestoreAnimation(restore),
      sound: sounds.restore ?? null,
    },
  });
}
