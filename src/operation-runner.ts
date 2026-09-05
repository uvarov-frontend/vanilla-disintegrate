import { SoundPlayer, type PreparedSound } from './audio';
import { resolveLayout } from './defaults';
import { LayoutAnimator, type LayoutPlayback } from './layout';
import { disposeSnapshot, SnapshotPreparation } from './preparation';
import { RetainedElements } from './retained-elements';
import { soundForOperation } from './sound-selection';
import { supportsWebGL2 } from './webgl2';
import type {
  AnimationContext,
  AnimationPlayback,
  AnimationResult,
  EffectCallbacks,
  EffectContext,
  EffectDefinition,
  EffectErrorContext,
  EffectOperation,
  EffectOperationKind,
  EffectOperationResult,
  EffectOperationStatus,
  EffectPhase,
  DisintegratorOptions,
  FallbackEffectDefinition,
  OperationOptions,
  RemovalId,
  RemoveOptions,
  SoundDefinition,
  SoundSelection,
} from './types';

const noop: () => void = () => undefined;

function concealForRestore(element: HTMLElement) {
  if (typeof element.animate === 'function') {
    try {
      const animation = element.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 1, fill: 'both' });
      animation.pause();
      animation.currentTime = 0;
      return () => animation.cancel();
    } catch {
      // Fall back to an inline override when WAAPI is present but unavailable for this element.
    }
  }

  const opacity = element.style.getPropertyValue('opacity');
  const priority = element.style.getPropertyPriority('opacity');
  element.style.setProperty('opacity', '0', 'important');
  return () => {
    if (opacity === '') element.style.removeProperty('opacity');
    else element.style.setProperty('opacity', opacity, priority);
  };
}

interface NormalizedAnimation {
  readonly duration: number;
  readonly layoutDelay: number;
  readonly finished: Promise<void>;
  cancel(): void;
  dispose(): void;
}

interface RunningOperation {
  element: HTMLElement | null;
  readonly kind: EffectOperationKind;
  readonly removalId: RemovalId | null;
  readonly retain: boolean;
  readonly detach: RemoveOptions['detach'];
  readonly effect: EffectDefinition;
  phase: EffectPhase;
  fallbackPhase: EffectPhase | null;
  readonly soundSelection: false | SoundSelection | undefined;
  readonly sound: SoundDefinition | null;
  readonly callbacks: readonly EffectCallbacks[];
  readonly controller: AbortController;
  committed: boolean;
  settled: boolean;
  readonly finished: Promise<EffectOperationResult>;
  cancelVisual: () => void;
  releasePreparation: () => void;
  finish: (status: EffectOperationStatus) => void;
}

interface RunOptions {
  readonly kind: EffectOperationKind;
  readonly element: HTMLElement;
  readonly effect: EffectDefinition;
  readonly sound: false | SoundSelection | undefined;
  readonly overrides: OperationOptions | RemoveOptions;
}

function reportCallbackError(error: unknown, context: EffectErrorContext, callbacks: readonly EffectCallbacks[]) {
  for (const callback of callbacks) {
    try {
      callback.onError?.(error, context);
    } catch {
      // Application callbacks cannot interrupt resource cleanup.
    }
  }
}

function runCallback(
  name: 'onTrigger' | 'onStart' | 'onComplete',
  context: EffectContext,
  callbacks: readonly EffectCallbacks[],
) {
  for (const callback of callbacks) {
    try {
      callback[name]?.(context);
    } catch (error) {
      reportCallbackError(error, context, callbacks);
    }
  }
}

function isAnimation(value: AnimationResult): value is Animation {
  return typeof Animation !== 'undefined' && value instanceof Animation;
}

function isPlayback(value: AnimationResult): value is AnimationPlayback {
  return value !== null && typeof value === 'object' && 'finished' in value;
}

function normalizeAnimation(result: AnimationResult, layer: HTMLElement): NormalizedAnimation | null {
  if (result === null) return null;
  if (isAnimation(result)) {
    const timing = result.effect?.getComputedTiming();
    const duration = typeof timing?.endTime === 'number' && Number.isFinite(timing.endTime) ? timing.endTime : 0;
    return {
      duration,
      layoutDelay: 0,
      finished: Promise.resolve(result.finished).then(() => undefined),
      cancel: () => result.cancel(),
      dispose: noop,
    };
  }
  if (isPlayback(result)) {
    if (result.element !== undefined && result.element.parentNode === null) layer.appendChild(result.element);
    return {
      duration: result.duration ?? 0,
      layoutDelay: result.layoutDelay ?? 0,
      finished: Promise.resolve(result.finished).then(() => undefined),
      cancel: () => result.cancel?.(),
      dispose: () => result.dispose?.(),
    };
  }
  return {
    duration: 0,
    layoutDelay: 0,
    finished: Promise.resolve(result).then(() => undefined),
    cancel: noop,
    dispose: noop,
  };
}

export class OperationRunner {
  private readonly layout = new LayoutAnimator();
  private readonly active = new Set<RunningOperation>();
  private readonly busy = new WeakMap<HTMLElement, RunningOperation>();
  private webgl2Available: boolean | null = null;
  private destroyed = false;

  constructor(
    private readonly options: DisintegratorOptions,
    private readonly preparation: SnapshotPreparation,
    private readonly retained: RetainedElements,
    private readonly sound: SoundPlayer,
    private readonly fallback: FallbackEffectDefinition | undefined,
  ) {}

  rejectIfBusy(kind: EffectOperationKind, element: HTMLElement) {
    const active = this.busy.get(element);
    return active === undefined ? null : this.rejectedOperation(kind, active.finished);
  }

  run(options: RunOptions): EffectOperation {
    this.assertAlive();
    const { element, effect, kind, overrides, sound: soundSelection } = options;
    const active = this.busy.get(element);
    if (active !== undefined) return this.rejectedOperation(kind, active.finished);

    const selected = this.selectPhase(effect, kind, element.ownerDocument);
    const retain = kind === 'remove' && (overrides as RemoveOptions).retain === true;
    const removalId = retain ? this.retained.createId() : null;
    const callbacks = [this.options, overrides] as const;
    const sound = selected.isFallback ? null : this.resolveSound(kind, soundSelection, overrides.sound);
    let resolveFinished: (result: EffectOperationResult) => void = () => undefined;
    const finished = new Promise<EffectOperationResult>((resolve) => {
      resolveFinished = resolve;
    });
    const running: RunningOperation = {
      element,
      kind,
      removalId,
      retain,
      detach: kind === 'remove' ? (overrides as RemoveOptions).detach : undefined,
      effect,
      phase: selected.phase,
      fallbackPhase: selected.fallbackPhase,
      soundSelection,
      sound,
      callbacks,
      controller: new AbortController(),
      committed: false,
      settled: false,
      finished,
      cancelVisual: noop,
      releasePreparation: noop,
      finish: (status) => {
        if (running.settled) return;
        running.settled = true;
        running.cancelVisual = noop;
        try {
          running.releasePreparation();
        } catch (error) {
          reportCallbackError(error, { operation: kind, element, overlay: null, removalId }, callbacks);
        }
        running.releasePreparation = noop;
        const activeElement = running.element;
        if (activeElement !== null && this.busy.get(activeElement) === running) this.busy.delete(activeElement);
        running.element = null;
        this.active.delete(running);
        resolveFinished({ operation: kind, status, removalId });
      },
    };

    const operation: EffectOperation = {
      operation: kind,
      removalId,
      finished,
      cancel: () => {
        if (running.settled) return;
        running.controller.abort();
        this.cleanupStep(running.cancelVisual, { operation: kind, element, overlay: null, removalId }, callbacks);
        try {
          this.commit(running);
        } finally {
          running.finish('cancelled');
        }
      },
    };

    this.busy.set(element, running);
    this.active.add(running);
    this.sound.unlock(sound, (error) =>
      reportCallbackError(error, { operation: kind, element, overlay: null, removalId }, callbacks),
    );
    void this.start(running, overrides, callbacks).catch((error: unknown) => {
      this.fail(running, error, {
        operation: kind,
        element,
        overlay: null,
        removalId,
      });
    });
    return operation;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const operation of [...this.active]) {
      operation.controller.abort();
      const element = operation.element;
      if (element === null) {
        operation.finish('cancelled');
        continue;
      }
      this.cleanupStep(
        operation.cancelVisual,
        {
          operation: operation.kind,
          element,
          overlay: null,
          removalId: operation.removalId,
        },
        operation.callbacks,
      );
      try {
        this.commit(operation);
      } finally {
        operation.finish('cancelled');
      }
    }
  }

  private async start(
    running: RunningOperation,
    overrides: OperationOptions | RemoveOptions,
    callbacks: readonly EffectCallbacks[],
  ) {
    const element = running.element;
    if (element === null) return;
    const phase = running.phase;
    const emptyContext: EffectContext = {
      operation: running.kind,
      element,
      overlay: null,
      removalId: running.removalId,
    };
    let snapshot: HTMLCanvasElement | null = null;
    let previousPointerEvents = '';
    let restoreRootOpacity: string | undefined;
    let reveal = noop;

    try {
      const rect = element.getBoundingClientRect();
      runCallback('onTrigger', emptyContext, callbacks);
      if (running.settled) return;
      if (!element.isConnected || rect.width <= 0 || rect.height <= 0 || this.shouldReduceMotion()) {
        this.commit(running);
        running.finish('skipped');
        return;
      }

      running.releasePreparation = this.preparation.suspend(element);
      previousPointerEvents = element.style.pointerEvents;
      running.cancelVisual = () => {
        this.restoreElement(element, previousPointerEvents, reveal, emptyContext, callbacks);
        disposeSnapshot(snapshot);
        snapshot = null;
      };
      if (running.kind === 'restore') {
        restoreRootOpacity = getComputedStyle(element).opacity || '1';
        reveal = concealForRestore(element);
        if (running.settled) {
          this.restoreElement(element, previousPointerEvents, reveal, emptyContext, callbacks);
          return;
        }
      }
      element.style.pointerEvents = 'none';

      const audio = this.prepareAudio(running, emptyContext);
      if (running.settled) return;
      let preparedSound: PreparedSound = null;
      if (phase.needsSnapshot ?? true) {
        [, preparedSound] = await Promise.all([
          this.preparation
            .take(
              element,
              running.kind,
              running.controller.signal,
              restoreRootOpacity === undefined ? {} : { restoreRootOpacity },
            )
            .then((captured) => {
              // Capture ownership must not wait for audio: cancellation can happen
              // after the pixels arrive but before the sound has finished loading.
              if (running.settled || running.controller.signal.aborted) disposeSnapshot(captured);
              else snapshot = captured;
            }),
          audio,
        ]);
      } else if (running.kind === 'restore') {
        // Let same-turn DOM updates settle before measuring the element's final insertion geometry.
        [, preparedSound] = await Promise.all([Promise.resolve(), audio]);
      } else {
        preparedSound = await audio;
      }
      if (running.settled) {
        disposeSnapshot(snapshot);
        return;
      }
      if (!element.isConnected) throw new Error('The target element was disconnected before the effect started.');
      const currentRect = element.getBoundingClientRect();
      if (running.settled) return;
      if (currentRect.width <= 0 || currentRect.height <= 0) {
        throw new Error('The target element became unmeasurable before the effect started.');
      }
      await this.play(
        running,
        overrides,
        callbacks,
        currentRect,
        snapshot,
        preparedSound,
        previousPointerEvents,
        reveal,
      );
    } catch (error) {
      this.fail(running, error, emptyContext);
    }
  }

  private async play(
    running: RunningOperation,
    overrides: OperationOptions | RemoveOptions,
    callbacks: readonly EffectCallbacks[],
    bounds: DOMRectReadOnly,
    snapshot: HTMLCanvasElement | null,
    preparedSound: PreparedSound,
    previousPointerEvents: string,
    reveal: () => void,
  ) {
    const element = running.element;
    if (element === null) return;
    const overlay = this.createOverlay(bounds);
    const context: EffectContext = {
      operation: running.kind,
      element,
      overlay,
      removalId: running.removalId,
    };
    const cleanups = new Set<() => void>();
    let visual: HTMLCanvasElement | null = null;
    const getVisual = () => {
      if (snapshot === null) return null;
      if (visual !== null) return visual;
      visual = document.createElement('canvas');
      visual.width = snapshot.width;
      visual.height = snapshot.height;
      visual.getContext('2d')?.drawImage(snapshot, 0, 0);
      Object.assign(visual.style, {
        height: `${bounds.height}px`,
        inset: '0',
        pointerEvents: 'none',
        position: 'absolute',
        width: `${bounds.width}px`,
      });
      overlay.appendChild(visual);
      return visual;
    };
    const random = this.createRandom();
    if (running.settled) return;
    const animationContext: AnimationContext = {
      operation: running.kind,
      element,
      layer: overlay,
      get visual() {
        return getVisual();
      },
      snapshot,
      bounds,
      signal: running.controller.signal,
      reducedMotion: false,
      random,
      addCleanup: (cleanup) => cleanups.add(cleanup),
    };

    let animation: NormalizedAnimation | null = null;
    let layout: LayoutPlayback = { finished: Promise.resolve(), cancel: noop };
    let stopSound = noop;
    let stopScroll = noop;
    let snapshotHandled = false;
    const cleanup = (cancel: boolean, preserveSnapshot = false) => {
      const currentAnimation = animation;
      animation = null;
      const currentLayout = layout;
      layout = { finished: Promise.resolve(), cancel: noop };
      if (cancel) {
        this.cleanupStep(() => currentAnimation?.cancel(), context, callbacks);
        this.cleanupStep(() => currentLayout.cancel(), context, callbacks);
      }
      this.cleanupStep(() => currentAnimation?.dispose(), context, callbacks);
      for (const dispose of [...cleanups]) {
        cleanups.delete(dispose);
        this.cleanupStep(dispose, context, callbacks);
      }
      const releaseSound = stopSound;
      stopSound = noop;
      this.cleanupStep(releaseSound, context, callbacks);
      const releaseScroll = stopScroll;
      stopScroll = noop;
      this.cleanupStep(releaseScroll, context, callbacks);
      this.cleanupStep(() => overlay.remove(), context, callbacks);
      if (!snapshotHandled) {
        snapshotHandled = true;
        if (!preserveSnapshot) this.cleanupStep(() => disposeSnapshot(snapshot), context, callbacks);
      }
    };
    running.cancelVisual = () => {
      cleanup(true);
      if (running.kind === 'restore' || !running.committed) {
        this.restoreElement(element, previousPointerEvents, reveal, context, callbacks);
      }
    };

    let resolveAbort: () => void = noop;
    let listeningForAbort = false;
    try {
      const layoutOptions = resolveLayout(
        running.kind === 'remove' ? ((overrides as RemoveOptions).layout ?? this.options.layout) : false,
      );
      const layoutSnapshot = this.layout.capture(element, layoutOptions);
      if (running.settled) return;
      let primaryError: unknown = null;
      try {
        animation = normalizeAnimation(running.phase.animate(animationContext), overlay);
      } catch (error) {
        primaryError = error;
      }
      if (animation === null && running.fallbackPhase !== null) {
        running.phase = running.fallbackPhase;
        running.fallbackPhase = null;
        animation = normalizeAnimation(running.phase.animate(animationContext), overlay);
        preparedSound = null;
      }
      if (animation === null) {
        if (primaryError instanceof Error) throw primaryError;
        throw new Error('The selected effect did not create an animation.');
      }
      if (running.settled) return;
      const overlayRoot = this.resolveOverlayRoot();
      if (running.settled) return;
      overlayRoot.appendChild(overlay);
      stopScroll = this.trackScroll(element, overlay);
      if (running.kind === 'remove') element.style.pointerEvents = previousPointerEvents;
      this.commit(running);
      if (running.settled) return;
      layout = this.layout.play(layoutSnapshot, layoutOptions, animation.layoutDelay);
      if (running.settled) return;
      runCallback('onStart', context, callbacks);
      if (running.settled) return;
      stopSound = this.sound.play(
        preparedSound,
        animation.duration / 1000,
        { operation: running.kind, element, signal: running.controller.signal },
        (error) => reportCallbackError(error, context, callbacks),
      );
      if (running.settled) return;
      const aborted = new Promise<void>((resolve) => {
        resolveAbort = resolve;
      });
      running.controller.signal.addEventListener('abort', resolveAbort, { once: true });
      listeningForAbort = true;
      await Promise.race([Promise.all([animation.finished, layout.finished]), aborted]);
      if (running.settled) return;

      const preserveSnapshot =
        (running.kind === 'restore' && this.preparation.cache(element, snapshot)) ||
        (running.kind === 'remove' &&
          running.removalId !== null &&
          this.retained.has(running.removalId, element) &&
          this.preparation.cacheRetained(element, snapshot, bounds));
      if (running.settled) return;
      cleanup(false, preserveSnapshot);
      if (running.kind === 'restore') this.restoreElement(element, previousPointerEvents, reveal, context, callbacks);
      runCallback('onComplete', context, callbacks);
      running.finish('completed');
    } catch (error) {
      cleanup(true);
      throw error;
    } finally {
      if (listeningForAbort) running.controller.signal.removeEventListener('abort', resolveAbort);
      if (running.settled) cleanup(true);
    }
  }

  private fail(running: RunningOperation, error: unknown, context: EffectErrorContext) {
    if (running.settled) return;
    reportCallbackError(error, context, running.callbacks);
    this.cleanupStep(running.cancelVisual, context, running.callbacks);
    try {
      this.commit(running);
    } finally {
      running.finish('skipped');
    }
  }

  private restoreElement(
    element: HTMLElement,
    pointerEvents: string,
    reveal: () => void,
    context: EffectErrorContext,
    callbacks: readonly EffectCallbacks[],
  ) {
    this.cleanupStep(
      () => {
        element.style.pointerEvents = pointerEvents;
      },
      context,
      callbacks,
    );
    this.cleanupStep(reveal, context, callbacks);
  }

  private cleanupStep(cleanup: () => void, context: EffectErrorContext, callbacks: readonly EffectCallbacks[]) {
    try {
      cleanup();
    } catch (error) {
      reportCallbackError(error, context, callbacks);
    }
  }

  private commit(running: RunningOperation) {
    if (running.committed) return;
    running.committed = true;
    const element = running.element;
    if (element === null) return;
    if (running.kind === 'remove') {
      try {
        if (running.detach === undefined) element.remove();
        else running.detach(element);
      } catch (error) {
        const context: EffectErrorContext = {
          operation: 'remove',
          element,
          overlay: null,
          removalId: running.removalId,
        };
        reportCallbackError(error, context, running.callbacks);
        this.cleanupStep(() => element.remove(), context, running.callbacks);
      }
      if (running.settled) return;
      const presentation = { effect: running.effect, sound: running.soundSelection };
      this.retained.associate(element, presentation);
      if (running.retain && running.removalId !== null) {
        this.retained.retain(running.removalId, element, presentation);
      }
    }
  }

  private prepareAudio(running: RunningOperation, context: EffectErrorContext): Promise<PreparedSound> {
    const signal = running.controller.signal;
    const requested = this.options.audioWaitTimeout;
    const timeout = typeof requested === 'number' && Number.isFinite(requested) ? Math.max(0, requested) : 1500;
    return new Promise((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (sound: PreparedSound, error?: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        if (error !== undefined && !signal.aborted) reportCallbackError(error, context, running.callbacks);
        resolve(sound);
      };
      const abort = () => finish(null);
      if (signal.aborted) return abort();
      signal.addEventListener('abort', abort, { once: true });
      // Capture can fail before audio answers. Completing that operation also
      // ends its wait, so a later timeout cannot report a second, unrelated error.
      void running.finished.then(abort);
      if (running.sound !== null && requested !== false) {
        timer = setTimeout(() => {
          finish(null, new Error(`Audio was not ready within ${timeout} ms; continuing without sound.`));
        }, timeout);
      }
      void this.sound.prepare(running.sound).then(
        (sound) => finish(sound),
        (error: unknown) => finish(null, error),
      );
    });
  }

  private resolveSound(
    operation: EffectOperationKind,
    selection: false | SoundSelection | undefined,
    override: OperationOptions['sound'],
  ) {
    if (override !== undefined) return override === false ? null : override;
    return soundForOperation(selection, operation);
  }

  private selectPhase(effect: EffectDefinition, kind: EffectOperationKind, ownerDocument: Document) {
    const phase = effect[kind];
    const fallback = this.fallback?.[kind] ?? null;
    if (phase.requires !== 'webgl2' || fallback === null) {
      return { phase, fallbackPhase: null, isFallback: false };
    }
    if (this.webgl2Available === null) this.webgl2Available = supportsWebGL2(ownerDocument);
    if (this.webgl2Available) return { phase, fallbackPhase: fallback, isFallback: false };
    return { phase: fallback, fallbackPhase: null, isFallback: true };
  }

  private createOverlay(rect: DOMRectReadOnly) {
    const overlay = document.createElement('div');
    overlay.setAttribute('aria-hidden', 'true');
    // `rect` is measured against the layout viewport while a fixed element is
    // placed against the visual one, and iOS separates the two whenever the page
    // is pinch-zoomed or the address bar is mid-collapse. The offset closes that
    // gap; without it the overlay lands off screen and the element simply
    // vanishes with no effect in sight. Measured on iOS 26: at scale 1.77 a
    // fixed box set to the element's own rect rendered 98px left and 288px above
    // it — exactly the visual viewport offset.
    const viewport = window.visualViewport;
    Object.assign(overlay.style, {
      height: `${rect.height}px`,
      isolation: 'isolate',
      left: `${rect.left + (viewport?.offsetLeft ?? 0)}px`,
      overflow: 'visible',
      pointerEvents: 'none',
      position: 'fixed',
      top: `${rect.top + (viewport?.offsetTop ?? 0)}px`,
      width: `${rect.width}px`,
      zIndex: `${this.options.zIndex ?? 2147483646}`,
    });
    return overlay;
  }

  private trackScroll(element: HTMLElement, overlay: HTMLElement) {
    const ancestors: Array<readonly [HTMLElement, number, number]> = [];
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      if (ancestor !== document.scrollingElement) ancestors.push([ancestor, ancestor.scrollLeft, ancestor.scrollTop]);
    }
    const initialX = window.scrollX;
    const initialY = window.scrollY;
    // Pinching, and panning inside a zoomed page, move the visual viewport
    // without scrolling the document, so those events have to be followed too.
    const viewport = window.visualViewport;
    const initialOffsetX = viewport?.offsetLeft ?? 0;
    const initialOffsetY = viewport?.offsetTop ?? 0;
    const update = () => {
      let x = initialX - window.scrollX + ((viewport?.offsetLeft ?? 0) - initialOffsetX);
      let y = initialY - window.scrollY + ((viewport?.offsetTop ?? 0) - initialOffsetY);
      for (const [ancestor, scrollLeft, scrollTop] of ancestors) {
        x += scrollLeft - ancestor.scrollLeft;
        y += scrollTop - ancestor.scrollTop;
      }
      overlay.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    };
    window.addEventListener('scroll', update, { passive: true });
    viewport?.addEventListener('scroll', update, { passive: true });
    viewport?.addEventListener('resize', update, { passive: true });
    for (const [ancestor] of ancestors) ancestor.addEventListener('scroll', update, { passive: true });
    return () => {
      window.removeEventListener('scroll', update);
      viewport?.removeEventListener('scroll', update);
      viewport?.removeEventListener('resize', update);
      for (const [ancestor] of ancestors) ancestor.removeEventListener('scroll', update);
    };
  }

  private createRandom() {
    const seedValue = this.options.random?.() ?? Math.random();
    let state = Math.floor(Math.min(1 - Number.EPSILON, Math.max(0, seedValue)) * 4294967296) >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  private resolveOverlayRoot() {
    return typeof this.options.overlayRoot === 'function'
      ? this.options.overlayRoot()
      : (this.options.overlayRoot ?? document.body);
  }

  private shouldReduceMotion() {
    return (
      (this.options.respectReducedMotion ?? true) &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  private assertAlive() {
    if (this.destroyed) throw new Error('This Disintegrator instance has been destroyed.');
  }

  private rejectedOperation(
    kind: EffectOperationKind,
    blockingOperation: Promise<EffectOperationResult>,
  ): EffectOperation {
    const result: EffectOperationResult = { operation: kind, status: 'rejected', removalId: null };
    return {
      operation: kind,
      removalId: null,
      finished: blockingOperation.then(() => result),
      cancel: noop,
    };
  }
}
