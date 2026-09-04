import { builtInPresets } from './built-in-presets';
import { Disintegrator as CoreDisintegrator } from './disintegrator';
import { bindSoundSources } from './sound-sources';
import { builtInSounds } from './sounds';
import type { DisintegratorOptions } from './types';

/** Disintegrator configured with the four complete built-in visual-and-audio presets. */
export class Disintegrator extends CoreDisintegrator {
  constructor(options: DisintegratorOptions) {
    if (options === undefined || options === null || typeof options !== 'object') {
      super(options);
      return;
    }
    super(
      bindSoundSources(
        {
          ...options,
          presets: { ...builtInPresets, ...options.presets },
        },
        builtInSounds,
      ),
    );
  }
}

export { defineEffect } from './effects';
export { definePreset } from './preset';
export {
  configureParticleContexts,
  createParticleAnimation,
  createParticleRestoreAnimation,
} from './particle-renderer';
export { createParticleEffect, type ParticleEffectOptions } from './particle-effect';
export { builtInPresets } from './built-in-presets';
export { particlePresets } from './presets';
export { builtInSounds } from './sounds';
export type * from './types';

export default Disintegrator;
