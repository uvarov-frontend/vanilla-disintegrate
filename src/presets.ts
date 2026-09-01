import { createParticleEffect } from './particle-effect';
import type { BuiltInPreset, EffectDefinition, ParticlePreset } from './types';

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
export const particlePresets: Readonly<Record<BuiltInPreset, Readonly<ParticlePreset>>> = Object.freeze({
  dust: defineParticlePreset({
    curve: 'settle',
    duration: 850,
    stagger: 130,
    horizontalDrift: 70,
    horizontalTravel: [40, 190],
    verticalTravel: [-210, -30],
    convergence: 0,
    swirl: 34,
    endScale: 0.55,
    release: 'left',
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
  vapor: defineParticlePreset({
    curve: 'float',
    duration: 750,
    stagger: 80,
    horizontalDrift: 80,
    horizontalTravel: [-10, 10],
    verticalTravel: [-255, -130],
    convergence: 0.8,
    swirl: 5,
    endScale: 0.6,
    release: 'top',
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

/** Visual implementations used internally by the complete built-in presets. */
export const builtInParticleEffects: Readonly<Record<BuiltInPreset, EffectDefinition>> = Object.freeze({
  dust: createParticleEffect({ remove: particlePresets.dust }),
  scatter: createParticleEffect({ remove: particlePresets.scatter }),
  vapor: createParticleEffect({ remove: particlePresets.vapor }),
  wind: createParticleEffect({ remove: particlePresets.wind }),
});
