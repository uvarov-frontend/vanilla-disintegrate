import type {
  AudioPreparationOptions,
  AudioPreparationStrategy,
  LayoutOptions,
  ParticleOptions,
  PreparationOptions,
  SoundPreparationSelection,
} from './types';

export interface ResolvedParticleOptions {
  readonly curve: NonNullable<ParticleOptions['curve']>;
  readonly duration: number;
  readonly stagger: number;
  readonly horizontalDrift: number;
  readonly horizontalTravel: readonly [number, number];
  readonly verticalTravel: readonly [number, number];
  readonly convergence: number;
  readonly swirl: number;
  readonly endScale: number;
  readonly release: NonNullable<ParticleOptions['release']>;
}

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
  curve: 'settle',
  duration: 720,
  stagger: 180,
  horizontalDrift: 42,
  horizontalTravel: [0, 0],
  verticalTravel: [-100, -45],
  convergence: 0,
  swirl: 0,
  endScale: 0.92,
  release: 'left',
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

export function resolveParticles(options: ParticleOptions = {}): ResolvedParticleOptions {
  return {
    curve: options.curve ?? DEFAULT_PARTICLES.curve,
    duration: finiteNumber(options.duration, DEFAULT_PARTICLES.duration, 0),
    stagger: finiteNumber(options.stagger, DEFAULT_PARTICLES.stagger, 0),
    horizontalDrift: finiteNumber(options.horizontalDrift, DEFAULT_PARTICLES.horizontalDrift, 0),
    horizontalTravel: orderedRange(options.horizontalTravel, DEFAULT_PARTICLES.horizontalTravel),
    verticalTravel: orderedRange(options.verticalTravel, DEFAULT_PARTICLES.verticalTravel),
    convergence: finiteNumber(options.convergence, DEFAULT_PARTICLES.convergence, 0, 1),
    swirl: finiteNumber(options.swirl, DEFAULT_PARTICLES.swirl, 0),
    endScale: finiteNumber(options.endScale, DEFAULT_PARTICLES.endScale, 0),
    release: options.release ?? DEFAULT_PARTICLES.release,
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
