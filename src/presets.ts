import christmasSoundUrl from './sounds/christmas-wind.mp3?url&no-inline';
import dustSoundUrl from './sounds/dust.mp3?url&no-inline';
import scatterSoundUrl from './sounds/scatter.mp3?url&no-inline';
import vaporSoundUrl from './sounds/vapor.mp3?url&no-inline';

import { defineEffect } from './effects';
import { createParticleAnimation, createParticleRestoreAnimation } from './particle-renderer';
import type { BuiltInEffect, EffectDefinition, EffectSelection, ParticleOptions } from './types';

const particlePresets: Readonly<Record<BuiltInEffect, ParticleOptions>> = Object.freeze({
  dust: {},
  vapor: {
    motion: 'vapor',
    duration: 900,
    stagger: 130,
    horizontalDrift: 16,
    horizontalTravel: [-8, 8],
    rise: [130, 230],
    swirl: 18,
    endScale: 1.25,
  },
  scatter: {
    motion: 'scatter',
    duration: 1100,
    stagger: 70,
    horizontalDrift: 42,
    horizontalTravel: [-125, 125],
    rise: [50, 140],
    swirl: 8,
    endScale: 0.4,
    origin: 'left',
  },
  wind: {
    motion: 'wind',
    duration: 2075,
    stagger: 0,
    horizontalDrift: 80,
    horizontalTravel: [220, 380],
    rise: [4, 28],
    swirl: 48,
    endScale: 0.82,
    origin: 'left',
  },
});

/** The four built-in paired effects: `dust`, `vapor`, `scatter` and `wind`. */
export const builtInEffects: Readonly<Record<BuiltInEffect, EffectDefinition>> = Object.freeze({
  dust: defineEffect({
    remove: {
      animate: createParticleAnimation(particlePresets.dust),
      sound: { src: dustSoundUrl },
    },
    restore: {
      animate: createParticleRestoreAnimation(particlePresets.dust),
      sound: { src: dustSoundUrl, reverse: true },
    },
  }),
  vapor: defineEffect({
    remove: {
      animate: createParticleAnimation(particlePresets.vapor),
      sound: { src: vaporSoundUrl },
    },
    restore: {
      animate: createParticleRestoreAnimation(particlePresets.vapor),
      sound: { src: vaporSoundUrl, reverse: true },
    },
  }),
  scatter: defineEffect({
    remove: {
      animate: createParticleAnimation(particlePresets.scatter),
      sound: { src: scatterSoundUrl },
    },
    restore: {
      animate: createParticleRestoreAnimation(particlePresets.scatter),
      sound: { src: scatterSoundUrl, reverse: true },
    },
  }),
  wind: defineEffect({
    remove: {
      animate: createParticleAnimation(particlePresets.wind),
      sound: { src: christmasSoundUrl },
    },
    restore: {
      animate: createParticleRestoreAnimation(particlePresets.wind),
      sound: { src: christmasSoundUrl, reverse: true },
    },
  }),
});

export function resolveEffect(
  selection: EffectSelection | undefined,
  customEffects: Readonly<Record<string, EffectDefinition>> = {},
) {
  if (typeof selection === 'object') return selection;
  const name = selection ?? 'dust';
  const effect = customEffects[name] ?? builtInEffects[name as BuiltInEffect];
  if (effect === undefined) throw new TypeError(`Unknown disintegration effect: ${name}`);
  return effect;
}
