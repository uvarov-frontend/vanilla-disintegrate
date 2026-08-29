import christmasSoundUrl from './sounds/christmas-wind.mp3?url&no-inline';
import dustSoundUrl from './sounds/disintegrate.mp3?url&no-inline';

import { defineEffect } from './effects';
import { createParticleAnimation, createParticleRestoreAnimation } from './particle-renderer';
import type { BuiltInEffect, EffectDefinition, EffectSelection, ParticleOptions } from './types';

const particlePresets: Readonly<Record<BuiltInEffect, ParticleOptions>> = Object.freeze({
  dust: {},
  vapor: {
    motion: 'vapor',
    duration: 1180,
    stagger: 260,
    horizontalDrift: 24,
    horizontalTravel: [-12, 12],
    rise: [130, 230],
    swirl: 18,
    endScale: 1.25,
    origin: 'random',
  },
  scatter: {
    motion: 'scatter',
    duration: 760,
    stagger: 70,
    horizontalDrift: 90,
    horizontalTravel: [-180, 180],
    rise: [30, 160],
    swirl: 22,
    endScale: 0.55,
    origin: 'random',
  },
  wind: {
    motion: 'wind',
    duration: 2100,
    stagger: 0,
    horizontalDrift: 80,
    horizontalTravel: [220, 380],
    rise: [4, 28],
    swirl: 48,
    endScale: 0.82,
    origin: 'left',
  },
});

export const builtInEffects: Readonly<Record<BuiltInEffect, EffectDefinition>> = Object.freeze({
  dust: defineEffect({
    remove: {
      animate: createParticleAnimation(particlePresets.dust),
      sound: { src: dustSoundUrl },
    },
    restore: {
      animate: createParticleRestoreAnimation(particlePresets.dust),
      sound: null,
    },
  }),
  vapor: defineEffect({
    remove: {
      animate: createParticleAnimation(particlePresets.vapor),
      sound: null,
    },
    restore: {
      animate: createParticleRestoreAnimation(particlePresets.vapor),
      sound: null,
    },
  }),
  scatter: defineEffect({
    remove: {
      animate: createParticleAnimation(particlePresets.scatter),
      sound: null,
    },
    restore: {
      animate: createParticleRestoreAnimation(particlePresets.scatter),
      sound: null,
    },
  }),
  wind: defineEffect({
    remove: {
      animate: createParticleAnimation(particlePresets.wind),
      sound: { src: christmasSoundUrl, gain: 0.52 },
    },
    restore: {
      animate: createParticleRestoreAnimation(particlePresets.wind),
      sound: null,
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
