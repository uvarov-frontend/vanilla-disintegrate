import christmasSoundUrl from './sounds/christmas-wind.mp3?url&no-inline';
import dustSoundUrl from './sounds/dust.mp3?url&no-inline';
import scatterSoundUrl from './sounds/scatter.mp3?url&no-inline';
import vaporSoundUrl from './sounds/vapor.mp3?url&no-inline';

import { createParticleEffect } from './particle-effect';
import type { BuiltInEffect, EffectDefinition, ParticlePreset } from './types';

function freezeRange(range: readonly [number, number]): readonly [number, number] {
  const copy: [number, number] = [range[0], range[1]];
  return Object.freeze(copy);
}

function defineParticlePreset(options: ParticlePreset): Readonly<ParticlePreset> {
  return Object.freeze({
    ...options,
    horizontalTravel: freezeRange(options.horizontalTravel),
    verticalTravel: freezeRange(options.verticalTravel),
  });
}

/** Deeply frozen particle configurations used by the four built-in effects. */
export const particlePresets: Readonly<Record<BuiltInEffect, Readonly<ParticlePreset>>> = Object.freeze({
  dust: defineParticlePreset({
    curve: 'settle',
    duration: 1400,
    stagger: 260,
    horizontalDrift: 70,
    horizontalTravel: [40, 190],
    verticalTravel: [-210, -30],
    convergence: 0,
    swirl: 34,
    endScale: 0.7,
    release: 'left',
  }),
  vapor: defineParticlePreset({
    curve: 'float',
    duration: 900,
    stagger: 130,
    horizontalDrift: 16,
    horizontalTravel: [-8, 8],
    verticalTravel: [-230, -130],
    convergence: 1,
    swirl: 18,
    endScale: 1.25,
    release: 'top',
  }),
  scatter: defineParticlePreset({
    curve: 'burst',
    duration: 1100,
    stagger: 70,
    horizontalDrift: 42,
    horizontalTravel: [-125, 125],
    verticalTravel: [-105, 36],
    convergence: 0,
    swirl: 8,
    endScale: 0.4,
    release: 'left',
  }),
  wind: defineParticlePreset({
    curve: 'drift',
    duration: 2075,
    stagger: 0,
    horizontalDrift: 80,
    horizontalTravel: [220, 380],
    verticalTravel: [-28, -4],
    convergence: 0,
    swirl: 48,
    endScale: 0.82,
    release: 'left',
  }),
});

/** The four built-in paired effects: `dust`, `vapor`, `scatter` and `wind`. */
export const builtInEffects: Readonly<Record<BuiltInEffect, EffectDefinition>> = Object.freeze({
  dust: createParticleEffect(particlePresets.dust, {
    remove: { src: dustSoundUrl },
    restore: { src: dustSoundUrl, reverse: true },
  }),
  vapor: createParticleEffect(particlePresets.vapor, {
    remove: { src: vaporSoundUrl },
    restore: { src: vaporSoundUrl, reverse: true },
  }),
  scatter: createParticleEffect(particlePresets.scatter, {
    remove: { src: scatterSoundUrl },
    restore: { src: scatterSoundUrl, reverse: true },
  }),
  wind: createParticleEffect(particlePresets.wind, {
    remove: { src: christmasSoundUrl },
    restore: { src: christmasSoundUrl, reverse: true },
  }),
});
