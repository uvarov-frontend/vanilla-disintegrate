export type DisintegrateTarget = HTMLElement | string;

export type SnapshotCapture = (element: HTMLElement) => Promise<HTMLCanvasElement>;

export type DisintegrationOrigin = 'left' | 'right' | 'random';

export interface ParticleOptions {
  /** Number of transparent canvas layers used by the effect. */
  frames?: number;
  /** Number of layers each non-transparent pixel is copied into. */
  repetitions?: number;
  /** Duration of each particle layer in milliseconds. */
  duration?: number;
  /** Delay spread between the first and last layer in milliseconds. */
  stagger?: number;
  /** Horizontal movement range in CSS pixels. */
  horizontalDrift?: number;
  /** Minimum and maximum upward movement in CSS pixels. */
  rise?: readonly [number, number];
  /** Maximum clockwise/counter-clockwise rotation in degrees. */
  rotation?: number;
  /** Final scale of each layer. */
  endScale?: number;
  /** Direction from which the element starts disintegrating. */
  origin?: DisintegrationOrigin;
  /** Web Animations easing value. */
  easing?: string;
}

export type LayoutSiblingResolver = (element: HTMLElement, container: HTMLElement) => HTMLElement[];

export interface LayoutOptions {
  /** Animate surrounding content into its final position. */
  enabled?: boolean;
  /** Layout animation duration in milliseconds. */
  duration?: number;
  /** Web Animations easing value. */
  easing?: string;
  /** Resolve the layout container. Defaults to the element's parent. */
  container?: HTMLElement | ((element: HTMLElement) => HTMLElement | null);
  /** Select which siblings should be animated. */
  siblings?: 'following' | 'all' | LayoutSiblingResolver;
  /** Animate the layout container height. */
  animateContainer?: boolean;
}

export interface PreparationOptions {
  /** Enable idle snapshot preparation for registered elements. */
  enabled?: boolean;
  /** IntersectionObserver root. Defaults to the viewport. */
  root?: Element | Document | null;
  /** Extra viewport area in CSS pixels that should be prepared. */
  margin?: number;
  /** Maximum requestIdleCallback wait in milliseconds. */
  idleTimeout?: number;
  /** Timer delay used when requestIdleCallback is unavailable. */
  fallbackDelay?: number;
  /** Wait after scrolling before capturing in the background. */
  scrollSettle?: number;
  /** Maximum wait for finite animations before capturing. */
  animationSettle?: number;
  /** Rebuild prepared snapshots when relevant DOM content changes. */
  observeMutations?: boolean;
}

export type SoundSource = string | URL | ArrayBuffer | AudioBuffer;

export interface SoundOptions {
  src: SoundSource;
  /** Linear Web Audio gain between 0 and 1. */
  gain?: number;
  /** Playback duration in seconds. Defaults to particle duration + stagger. */
  duration?: number;
  /** Fade-out duration in seconds. */
  fadeDuration?: number;
}

export interface DisintegrationContext {
  element: HTMLElement;
  overlay: HTMLElement | null;
}

export interface EffectCallbacks {
  /** Runs synchronously when disintegrate() is requested. Useful for haptics. */
  onTrigger?: (context: DisintegrationContext) => void;
  /** Runs when the first particle animation and optional sound start. */
  onStart?: (context: DisintegrationContext) => void;
  /** Runs after particle and layout animations finish. */
  onComplete?: (context: DisintegrationContext) => void;
  /** Receives recoverable capture, audio, and callback errors. */
  onError?: (error: unknown, context: DisintegrationContext) => void;
}

export interface CoreDisintegratorOptions extends EffectCallbacks {
  capture: SnapshotCapture;
  particles?: ParticleOptions;
  layout?: boolean | LayoutOptions;
  preparation?: boolean | PreparationOptions;
  sound?: false | SoundOptions;
  /** Disable visual effects when prefers-reduced-motion is enabled. */
  respectReducedMotion?: boolean;
  /** Parent for the fixed particle overlay. Defaults to document.body. */
  overlayRoot?: HTMLElement | (() => HTMLElement);
  /** Particle overlay z-index. */
  zIndex?: number;
  /** Injectable random generator, primarily useful for deterministic tests. */
  random?: () => number;
}

export interface DisintegrateOptions extends EffectCallbacks {
  /** Override layout behavior for this operation. */
  layout?: boolean | LayoutOptions;
  /** Enable or disable the configured sound for this operation. */
  sound?: boolean;
}

export type DisintegrationStatus = 'running' | 'skipped';

export interface DisintegrationHandle {
  readonly element: HTMLElement;
  readonly status: DisintegrationStatus;
  readonly particlesFinished: Promise<void>;
  readonly layoutFinished: Promise<void>;
  readonly finished: Promise<void>;
  /** Cancel the visual effect and leave the element hidden. */
  cancel: () => void;
  /** Cancel the effect and restore the original element styles. */
  restore: () => void;
}
