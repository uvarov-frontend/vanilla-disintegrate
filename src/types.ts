export type EffectTarget = HTMLElement | string;
export type EffectTargets = EffectTarget | Iterable<HTMLElement>;

export type EffectOperationKind = 'remove' | 'restore';
export type BuiltInEffect = 'dust' | 'vapor' | 'scatter' | 'wind';
export type DisintegrationOrigin = 'left' | 'right' | 'random';
export type ParticleMotion = 'drift' | 'vapor' | 'scatter' | 'wind';

declare const removalIdBrand: unique symbol;
export type RemovalId = string & { readonly [removalIdBrand]: true };

export interface SnapshotCaptureContext {
  readonly operation: EffectOperationKind | 'prepare';
  readonly signal: AbortSignal;
  /** The computed opacity the captured root had before a restore operation concealed the live element. */
  readonly restoreRootOpacity?: string;
}

export type SnapshotCapture = (
  element: HTMLElement,
  context: SnapshotCaptureContext,
) => HTMLCanvasElement | Promise<HTMLCanvasElement>;

export interface ParticleOptions {
  readonly motion?: ParticleMotion;
  readonly duration?: number;
  readonly stagger?: number;
  readonly horizontalDrift?: number;
  readonly horizontalTravel?: readonly [number, number];
  readonly rise?: readonly [number, number];
  readonly swirl?: number;
  readonly endScale?: number;
  readonly origin?: DisintegrationOrigin;
}

export interface AnimationPlayback {
  readonly finished: PromiseLike<unknown>;
  readonly element?: HTMLElement;
  readonly duration?: number;
  readonly layoutDelay?: number;
  cancel?(): void;
  dispose?(): void;
}

export type AnimationResult = Animation | PromiseLike<unknown> | AnimationPlayback | null;

export interface AnimationContext {
  readonly operation: EffectOperationKind;
  readonly element: HTMLElement;
  readonly layer: HTMLElement;
  /** A lazily-created full-size canvas containing the captured element. */
  readonly visual: HTMLCanvasElement | null;
  readonly snapshot: HTMLCanvasElement | null;
  readonly bounds: DOMRectReadOnly;
  readonly signal: AbortSignal;
  readonly reducedMotion: boolean;
  readonly random: () => number;
  addCleanup(callback: () => void): void;
}

export type AnimationFactory = (context: AnimationContext) => AnimationResult;

export type SoundSource = string | URL | ArrayBuffer | AudioBuffer;

export interface SoundOptions {
  readonly src: SoundSource;
  readonly gain?: number;
  readonly duration?: number;
  readonly fadeDuration?: number;
  readonly delay?: number;
  readonly playbackRate?: number;
}

export interface SoundContext {
  readonly operation: EffectOperationKind;
  readonly element: HTMLElement;
  readonly signal: AbortSignal;
}

export interface SoundPlayback {
  readonly finished?: PromiseLike<unknown>;
  stop?(): void;
  dispose?(): void;
}

export type SoundFactory = (context: SoundContext) => SoundPlayback | PromiseLike<SoundPlayback | void> | void;
export type SoundDefinition = SoundSource | SoundOptions | SoundFactory;

export interface EffectPhase {
  readonly needsSnapshot?: boolean;
  readonly animate: AnimationFactory;
  readonly sound?: SoundDefinition | null;
}

export interface EffectDefinition {
  readonly remove: EffectPhase;
  readonly restore: EffectPhase;
}

export type EffectSelection = BuiltInEffect | (string & {}) | EffectDefinition;

export type LayoutSiblingResolver = (element: HTMLElement, container: HTMLElement) => HTMLElement[];

export interface LayoutOptions {
  readonly enabled?: boolean;
  readonly duration?: number;
  readonly easing?: string;
  readonly container?: HTMLElement | ((element: HTMLElement) => HTMLElement | null);
  readonly siblings?: 'following' | 'all' | LayoutSiblingResolver;
  readonly animateContainer?: boolean;
}

export type PreparationStrategy = 'immediate' | 'idle' | 'visible-idle';

export interface PreparationOptions {
  readonly strategy?: PreparationStrategy;
  readonly shouldPrepare?: (element: HTMLElement) => boolean;
  readonly root?: Element | Document | null;
  readonly rootMargin?: string;
  readonly concurrency?: number;
  readonly invalidateOnResize?: boolean;
  readonly observeMutations?: boolean;
  readonly idleTimeout?: number;
  readonly fallbackDelay?: number;
  readonly scrollSettle?: number;
  readonly animationSettle?: number;
  readonly cachePixelBudget?: number;
}

export interface EffectContext {
  readonly operation: EffectOperationKind;
  readonly element: HTMLElement;
  readonly overlay: HTMLElement | null;
  readonly removalId: RemovalId | null;
}

export interface EffectCallbacks {
  onTrigger?: (context: EffectContext) => void;
  onStart?: (context: EffectContext) => void;
  onComplete?: (context: EffectContext) => void;
  onError?: (error: unknown, context: EffectContext) => void;
}

export interface DisintegratorOptions extends EffectCallbacks {
  readonly capture?: SnapshotCapture;
  readonly effect?: EffectSelection;
  readonly effects?: Readonly<Record<string, EffectDefinition>>;
  /** Effect audio is opt-in: pass `true` for the built-in sounds, or supply your own definition. */
  readonly sound?: boolean | SoundDefinition;
  readonly layout?: boolean | LayoutOptions;
  readonly preparation?: boolean | PreparationOptions;
  readonly respectReducedMotion?: boolean;
  readonly overlayRoot?: HTMLElement | (() => HTMLElement);
  readonly zIndex?: number;
  readonly random?: () => number;
}

export interface OperationOptions extends EffectCallbacks {
  readonly effect?: EffectSelection;
  readonly sound?: boolean | SoundDefinition;
}

export interface RemoveOptions extends OperationOptions {
  readonly retain?: boolean;
  readonly layout?: boolean | LayoutOptions;
  /**
   * Replaces the default `element.remove()` commit. Reactive renderers can use
   * this hook to update their own state and remain the owner of the DOM node.
   */
  readonly detach?: (element: HTMLElement) => void;
}

export type RestoreOptions = OperationOptions;

export type EffectOperationStatus = 'completed' | 'cancelled' | 'skipped';

export interface EffectOperationResult {
  readonly operation: EffectOperationKind;
  readonly status: EffectOperationStatus;
  readonly removalId: RemovalId | null;
}

export interface EffectOperation {
  readonly operation: EffectOperationKind;
  readonly removalId: RemovalId | null;
  readonly finished: Promise<EffectOperationResult>;
  /** Stops only animation and audio; it does not undo the content operation. */
  cancel(): void;
}
