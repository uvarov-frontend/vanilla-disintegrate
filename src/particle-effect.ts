import { defineEffect } from './effects';
import { createParticleAnimation, createParticleRestoreAnimation } from './particle-renderer';
import type { EffectDefinition, ParticleOptions, SoundDefinition } from './types';

/** Optional sounds paired with a custom particle effect. */
export interface ParticleEffectSounds {
  readonly remove?: SoundDefinition | null;
  readonly restore?: SoundDefinition | null;
}

/** Creates a paired remove/restore effect from one particle configuration. */
export function createParticleEffect(
  options: ParticleOptions = {},
  sounds: ParticleEffectSounds = {},
): EffectDefinition {
  return defineEffect({
    remove: {
      animate: createParticleAnimation(options),
      sound: sounds.remove ?? null,
    },
    restore: {
      animate: createParticleRestoreAnimation(options),
      sound: sounds.restore ?? null,
    },
  });
}
