/** An element or a selector resolved against the current document. */
export type EffectTarget = HTMLElement | string;
/** One or more elements accepted by preparation management methods. */
export type EffectTargets = EffectTarget | Iterable<HTMLElement>;

/** The content operation currently being animated. */
export type EffectOperationKind = 'remove' | 'restore';
/** Names of the effects bundled with the package. */
export type BuiltInEffect = 'dust' | 'vapor' | 'scatter' | 'wind';
/** Horizontal origin used to distribute built-in particles. */
export type DisintegrationOrigin = 'left' | 'right' | 'random';
/** Particle movement profile used by the built-in WebGL renderer. */
export type ParticleMotion = 'dust' | 'vapor' | 'scatter' | 'wind';

declare const removalIdBrand: unique symbol;
/** Opaque identifier returned by `remove()` when `retain: true` is selected. */
export type RemovalId = string & { readonly [removalIdBrand]: true };

/** Context supplied to a custom DOM-to-canvas capture adapter. */
export interface SnapshotCaptureContext {
  /** `prepare` is background work; `remove` and `restore` belong to an operation. */
  readonly operation: EffectOperationKind | 'prepare';
  /** Aborts when the associated preparation or operation is cancelled. */
  readonly signal: AbortSignal;
  /** The computed opacity the captured root had before a restore operation concealed the live element. */
  readonly restoreRootOpacity?: string;
}

/** Creates a Canvas snapshot for effects whose phase needs pixels. */
export type SnapshotCapture = (
  element: HTMLElement,
  context: SnapshotCaptureContext,
) => HTMLCanvasElement | Promise<HTMLCanvasElement>;

/** Controls the built-in particle renderer returned by `createParticleAnimation()`. */
export interface ParticleOptions {
  /** Motion profile. Defaults to `dust`. */
  readonly motion?: ParticleMotion;
  /** Base animation duration in milliseconds. */
  readonly duration?: number;
  /** Maximum per-particle start delay in milliseconds. */
  readonly stagger?: number;
  /** Random horizontal spread in CSS pixels. */
  readonly horizontalDrift?: number;
  /** Minimum and maximum horizontal travel in CSS pixels. */
  readonly horizontalTravel?: readonly [number, number];
  /** Minimum and maximum upward travel in CSS pixels. */
  readonly rise?: readonly [number, number];
  /** Vertical oscillation amplitude in CSS pixels. */
  readonly swirl?: number;
  /** Particle scale at the end of its movement. */
  readonly endScale?: number;
  /** Where the particle threshold starts: left, right or random. */
  readonly origin?: DisintegrationOrigin;
}

/** A cancellable result returned by a custom effect renderer. */
export interface AnimationPlayback {
  /** Resolves once the visual phase is complete. */
  readonly finished: PromiseLike<unknown>;
  /** Optional visual node appended to the isolated animation layer. */
  readonly element?: HTMLElement;
  /** Used to align layout and sound with a custom renderer. */
  readonly duration?: number;
  /** Delays layout reflow until this point in milliseconds. */
  readonly layoutDelay?: number;
  /** Stops the visual playback. */
  cancel?(): void;
  /** Releases renderer-specific resources such as WebGL contexts. */
  dispose?(): void;
}

/** A custom animation may use WAAPI, a Promise, a playback controller, or return `null` to fail the phase. */
export type AnimationResult = Animation | PromiseLike<unknown> | AnimationPlayback | null;

/** Runtime data supplied to an effect phase's `animate()` function. */
export interface AnimationContext {
  /** Whether this is the remove or restore phase. */
  readonly operation: EffectOperationKind;
  /** The application's original DOM element. */
  readonly element: HTMLElement;
  /** Isolated overlay owned and removed by the library. */
  readonly layer: HTMLElement;
  /** A lazily-created full-size canvas containing the captured element. */
  readonly visual: HTMLCanvasElement | null;
  /** The raw capture, or `null` when the phase sets `needsSnapshot: false`. */
  readonly snapshot: HTMLCanvasElement | null;
  /** Final viewport geometry used to place the overlay. */
  readonly bounds: DOMRectReadOnly;
  /** Aborts when the operation is cancelled or the instance is destroyed. */
  readonly signal: AbortSignal;
  /** Always `false` for a running phase; reduced-motion requests skip the operation before animation. */
  readonly reducedMotion: boolean;
  /** Per-operation pseudo-random generator, optionally seeded with `DisintegratorOptions.random`. */
  readonly random: () => number;
  /** Registers cleanup that runs after completion, cancellation or an error. */
  addCleanup(callback: () => void): void;
}

/** Creates the visual part of one remove or restore phase. */
export type AnimationFactory = (context: AnimationContext) => AnimationResult;

/** Native audio data or a URL accepted by the Web Audio loader. */
export type SoundSource = string | URL | ArrayBuffer | AudioBuffer;

/** Playback settings for a sound source. */
export interface SoundOptions {
  /** URL or decoded audio data to play. */
  readonly src: SoundSource;
  /**
   * Plays the decoded source backwards, aligned so its final moment lands on the
   * end of the animation. Lets a restoration phase reuse the removal recording
   * instead of shipping a second file. Phases stay independent: giving each one
   * its own `src` keeps working.
   */
  readonly reverse?: boolean;
  /** Linear output gain from `0` to `1`. Defaults to `0.32`. */
  readonly gain?: number;
  /** Optional source duration in seconds. */
  readonly duration?: number;
  /** Fade duration in seconds: applied on the way out, or on the way in when `reverse` is set. */
  readonly fadeDuration?: number;
  /** Start delay in milliseconds. */
  readonly delay?: number;
  /** Playback speed multiplier. */
  readonly playbackRate?: number;
}

/** Context supplied to a custom sound factory. */
export interface SoundContext {
  /** Operation that triggered the sound. */
  readonly operation: EffectOperationKind;
  /** Application element associated with the operation. */
  readonly element: HTMLElement;
  /** Aborts when the operation is cancelled. */
  readonly signal: AbortSignal;
}

/** Optional controls returned by a custom sound factory. */
export interface SoundPlayback {
  /** Optional completion signal for early disposal; otherwise cleanup follows the visual operation. */
  readonly finished?: PromiseLike<unknown>;
  /** Stops playback immediately. */
  stop?(): void;
  /** Releases custom audio resources. */
  dispose?(): void;
}

/** Creates a custom sound player for a remove or restore phase. */
export type SoundFactory = (context: SoundContext) => SoundPlayback | PromiseLike<SoundPlayback | void> | void;
/** A sound source, its playback options, or a custom player factory. */
export type SoundDefinition = SoundSource | SoundOptions | SoundFactory;

/** One direction of a paired effect. */
export interface EffectPhase {
  /** Set to `false` for DOM/WAAPI effects that do not need a Canvas capture. */
  readonly needsSnapshot?: boolean;
  /** Creates the visual animation for this phase. */
  readonly animate: AnimationFactory;
  /** Sound played for this phase when audio is enabled; `null` keeps it silent. */
  readonly sound?: SoundDefinition | null;
}

/** A paired deletion and restoration effect. */
export interface EffectDefinition {
  /** Visual and audio behavior used by `remove()`. */
  readonly remove: EffectPhase;
  /** Visual and audio behavior used by `restore()`. */
  readonly restore: EffectPhase;
}

/** A built-in name, a registered custom name, or an inline paired effect. */
export type EffectSelection = BuiltInEffect | (string & {}) | EffectDefinition;

/** Chooses which siblings participate in a removal layout animation. */
export type LayoutSiblingResolver = (element: HTMLElement, container: HTMLElement) => HTMLElement[];

/** Options for animating reflow caused by `remove()`. */
export interface LayoutOptions {
  /** Enables this layout animation. */
  readonly enabled?: boolean;
  /** Reflow animation duration in milliseconds. */
  readonly duration?: number;
  /** CSS timing function used for reflow. */
  readonly easing?: string;
  /** Element whose height and descendants are measured for reflow. */
  readonly container?: HTMLElement | ((element: HTMLElement) => HTMLElement | null);
  /** Following siblings, every sibling, or a custom sibling resolver. */
  readonly siblings?: 'following' | 'all' | LayoutSiblingResolver;
  /** Whether to animate the container height as its content changes. */
  readonly animateContainer?: boolean;
}

/** When a registered element should be captured in the background. */
export type PreparationStrategy = 'immediate' | 'idle' | 'visible-idle';

/** When encoded audio should be fetched and decoded before its first playback. */
export type AudioPreparationStrategy = 'immediate' | 'idle';

/** Controls automatic audio preparation and the decoded-buffer cache. */
export interface AudioPreparationOptions {
  /** Starts preparation now or when the browser is idle. Defaults to `immediate`. */
  readonly strategy?: AudioPreparationStrategy;
  /** Effects to prepare instead of only the instance's default effect. */
  readonly effects?: EffectSelection | readonly EffectSelection[];
  /** Per-instance LRU capacity for owned decoded PCM data. Defaults to 8 MiB. */
  readonly cacheByteBudget?: number;
}

/** Controls the bounded background snapshot cache for registered elements. */
export interface PreparationOptions {
  /** `immediate`, idle time, or only while near the viewport. Defaults to `visible-idle`. */
  readonly strategy?: PreparationStrategy;
  /** Called before capture; return `false` to skip this element. */
  readonly shouldPrepare?: (element: HTMLElement) => boolean;
  /** Intersection observer root for `visible-idle`. */
  readonly root?: Element | Document | null;
  /** Intersection observer margin for `visible-idle`. */
  readonly rootMargin?: string;
  /** Maximum simultaneous background and explicit captures, from 1 to 8. */
  readonly concurrency?: number;
  /** Invalidates a cached snapshot when the element's dimensions change. Defaults to `true`. */
  readonly invalidateOnResize?: boolean;
  /**
   * Watches subtree mutations and load events. Inline style writes invalidate
   * without scheduling background recapture to avoid animation-frame loops.
   * Disabled by default because broad observation can be expensive.
   */
  readonly observeMutations?: boolean;
  /** Maximum wait for `requestIdleCallback` in milliseconds. */
  readonly idleTimeout?: number;
  /** Timeout fallback in milliseconds when idle callbacks are unavailable. */
  readonly fallbackDelay?: number;
  /** Wait after scroll activity before background capture in milliseconds. */
  readonly scrollSettle?: number;
  /** Maximum wait for active element animations before capture in milliseconds. */
  readonly animationSettle?: number;
  /** LRU capacity in physical Canvas pixels; defaults to 8,000,000. */
  readonly cachePixelBudget?: number;
}

/** Lifecycle context provided to operation callbacks. */
export interface EffectContext {
  /** The operation that emitted the callback. */
  readonly operation: EffectOperationKind;
  /** The application's original DOM element. */
  readonly element: HTMLElement;
  /** The animation overlay, available from `onStart` through `onComplete`. */
  readonly overlay: HTMLElement | null;
  /** Retention handle for a remove operation, otherwise `null`. */
  readonly removalId: RemovalId | null;
}

/** Context supplied when the library reports an isolated failure. */
export interface EffectErrorContext {
  /** Operation that failed, or `prepare` for background snapshot work. */
  readonly operation: EffectOperationKind | 'prepare';
  /** Element associated with the failure. */
  readonly element: HTMLElement;
  /** Active animation overlay when the failure happened, otherwise `null`. */
  readonly overlay: HTMLElement | null;
  /** Retention handle for a remove operation, otherwise `null`. */
  readonly removalId: RemovalId | null;
}

/** Optional callbacks shared by an instance and individual operations. */
export interface EffectCallbacks {
  /** Called after trigger validation and before capture starts. */
  onTrigger?: (context: EffectContext) => void;
  /** Called after the content action commits and visual playback begins. */
  onStart?: (context: EffectContext) => void;
  /** Called after a visual phase completes normally. */
  onComplete?: (context: EffectContext) => void;
  /** Reports preparation, capture, animation, sound and callback errors without interrupting application flow. */
  onError?: (error: unknown, context: EffectErrorContext) => void;
}

/** Instance-wide defaults and infrastructure adapters. */
export interface DisintegratorOptions extends EffectCallbacks {
  /** Canvas capture adapter. Required by every snapshot-based effect. */
  readonly capture?: SnapshotCapture;
  /** Default effect used when an operation does not choose one. */
  readonly effect?: EffectSelection;
  /** Custom effects addressable by name through `effect`. */
  readonly effects?: Readonly<Record<string, EffectDefinition>>;
  /** `true` uses phase sounds, `false` disables sound, and a definition overrides every phase. */
  readonly sound?: boolean | SoundDefinition;
  /** Enables or configures reflow animation for remove operations. */
  readonly layout?: boolean | LayoutOptions;
  /** Configures background snapshot caching. Registered elements use `visible-idle` by default. */
  readonly preparation?: boolean | PreparationOptions;
  /** Configures automatic preparation of enabled audio, or disables it with `false`. */
  readonly audioPreparation?: false | AudioPreparationStrategy | AudioPreparationOptions;
  /** Skips operations when the user requests reduced motion. Defaults to `true`. */
  readonly respectReducedMotion?: boolean;
  /** Container for fixed-position animation overlays. Defaults to `document.body`. */
  readonly overlayRoot?: HTMLElement | (() => HTMLElement);
  /** Overlay stack level. Defaults to a high stacking value. */
  readonly zIndex?: number;
  /** Optional seed source for repeatable particle layouts. */
  readonly random?: () => number;
}

/** Per-operation overrides shared by `remove()` and `restore()`. */
export interface OperationOptions extends EffectCallbacks {
  /** Effect name or inline paired effect for this operation. */
  readonly effect?: EffectSelection;
  /** Enables, disables or replaces sound for this operation. */
  readonly sound?: boolean | SoundDefinition;
}

/** Options specific to `remove()`. */
export interface RemoveOptions extends OperationOptions {
  /** Keeps the detached original node under a `RemovalId` for a later `take()`. Defaults to `false`. */
  readonly retain?: boolean;
  /** Enables or overrides reflow animation for this removal. */
  readonly layout?: boolean | LayoutOptions;
  /**
   * Replaces the default `element.remove()` commit. Reactive renderers can use
   * this hook to update their own state and remain the owner of the DOM node.
   */
  readonly detach?: (element: HTMLElement) => void;
}

/** Options specific to `restore()`. */
export type RestoreOptions = OperationOptions;

/** Final result of an operation. */
export type EffectOperationStatus = 'completed' | 'cancelled' | 'skipped' | 'rejected';

/** Value resolved by `EffectOperation.finished`. */
export interface EffectOperationResult {
  /** Remove or restore operation that completed. */
  readonly operation: EffectOperationKind;
  /**
   * `completed` finished normally; `cancelled` committed without finishing its visual;
   * `skipped` committed without starting a visual; `rejected` did not start or commit.
   */
  readonly status: EffectOperationStatus;
  /** Retention id for a removal, otherwise `null`. */
  readonly removalId: RemovalId | null;
}

/** Synchronous handle returned by `remove()` and `restore()`. */
export interface EffectOperation {
  /** Remove or restore operation represented by this handle. */
  readonly operation: EffectOperationKind;
  /** Retention id for an accepted removal with `retain: true`, otherwise `null`. */
  readonly removalId: RemovalId | null;
  /**
   * Resolves after visual cleanup and reports the final status. A rejected
   * concurrent call waits for the operation currently owning the element.
   */
  readonly finished: Promise<EffectOperationResult>;
  /** Stops only animation and audio; it does not undo the content operation. */
  cancel(): void;
}
