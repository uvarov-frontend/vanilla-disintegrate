import { builtInParticleEffects } from './presets';
import { definePreset } from './preset';
import type { BuiltInPreset, BuiltInSound, PresetDefinition } from './types';

function builtInPreset(effect: PresetDefinition['effect'], src: BuiltInSound): Readonly<PresetDefinition> {
  return definePreset({
    effect,
    sound: {
      remove: { src, volume: 0.32, fadeDuration: 0.18 },
      restore: { src, volume: 0.32, fadeDuration: 0.18, reverse: true },
    },
  });
}

/** Complete, immutable built-in visual-and-audio presets. */
export const builtInPresets: Readonly<Record<BuiltInPreset, Readonly<PresetDefinition>>> = Object.freeze({
  dust: builtInPreset(builtInParticleEffects.dust, 'dust'),
  scatter: builtInPreset(builtInParticleEffects.scatter, 'scatter'),
  vapor: builtInPreset(builtInParticleEffects.vapor, 'vapor'),
  wind: builtInPreset(builtInParticleEffects.wind, 'wind'),
});
