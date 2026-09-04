import type {
  AudioPreparationOptions,
  AudioPreparationStrategy,
  LayoutOptions,
  ParticleOptions,
  ParticleRenderBudget,
  PreparationOptions,
  SoundPreparationSelection,
} from './types';

export interface ResolvedParticleOptions {
  readonly renderQuality: 'exact' | Readonly<ParticleRenderBudget>;
  readonly particleSize: 'auto' | number;
  readonly alphaThreshold: number;
  readonly curve: NonNullable<ParticleOptions['curve']>;
  readonly duration: number;
  readonly stagger: number;
  readonly horizontalDrift: number;
  readonly horizontalTravel: readonly [number, number];
  readonly verticalTravel: readonly [number, number];
  readonly convergence: number;
  readonly swirl: number;
  readonly endScale: number;
  readonly rotation: readonly [number, number];
  readonly release: NonNullable<ParticleOptions['release']>;
  readonly releaseRandomness: number;
  readonly fadeStart: number;
  readonly waveTurns: number;
  readonly layoutRelease: number;
}

const AUTO_PARTICLE_RENDER_BUDGET: Readonly<ParticleRenderBudget> = Object.freeze({
  maxSourcePixels: 2_000_000,
  maxSourceDimension: 2048,
  maxRenderPixels: 4_000_000,
});

export interface ResolvedLayoutOptions {
  readonly enabled: boolean;
  readonly duration: number;
  readonly easing: string;
  readonly container?: LayoutOptions['container'];
  readonly siblings: NonNullable<LayoutOptions['siblings']>;
  readonly animateContainer: boolean;
}

export interface ResolvedPreparationOptions {
  readonly enabled: boolean;
  readonly strategy: NonNullable<PreparationOptions['strategy']>;
  readonly shouldPrepare: NonNullable<PreparationOptions['shouldPrepare']>;
  readonly root: Element | Document | null;
  readonly rootMargin: string;
  readonly concurrency: number;
  readonly invalidateOnResize: boolean;
  readonly observeMutations: boolean;
  readonly idleTimeout: number;
  readonly fallbackDelay: number;
  readonly scrollSettle: number;
  readonly animationSettle: number;
  readonly cachePixelBudget: number;
}

export interface ResolvedAudioPreparationOptions {
  readonly enabled: boolean;
  readonly strategy: AudioPreparationStrategy;
  readonly sounds?: SoundPreparationSelection;
  readonly cacheByteBudget: number;
}

export const DEFAULT_PARTICLES: ResolvedParticleOptions = {
  renderQuality: AUTO_PARTICLE_RENDER_BUDGET,
  particleSize: 'auto',
  alphaThreshold: 0,
  curve: 'settle',
  duration: 720,
  stagger: 180,
  horizontalDrift: 42,
  horizontalTravel: [0, 0],
  verticalTravel: [-100, -45],
  convergence: 0,
  swirl: 0,
  endScale: 0.92,
  rotation: [0, 0],
  release: 'left',
  releaseRandomness: 0.22,
  fadeStart: 0.3,
  waveTurns: 1,
  layoutRelease: 0.6,
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
  strategy: 'visible-idle',
  shouldPrepare: () => true,
  root: null,
  rootMargin: '300px 0px',
  concurrency: 1,
  invalidateOnResize: true,
  observeMutations: false,
  idleTimeout: 750,
  fallbackDelay: 250,
  scrollSettle: 120,
  animationSettle: 400,
  cachePixelBudget: 8_000_000,
};

export const DEFAULT_AUDIO_PREPARATION: ResolvedAudioPreparationOptions = {
  enabled: true,
  strategy: 'idle',
  cacheByteBudget: 8 * 1024 * 1024,
};

function finiteNumber(
  value: number | undefined,
  fallback: number,
  minimum = Number.NEGATIVE_INFINITY,
  maximum = Number.POSITIVE_INFINITY,
) {
  const normalized = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(maximum, Math.max(minimum, normalized));
}

function orderedRange(
  value: readonly [number, number] | undefined,
  fallback: readonly [number, number],
  minimum = Number.NEGATIVE_INFINITY,
): readonly [number, number] {
  const first = finiteNumber(value?.[0], fallback[0], minimum);
  const second = finiteNumber(value?.[1], fallback[1], minimum);
  return first <= second ? [first, second] : [second, first];
}

function positiveInteger(value: number | undefined, fallback: number) {
  return Math.max(1, Math.floor(finiteNumber(value, fallback, 1)));
}

function resolveRenderQuality(value: ParticleOptions['renderQuality']): ResolvedParticleOptions['renderQuality'] {
  if (value === 'exact') return value;
  const budget = typeof value === 'object' && value !== null ? value : AUTO_PARTICLE_RENDER_BUDGET;
  return {
    maxSourcePixels: positiveInteger(budget.maxSourcePixels, AUTO_PARTICLE_RENDER_BUDGET.maxSourcePixels),
    maxSourceDimension: positiveInteger(budget.maxSourceDimension, AUTO_PARTICLE_RENDER_BUDGET.maxSourceDimension),
    maxRenderPixels: positiveInteger(budget.maxRenderPixels, AUTO_PARTICLE_RENDER_BUDGET.maxRenderPixels),
  };
}

const CURVE_DETAILS: Readonly<Record<NonNullable<ParticleOptions['curve']>, { fadeStart: number; waveTurns: number }>> =
  {
    settle: { fadeStart: 0.3, waveTurns: 1 },
    float: { fadeStart: 0.3, waveTurns: 1.6 },
    burst: { fadeStart: 0.12, waveTurns: 1 },
    drift: { fadeStart: 0.32, waveTurns: 1.25 },
  };

function resolveParticleSize(value: ParticleOptions['particleSize']): ResolvedParticleOptions['particleSize'] {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0.25, value) : 'auto';
}

export function resolveParticles(options: ParticleOptions = {}): ResolvedParticleOptions {
  const curve = options.curve ?? DEFAULT_PARTICLES.curve;
  const curveDetails = CURVE_DETAILS[curve];
  return {
    renderQuality: resolveRenderQuality(options.renderQuality),
    particleSize: resolveParticleSize(options.particleSize),
    alphaThreshold: finiteNumber(options.alphaThreshold, DEFAULT_PARTICLES.alphaThreshold, 0, 1),
    curve,
    duration: finiteNumber(options.duration, DEFAULT_PARTICLES.duration, 0),
    stagger: finiteNumber(options.stagger, DEFAULT_PARTICLES.stagger, 0),
    horizontalDrift: finiteNumber(options.horizontalDrift, DEFAULT_PARTICLES.horizontalDrift, 0),
    horizontalTravel: orderedRange(options.horizontalTravel, DEFAULT_PARTICLES.horizontalTravel),
    verticalTravel: orderedRange(options.verticalTravel, DEFAULT_PARTICLES.verticalTravel),
    convergence: finiteNumber(options.convergence, DEFAULT_PARTICLES.convergence, 0, 1),
    swirl: finiteNumber(options.swirl, DEFAULT_PARTICLES.swirl, 0),
    endScale: finiteNumber(options.endScale, DEFAULT_PARTICLES.endScale, 0),
    rotation: orderedRange(options.rotation, DEFAULT_PARTICLES.rotation),
    release: options.release ?? DEFAULT_PARTICLES.release,
    releaseRandomness: finiteNumber(options.releaseRandomness, DEFAULT_PARTICLES.releaseRandomness, 0, 1),
    fadeStart: finiteNumber(options.fadeStart, curveDetails.fadeStart, 0, 1),
    waveTurns: finiteNumber(options.waveTurns, curveDetails.waveTurns, 0),
    layoutRelease: finiteNumber(options.layoutRelease, DEFAULT_PARTICLES.layoutRelease, 0, 1),
  };
}

export function resolveLayout(options: boolean | LayoutOptions | undefined): ResolvedLayoutOptions {
  if (options === false) return { ...DEFAULT_LAYOUT, enabled: false };
  if (options === true || options === undefined) return { ...DEFAULT_LAYOUT };
  return {
    enabled: options.enabled ?? DEFAULT_LAYOUT.enabled,
    duration: finiteNumber(options.duration, DEFAULT_LAYOUT.duration, 0),
    easing: options.easing ?? DEFAULT_LAYOUT.easing,
    ...(options.container === undefined ? {} : { container: options.container }),
    siblings: options.siblings ?? DEFAULT_LAYOUT.siblings,
    animateContainer: options.animateContainer ?? DEFAULT_LAYOUT.animateContainer,
  };
}

export function resolvePreparation(options: boolean | PreparationOptions | undefined): ResolvedPreparationOptions {
  if (options === false) return { ...DEFAULT_PREPARATION, enabled: false };
  if (options === true || options === undefined) return { ...DEFAULT_PREPARATION };
  return {
    enabled: true,
    strategy: options.strategy ?? DEFAULT_PREPARATION.strategy,
    shouldPrepare: options.shouldPrepare ?? DEFAULT_PREPARATION.shouldPrepare,
    root: options.root ?? DEFAULT_PREPARATION.root,
    rootMargin: options.rootMargin ?? DEFAULT_PREPARATION.rootMargin,
    concurrency: Math.round(finiteNumber(options.concurrency, DEFAULT_PREPARATION.concurrency, 1, 8)),
    invalidateOnResize: options.invalidateOnResize ?? DEFAULT_PREPARATION.invalidateOnResize,
    observeMutations: options.observeMutations ?? DEFAULT_PREPARATION.observeMutations,
    idleTimeout: finiteNumber(options.idleTimeout, DEFAULT_PREPARATION.idleTimeout, 0),
    fallbackDelay: finiteNumber(options.fallbackDelay, DEFAULT_PREPARATION.fallbackDelay, 0),
    scrollSettle: finiteNumber(options.scrollSettle, DEFAULT_PREPARATION.scrollSettle, 0),
    animationSettle: finiteNumber(options.animationSettle, DEFAULT_PREPARATION.animationSettle, 0),
    cachePixelBudget: finiteNumber(options.cachePixelBudget, DEFAULT_PREPARATION.cachePixelBudget, 0),
  };
}

export function resolveAudioPreparation(
  options: false | AudioPreparationStrategy | AudioPreparationOptions | undefined,
): ResolvedAudioPreparationOptions {
  if (options === false) return { ...DEFAULT_AUDIO_PREPARATION, enabled: false };
  if (options === undefined) return { ...DEFAULT_AUDIO_PREPARATION };
  if (typeof options === 'string') return { ...DEFAULT_AUDIO_PREPARATION, strategy: options };
  return {
    enabled: true,
    strategy: options.strategy ?? DEFAULT_AUDIO_PREPARATION.strategy,
    ...(options.sounds === undefined ? {} : { sounds: options.sounds }),
    cacheByteBudget: finiteNumber(options.cacheByteBudget, DEFAULT_AUDIO_PREPARATION.cacheByteBudget, 0),
  };
}
