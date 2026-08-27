import type { LayoutOptions, ParticleOptions, PreparationOptions } from './types';

export interface ResolvedParticleOptions {
  frames: number;
  repetitions: number;
  duration: number;
  stagger: number;
  horizontalDrift: number;
  rise: readonly [number, number];
  rotation: number;
  endScale: number;
  origin: NonNullable<ParticleOptions['origin']>;
  easing: string;
}

export interface ResolvedLayoutOptions {
  enabled: boolean;
  duration: number;
  easing: string;
  container?: LayoutOptions['container'];
  siblings: NonNullable<LayoutOptions['siblings']>;
  animateContainer: boolean;
}

export interface ResolvedPreparationOptions {
  enabled: boolean;
  root: Element | Document | null;
  margin: number;
  idleTimeout: number;
  fallbackDelay: number;
  scrollSettle: number;
  animationSettle: number;
  observeMutations: boolean;
}

export const DEFAULT_PARTICLES: ResolvedParticleOptions = {
  frames: 32,
  repetitions: 2,
  duration: 720,
  stagger: 180,
  horizontalDrift: 42,
  rise: [45, 100],
  rotation: 14,
  endScale: 0.92,
  origin: 'left',
  easing: 'ease-out',
};

export const DEFAULT_LAYOUT: ResolvedLayoutOptions = {
  enabled: true,
  duration: 300,
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
  siblings: 'following',
  animateContainer: true,
};

export const DEFAULT_PREPARATION: ResolvedPreparationOptions = {
  enabled: true,
  root: null,
  margin: 200,
  idleTimeout: 750,
  fallbackDelay: 250,
  scrollSettle: 120,
  animationSettle: 400,
  observeMutations: true,
};

function finiteNumber(
  value: number | undefined,
  fallback: number,
  minimum = Number.NEGATIVE_INFINITY,
  maximum = Number.POSITIVE_INFINITY,
) {
  const finiteValue = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(maximum, Math.max(minimum, finiteValue));
}

export function resolveParticles(options?: ParticleOptions): ResolvedParticleOptions {
  const rise = options?.rise ?? DEFAULT_PARTICLES.rise;
  return {
    ...DEFAULT_PARTICLES,
    ...options,
    frames: Math.round(finiteNumber(options?.frames, DEFAULT_PARTICLES.frames, 1, 128)),
    repetitions: Math.round(finiteNumber(options?.repetitions, DEFAULT_PARTICLES.repetitions, 1, 8)),
    duration: finiteNumber(options?.duration, DEFAULT_PARTICLES.duration, 0),
    stagger: finiteNumber(options?.stagger, DEFAULT_PARTICLES.stagger, 0),
    horizontalDrift: finiteNumber(options?.horizontalDrift, DEFAULT_PARTICLES.horizontalDrift, 0),
    rise: [
      finiteNumber(Math.min(...rise), DEFAULT_PARTICLES.rise[0], 0),
      finiteNumber(Math.max(...rise), DEFAULT_PARTICLES.rise[1], 0),
    ],
    rotation: finiteNumber(options?.rotation, DEFAULT_PARTICLES.rotation, 0),
    endScale: finiteNumber(options?.endScale, DEFAULT_PARTICLES.endScale, 0),
  };
}

export function resolveLayout(options?: boolean | LayoutOptions): ResolvedLayoutOptions {
  if (options === false) return { ...DEFAULT_LAYOUT, enabled: false };
  if (options === true || options === undefined) return { ...DEFAULT_LAYOUT };
  return {
    ...DEFAULT_LAYOUT,
    ...options,
    duration: finiteNumber(options.duration, DEFAULT_LAYOUT.duration, 0),
  };
}

export function resolvePreparation(options?: boolean | PreparationOptions): ResolvedPreparationOptions {
  if (options === false) return { ...DEFAULT_PREPARATION, enabled: false };
  if (options === true || options === undefined) return { ...DEFAULT_PREPARATION };
  return {
    ...DEFAULT_PREPARATION,
    ...options,
    margin: finiteNumber(options.margin, DEFAULT_PREPARATION.margin, 0),
    idleTimeout: finiteNumber(options.idleTimeout, DEFAULT_PREPARATION.idleTimeout, 0),
    fallbackDelay: finiteNumber(options.fallbackDelay, DEFAULT_PREPARATION.fallbackDelay, 0),
    scrollSettle: finiteNumber(options.scrollSettle, DEFAULT_PREPARATION.scrollSettle, 0),
    animationSettle: finiteNumber(options.animationSettle, DEFAULT_PREPARATION.animationSettle, 0),
  };
}
