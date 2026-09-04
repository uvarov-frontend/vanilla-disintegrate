/** An element or a selector resolved against the current document. */
export type EffectTarget = HTMLElement | string;
/** One or more elements accepted by preparation management methods. */
export type EffectTargets = EffectTarget | Iterable<HTMLElement>;

/** The content operation currently being animated. */
export type EffectOperationKind = 'remove' | 'restore';
/** Names of the complete visual-and-audio presets bundled with the package. */
export type BuiltInPreset = 'dust' | 'scatter' | 'vapor' | 'wind';
/** Names of the audio sources bundled independently from particle effects. */
export type BuiltInSound = BuiltInPreset;
/** How particles are released across the captured element. */
export type ParticleRelease = 'left' | 'right' | 'top' | 'bottom' | 'center' | 'edges' | 'random';
/**
 * Easing curve the built-in WebGL renderer applies to particle travel. It shapes
 * how a particle accelerates and fades, and is independent of the geometry
 * options below, which decide where it goes.
 */
export type ParticleCurve = 'settle' | 'float' | 'burst' | 'drift';

/** Explicit software limits for particle source and render surfaces. */
export interface ParticleRenderBudget {
  /** Maximum pixel count of the renderer's source texture. */
  readonly maxSourcePixels: number;
  /** Maximum width or height of the renderer's source texture. */
  readonly maxSourceDimension: number;
  /** Maximum pixels allocated for the expanded WebGL animation surface. */
  readonly maxRenderPixels: number;
}

/** Selects the particle renderer's resolution and resource policy. */
export type ParticleRenderQuality = 'auto' | 'exact' | ParticleRenderBudget;

/** Page-wide ceilings for the particle renderer's WebGL2 context pool. */
export interface ParticleContextLimits {
  /** Contexts kept alive at once. Defaults to 4. */
  readonly maxContexts?: number;
  /** Contexts kept warm for reuse, capped by `maxContexts`. Defaults to 2. */
  readonly maxIdleContexts?: number;
}

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
  /** Resolution policy. Defaults to the resource-bounded `auto` mode. */
  readonly renderQuality?: ParticleRenderQuality;
  /** Minimum particle edge length in CSS pixels, or adaptive sizing. Defaults to `auto`. */
  readonly particleSize?: 'auto' | number;
  /** Source alpha values at or below this `0`–`1` threshold do not produce particles. */
  readonly alphaThreshold?: number;
  /** Travel curve. Defaults to `settle`. */
  readonly curve?: ParticleCurve;
  /** Base animation duration in milliseconds. */
  readonly duration?: number;
  /** Maximum per-particle start delay in milliseconds. */
  readonly stagger?: number;
  /** Random horizontal spread in CSS pixels. */
  readonly horizontalDrift?: number;
  /** Minimum and maximum horizontal travel in CSS pixels. */
  readonly horizontalTravel?: readonly [number, number];
  /** Minimum and maximum vertical travel in CSS pixels. Negative values move upward. */
  readonly verticalTravel?: readonly [number, number];
  /** Pull toward the element's horizontal center, from `0` to `1`. */
  readonly convergence?: number;
  /** Vertical oscillation amplitude in CSS pixels. */
  readonly swirl?: number;
  /** Particle scale at the end of its movement. */
  readonly endScale?: number;
  /** Minimum and maximum terminal rotation in degrees for detached particles. */
  readonly rotation?: readonly [number, number];
  /** How particles are released across the element. Defaults to `left`. */
  readonly release?: ParticleRelease;
  /** Mix between an ordered release (`0`) and random release (`1`). */
  readonly releaseRandomness?: number;
  /** Local progress at which detached particles begin fading, from `0` to `1`. */
  readonly fadeStart?: number;
  /** Number of oscillations along a particle path. Defaults to the selected curve. */
  readonly waveTurns?: number;
  /** Fraction of released particles required before layout reflow, from `0` to `1`. */
  readonly layoutRelease?: number;
}

/** A complete motion configuration with an optional render policy, such as an entry in `particlePresets`. */
export type ParticlePreset = Required<Omit<ParticleOptions, 'renderQuality'>> & Pick<ParticleOptions, 'renderQuality'>;

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

/** Native audio data, a built-in name, a local file, encoded bytes, or a URL accepted by the audio loader. */
export type SoundSource = BuiltInSound | (string & {}) | URL | Blob | ArrayBuffer | ArrayBufferView | AudioBuffer;

/** Playback settings for a sound source. */
export interface SoundOptions {
  /** URL, local Blob/File, encoded bytes, or decoded audio data to play. */
  readonly src: SoundSource;
  /**
   * Plays the decoded source backwards, aligned so its final moment lands on the
   * end of the animation. Lets a restoration phase reuse the removal recording
   * instead of shipping a second file. Phases stay independent: giving each one
   * its own `src` keeps working.
   */
  readonly reverse?: boolean;
  /** Linear output volume from `0` to `1`. Defaults to `1`. */
  readonly volume?: number;
  /** Optional source duration in seconds. Defaults to the visual duration, capped by the source length. */
  readonly duration?: number;
  /** Fade duration in seconds: applied on the way out, or on the way in when reversed. Defaults to `0`. */
  readonly fadeDuration?: number;
  /** Start delay in milliseconds. Defaults to `0`. */
  readonly delay?: number;
  /** Playback speed multiplier. Defaults to `1`. */
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
/** Explicit native playback settings or a custom player factory. */
export type SoundDefinition = SoundOptions | SoundFactory;

/** Independent sounds for removal and restoration. At least one operation must be configured. */
export type SoundPair =
  | { readonly remove: SoundDefinition; readonly restore?: SoundDefinition | false }
  | { readonly remove?: SoundDefinition | false; readonly restore: SoundDefinition };

/** Complete, independently configurable audio for removal and restoration. */
export type SoundSelection = SoundPair;

/** One or more sound selections accepted by explicit and automatic preparation. */
export type SoundPreparationSelection =
  SoundDefinition | SoundSelection | readonly (false | SoundDefinition | SoundSelection)[];

/** One direction of a paired effect. */
export interface EffectPhase {
  /** Set to `false` for DOM/WAAPI effects that do not need a Canvas capture. */
  readonly needsSnapshot?: boolean;
  /** Creates the visual animation for this phase. */
  readonly animate: AnimationFactory;
}

/** A paired deletion and restoration effect. */
export interface EffectDefinition {
  /** Visual behavior used by `remove()`. */
  readonly remove: EffectPhase;
  /** Visual behavior used by `restore()`. */
  readonly restore: EffectPhase;
}

/** A reusable combination of visual behavior and independent remove/restore audio. */
export interface PresetDefinition {
  /** Paired visual behavior. */
  readonly effect: EffectDefinition;
  /** Complete paired audio behavior. */
  readonly sound: SoundSelection;
}

/** A registered preset name or an inline complete preset. */
export type PresetSelection = BuiltInPreset | (string & {}) | PresetDefinition;

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
  /** Starts preparation now or when the browser is idle. Defaults to `idle`. */
  readonly strategy?: AudioPreparationStrategy;
  /** Sounds to prepare instead of only the instance's default sound selection. */
  readonly sounds?: SoundPreparationSelection;
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

/** Infrastructure and lifecycle options shared by every instance configuration. */
export interface DisintegratorBaseOptions extends EffectCallbacks {
  /** Canvas capture adapter. Required by every snapshot-based effect. */
  readonly capture?: SnapshotCapture;
  /** Custom complete presets addressable by name through `preset`. */
  readonly presets?: Readonly<Record<string, PresetDefinition>>;
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

/**
 * Instance configuration. Choose an immutable complete preset, or configure a
 * custom visual effect whose audio is silent until explicitly provided.
 */
export type DisintegratorOptions = DisintegratorBaseOptions &
  (
    | {
        /** Complete visual-and-audio configuration. */
        readonly preset: PresetSelection;
        readonly effect?: never;
        /** Explicitly mutes the otherwise complete preset. */
        readonly sound?: false;
      }
    | {
        readonly preset?: never;
        /** Complete custom visual behavior. String preset names are not accepted here. */
        readonly effect: EffectDefinition;
        /** Complete custom audio. Omit it or pass `false` for silence. */
        readonly sound?: false | SoundSelection;
      }
  );

/** Per-operation configuration shared by `remove()` and `restore()`. */
export type OperationOptions = EffectCallbacks &
  (
    | {
        /** Selects another complete preset for this operation. */
        readonly preset: PresetSelection;
        readonly effect?: never;
        /** Explicitly mutes this operation. */
        readonly sound?: false;
      }
    | {
        readonly preset?: never;
        /** Selects a complete custom visual effect for this operation. */
        readonly effect: EffectDefinition;
        /** Configures audio for this operation. Omit it or pass `false` for silence. */
        readonly sound?: false | SoundDefinition;
      }
    | {
        /** Inherits the instance or retained-node presentation. */
        readonly preset?: never;
        readonly effect?: never;
        /** May only mute inherited audio without replacing its configuration. */
        readonly sound?: false;
      }
  );

/** Options specific to `remove()`. */
export type RemoveOptions = OperationOptions & {
  /** Keeps the detached original node under a `RemovalId` for a later `take()`. Defaults to `false`. */
  readonly retain?: boolean;
  /** Enables or overrides reflow animation for this removal. */
  readonly layout?: boolean | LayoutOptions;
  /**
   * Replaces the default `element.remove()` commit. Reactive renderers can use
   * this hook to update their own state and remain the owner of the DOM node.
   */
  readonly detach?: (element: HTMLElement) => void;
};

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
