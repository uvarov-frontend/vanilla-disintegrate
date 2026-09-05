import {
  particlePresets,
  createParticleEffect,
  type ParticleCurve,
  type ParticleRelease,
  type BuiltInSound,
  type BuiltInPreset,
  type ParticlePreset,
  type ParticleOptions,
  type SoundOptions,
} from '../../../src/snapdom';
import type { StoredPlaygroundAudio } from './playground-audio-storage';

export interface PlaygroundState {
  particleSize: number;
  alphaThreshold: number;
  curve: ParticleCurve;
  release: ParticleRelease;
  releaseRandomness: number;
  duration: number;
  stagger: number;
  fadeStart: number;
  layoutRelease: number;
  horizontalDrift: number;
  horizontalMin: number;
  horizontalMax: number;
  verticalMin: number;
  verticalMax: number;
  convergence: number;
  swirl: number;
  waveTurns: number;
  endScale: number;
  rotationMin: number;
  rotationMax: number;
  soundEnabled: boolean;
  soundSource: PlaygroundSoundSource;
  soundReverse: boolean;
  soundVolume: number;
  soundPlaybackRate: number;
  soundDelay: number;
  soundFadeDuration: number;
}

export type PlaygroundOperation = 'remove' | 'restore';

export type PlaygroundCardWidth = 'narrow' | 'wide';

export type PlaygroundCustomSounds = readonly StoredPlaygroundAudio[];

/** A bundled name, or `custom:<id>` pointing at an entry in the browser's audio store. */
export type PlaygroundSoundSource = BuiltInSound | `custom:${string}`;

export function customSoundId(source: PlaygroundSoundSource) {
  return source.startsWith('custom:') ? source.slice('custom:'.length) : null;
}

export function findCustomSound(source: PlaygroundSoundSource, sounds: PlaygroundCustomSounds) {
  const id = customSoundId(source);
  return id === null ? null : (sounds.find((sound) => sound.id === id) ?? null);
}

export interface PlaygroundConfiguration {
  remove: PlaygroundState;
  restore: PlaygroundState;
}

export interface PlaygroundUndoSnapshot {
  configuration: PlaygroundConfiguration;
  operation: PlaygroundOperation;
  cardWidth: PlaygroundCardWidth;
}

export function cloneConfiguration(configuration: PlaygroundConfiguration): PlaygroundConfiguration {
  return {
    remove: { ...configuration.remove },
    restore: { ...configuration.restore },
  };
}

export type NumericKey = Exclude<
  keyof PlaygroundState,
  'curve' | 'release' | 'soundEnabled' | 'soundSource' | 'soundReverse'
>;

export interface RangeDefinition {
  readonly key: NumericKey;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly unit: string;
  readonly description: string;
}

export const curves: readonly ParticleCurve[] = ['settle', 'float', 'burst', 'drift'];

export const releases: readonly ParticleRelease[] = ['left', 'right', 'top', 'bottom', 'center', 'edges', 'random'];

export const presetKeys = Object.keys(particlePresets) as BuiltInPreset[];

export const builtInSoundKeys: readonly BuiltInSound[] = ['dust', 'scatter', 'vapor', 'wind'];

/** Used whenever a chosen custom file is not in this browser's store. */
export const FALLBACK_SOUND: BuiltInSound = 'dust';

export const soundNumericKeys: readonly NumericKey[] = [
  'soundVolume',
  'soundPlaybackRate',
  'soundDelay',
  'soundFadeDuration',
];

export function stateFromPreset(
  preset: ParticlePreset,
  operation: PlaygroundOperation,
  soundSource: BuiltInSound = 'dust',
): PlaygroundState {
  return {
    particleSize: preset.particleSize === 'auto' ? 0 : preset.particleSize,
    alphaThreshold: preset.alphaThreshold,
    curve: preset.curve,
    release: preset.release,
    releaseRandomness: preset.releaseRandomness,
    duration: preset.duration,
    stagger: preset.stagger,
    fadeStart: preset.fadeStart,
    layoutRelease: preset.layoutRelease,
    horizontalDrift: preset.horizontalDrift,
    horizontalMin: preset.horizontalTravel[0],
    horizontalMax: preset.horizontalTravel[1],
    verticalMin: preset.verticalTravel[0],
    verticalMax: preset.verticalTravel[1],
    convergence: preset.convergence,
    swirl: preset.swirl,
    waveTurns: preset.waveTurns,
    endScale: preset.endScale,
    rotationMin: preset.rotation[0],
    rotationMax: preset.rotation[1],
    soundEnabled: true,
    soundSource,
    soundReverse: operation === 'restore',
    soundVolume: 0.32,
    soundPlaybackRate: 1,
    soundDelay: 0,
    soundFadeDuration: 0.18,
  };
}

export function stateFromBuiltInPreset(preset: BuiltInPreset, operation: PlaygroundOperation): PlaygroundState {
  return stateFromPreset(particlePresets[preset], operation, preset);
}

export function particleOptions(state: PlaygroundState): ParticleOptions {
  return {
    particleSize: state.particleSize === 0 ? 'auto' : state.particleSize,
    alphaThreshold: state.alphaThreshold,
    curve: state.curve,
    release: state.release,
    releaseRandomness: state.releaseRandomness,
    duration: state.duration,
    stagger: state.stagger,
    fadeStart: state.fadeStart,
    layoutRelease: state.layoutRelease,
    horizontalDrift: state.horizontalDrift,
    horizontalTravel: [state.horizontalMin, state.horizontalMax],
    verticalTravel: [state.verticalMin, state.verticalMax],
    convergence: state.convergence,
    swirl: state.swirl,
    waveTurns: state.waveTurns,
    endScale: state.endScale,
    rotation: [state.rotationMin, state.rotationMax],
  };
}

export function matchingParticlePreset(state: PlaygroundState): BuiltInPreset | null {
  return (
    presetKeys.find((preset) => {
      const candidate = particlePresets[preset];
      return (
        state.particleSize === (candidate.particleSize === 'auto' ? 0 : candidate.particleSize) &&
        state.alphaThreshold === candidate.alphaThreshold &&
        state.curve === candidate.curve &&
        state.release === candidate.release &&
        state.releaseRandomness === candidate.releaseRandomness &&
        state.duration === candidate.duration &&
        state.stagger === candidate.stagger &&
        state.fadeStart === candidate.fadeStart &&
        state.layoutRelease === candidate.layoutRelease &&
        state.horizontalDrift === candidate.horizontalDrift &&
        state.horizontalMin === candidate.horizontalTravel[0] &&
        state.horizontalMax === candidate.horizontalTravel[1] &&
        state.verticalMin === candidate.verticalTravel[0] &&
        state.verticalMax === candidate.verticalTravel[1] &&
        state.convergence === candidate.convergence &&
        state.swirl === candidate.swirl &&
        state.waveTurns === candidate.waveTurns &&
        state.endScale === candidate.endScale &&
        state.rotationMin === candidate.rotation[0] &&
        state.rotationMax === candidate.rotation[1]
      );
    }) ?? null
  );
}

/**
 * True when a phase is exactly what a preset button produces, particles and sound
 * alike. Undo has nothing to offer for such a state: the same preset button puts
 * it back in one click, so only hand-tuned values are worth keeping a step for.
 */
export function isUntouchedPresetState(state: PlaygroundState, operation: PlaygroundOperation) {
  const preset = matchingParticlePreset(state);
  return preset !== null && state.soundEnabled && usesDefaultPresetSound(state, operation, preset);
}

export function matchingConfigurationPreset(configuration: PlaygroundConfiguration): BuiltInPreset | null {
  const removePreset = matchingParticlePreset(configuration.remove);
  return removePreset !== null && matchingParticlePreset(configuration.restore) === removePreset ? removePreset : null;
}

export function configuredSound(state: PlaygroundState, customSounds: PlaygroundCustomSounds): SoundOptions | null {
  if (!state.soundEnabled) return null;
  const custom = findCustomSound(state.soundSource, customSounds);
  const src = customSoundId(state.soundSource) === null ? state.soundSource : custom?.blob;
  if (src === undefined) return null;
  return {
    src,
    reverse: state.soundReverse,
    volume: state.soundVolume,
    playbackRate: state.soundPlaybackRate,
    delay: state.soundDelay,
    fadeDuration: state.soundFadeDuration,
  };
}

export function playgroundEffect(configuration: PlaygroundConfiguration) {
  return createParticleEffect({
    remove: particleOptions(configuration.remove),
    restore: particleOptions(configuration.restore),
  });
}

export function usesDefaultPresetSound(state: PlaygroundState, operation: PlaygroundOperation, preset: BuiltInPreset) {
  return (
    state.soundSource === preset &&
    state.soundReverse === (operation === 'restore') &&
    state.soundVolume === 0.32 &&
    state.soundPlaybackRate === 1 &&
    state.soundDelay === 0 &&
    state.soundFadeDuration === 0.18
  );
}

export function configurationFromPreset(preset: BuiltInPreset): PlaygroundConfiguration {
  return {
    remove: stateFromBuiltInPreset(preset, 'remove'),
    restore: stateFromBuiltInPreset(preset, 'restore'),
  };
}

export function editableRangeValue(range: RangeDefinition, value: number) {
  return range.key === 'soundVolume' ? value * 100 : value;
}

export function formatEditableRangeValue(range: RangeDefinition, value: number) {
  const scale = range.key === 'soundVolume' ? 100 : 1;
  const step = (range.step * scale).toFixed(10).replace(/0+$/, '').replace(/\.$/, '');
  const fractionDigits = step.split('.')[1]?.length ?? 0;
  return editableRangeValue(range, value).toFixed(fractionDigits);
}

export function stateRangeValue(range: RangeDefinition, value: number) {
  return range.key === 'soundVolume' ? value / 100 : value;
}
