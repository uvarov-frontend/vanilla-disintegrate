import { SoundPlayer } from './audio';
import { resolveLayout } from './defaults';
import { LayoutAnimator, type LayoutPlayback } from './layout';
import { disposeSnapshot, SnapshotPreparation } from './preparation';
import { RetainedElements } from './retained-elements';
import type {
  AnimationContext,
  AnimationPlayback,
  AnimationResult,
  EffectCallbacks,
  EffectContext,
  EffectDefinition,
  EffectOperation,
  EffectOperationKind,
  EffectOperationResult,
  EffectOperationStatus,
  DisintegratorOptions,
  OperationOptions,
  RemovalId,
  RemoveOptions,
  SoundDefinition,
} from './types';

const noop: () => void = () => undefined;

function concealForRestore(element: HTMLElement) {
  const animation = element.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 1, fill: 'both' });
  animation.pause();
  animation.currentTime = 0;
  return () => animation.cancel();
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
  readonly callbacks: readonly EffectCallbacks[];
  readonly controller: AbortController;
  committed: boolean;
  settled: boolean;
  cancelVisual: () => void;
  finish: (status: EffectOperationStatus) => void;
}

interface RunOptions {
  readonly kind: EffectOperationKind;
  readonly element: HTMLElement;
  readonly effect: EffectDefinition;
  readonly removalId: RemovalId | null;
  readonly overrides: OperationOptions | RemoveOptions;
}

function reportCallbackError(error: unknown, context: EffectContext, callbacks: readonly EffectCallbacks[]) {
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
  private readonly sound = new SoundPlayer();
  private readonly layout = new LayoutAnimator();
  private readonly active = new Set<RunningOperation>();
  private readonly busy = new WeakSet<HTMLElement>();
  private destroyed = false;

  constructor(
    private readonly options: DisintegratorOptions,
    private readonly preparation: SnapshotPreparation,
    private readonly retained: RetainedElements,
  ) {}

  run(options: RunOptions): EffectOperation {
    this.assertAlive();
    const { element, effect, kind, removalId, overrides } = options;
    const retain = kind === 'remove' && (overrides as RemoveOptions).retain === true;
    const callbacks = [this.options, overrides] as const;
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
      callbacks,
      controller: new AbortController(),
      committed: false,
      settled: false,
      cancelVisual: noop,
      finish: (status) => {
        if (running.settled) return;
        running.settled = true;
        running.cancelVisual = noop;
        const activeElement = running.element;
        if (activeElement !== null) this.busy.delete(activeElement);
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
        running.cancelVisual();
        this.commit(running);
        running.finish('cancelled');
      },
    };

    if (this.busy.has(element)) {
      this.commit(running);
      running.finish('skipped');
      return operation;
    }
    this.busy.add(element);
    this.active.add(running);
    void this.start(running, overrides, callbacks);
    return operation;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const operation of [...this.active]) {
      operation.controller.abort();
      operation.cancelVisual();
      this.commit(operation);
      operation.finish('cancelled');
    }
    this.sound.destroy();
  }

  private async start(
    running: RunningOperation,
    overrides: OperationOptions | RemoveOptions,
    callbacks: readonly EffectCallbacks[],
  ) {
    const element = running.element;
    if (element === null) return;
    const phase = running.effect[running.kind];
    const rect = element.getBoundingClientRect();
    const emptyContext: EffectContext = {
      operation: running.kind,
      element,
      overlay: null,
      removalId: running.removalId,
    };
    runCallback('onTrigger', emptyContext, callbacks);

    if (!element.isConnected || rect.width <= 0 || rect.height <= 0 || this.shouldReduceMotion()) {
      this.commit(running);
      running.finish('skipped');
      return;
    }

    const previousPointerEvents = element.style.pointerEvents;
    const restoreRootOpacity = running.kind === 'restore' ? getComputedStyle(element).opacity || '1' : undefined;
    const reveal = running.kind === 'restore' ? concealForRestore(element) : noop;
    element.style.pointerEvents = 'none';
    running.cancelVisual = () => {
      element.style.pointerEvents = previousPointerEvents;
      reveal();
    };
    let snapshot: HTMLCanvasElement | null = null;

    try {
      if (phase.needsSnapshot ?? true) {
        snapshot = await this.preparation.take(
          element,
          running.kind,
          running.controller.signal,
          restoreRootOpacity === undefined ? {} : { restoreRootOpacity },
        );
      } else if (running.kind === 'restore') {
        // Let same-turn DOM updates settle before measuring the element's final insertion geometry.
        await Promise.resolve();
      }
      if (running.settled) {
        disposeSnapshot(snapshot);
        return;
      }
      if (!element.isConnected) throw new Error('The target element was disconnected before the effect started.');
      const currentRect = element.getBoundingClientRect();
      if (currentRect.width <= 0 || currentRect.height <= 0) {
        throw new Error('The target element became unmeasurable before the effect started.');
      }
      await this.play(running, overrides, callbacks, currentRect, snapshot, previousPointerEvents, reveal);
    } catch (error) {
      disposeSnapshot(snapshot);
      if (running.settled) return;
      reportCallbackError(error, emptyContext, callbacks);
      element.style.pointerEvents = previousPointerEvents;
      reveal();
      this.commit(running);
      running.finish('skipped');
    }
  }

  private async play(
    running: RunningOperation,
    overrides: OperationOptions | RemoveOptions,
    callbacks: readonly EffectCallbacks[],
    bounds: DOMRectReadOnly,
    snapshot: HTMLCanvasElement | null,
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
      random: this.createRandom(),
      addCleanup: (cleanup) => cleanups.add(cleanup),
    };

    let animation: NormalizedAnimation | null = null;
    let layout: LayoutPlayback = { finished: Promise.resolve(), cancel: noop };
    let stopSound = noop;
    let stopScroll = noop;
    let cleaned = false;
    const cleanup = (cancel: boolean) => {
      if (cleaned) return;
      cleaned = true;
      if (cancel) {
        try {
          animation?.cancel();
          layout.cancel();
        } catch (error) {
          reportCallbackError(error, context, callbacks);
        }
      }
      try {
        animation?.dispose();
        for (const dispose of cleanups) dispose();
      } catch (error) {
        reportCallbackError(error, context, callbacks);
      }
      stopSound();
      stopScroll();
      overlay.remove();
      disposeSnapshot(snapshot);
    };
    running.cancelVisual = () => {
      cleanup(true);
      if (running.kind === 'restore') {
        reveal();
        element.style.pointerEvents = previousPointerEvents;
      }
    };

    try {
      const layoutOptions = resolveLayout(
        running.kind === 'remove' ? ((overrides as RemoveOptions).layout ?? this.options.layout) : false,
      );
      const layoutSnapshot = this.layout.capture(element, layoutOptions);
      animation = normalizeAnimation(running.effect[running.kind].animate(animationContext), overlay);
      if (animation === null) throw new Error('The selected effect did not create an animation.');
      this.resolveOverlayRoot().appendChild(overlay);
      stopScroll = this.trackScroll(element, overlay);
      if (running.kind === 'remove') element.style.pointerEvents = previousPointerEvents;
      this.commit(running);
      layout = this.layout.play(layoutSnapshot, layoutOptions, animation.layoutDelay);
      runCallback('onStart', context, callbacks);
      stopSound = this.sound.play(
        this.resolveSound(running.effect[running.kind].sound ?? null, overrides.sound),
        animation.duration / 1000,
        { operation: running.kind, element, signal: running.controller.signal },
        (error) => reportCallbackError(error, context, callbacks),
      );
    } catch (error) {
      cleanup(true);
      throw error;
    }

    let resolveAbort: () => void = noop;
    const aborted = new Promise<void>((resolve) => {
      resolveAbort = resolve;
    });
    running.controller.signal.addEventListener('abort', resolveAbort, { once: true });
    await Promise.race([Promise.all([animation.finished, layout.finished]), aborted]);
    running.controller.signal.removeEventListener('abort', resolveAbort);
    if (running.settled) return;
    cleanup(false);
    if (running.kind === 'restore') {
      reveal();
      element.style.pointerEvents = previousPointerEvents;
    }
    runCallback('onComplete', context, callbacks);
    running.finish('completed');
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
        reportCallbackError(
          error,
          { operation: 'remove', element, overlay: null, removalId: running.removalId },
          running.callbacks,
        );
        element.remove();
      }
      this.retained.associate(element, running.effect);
      if (running.retain && running.removalId !== null) {
        this.retained.retain(running.removalId, element, running.effect);
      }
    }
  }

  private resolveSound(phaseSound: SoundDefinition | null, override: OperationOptions['sound']) {
    const selection = override ?? this.options.sound ?? false;
    if (selection === false) return null;
    if (selection === true) return phaseSound;
    return selection;
  }

  private createOverlay(rect: DOMRectReadOnly) {
    const overlay = document.createElement('div');
    overlay.setAttribute('aria-hidden', 'true');
    Object.assign(overlay.style, {
      height: `${rect.height}px`,
      isolation: 'isolate',
      left: `${rect.left}px`,
      overflow: 'visible',
      pointerEvents: 'none',
      position: 'fixed',
      top: `${rect.top}px`,
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
    const update = () => {
      let x = initialX - window.scrollX;
      let y = initialY - window.scrollY;
      for (const [ancestor, scrollLeft, scrollTop] of ancestors) {
        x += scrollLeft - ancestor.scrollLeft;
        y += scrollTop - ancestor.scrollTop;
      }
      overlay.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    };
    window.addEventListener('scroll', update, { passive: true });
    for (const [ancestor] of ancestors) ancestor.addEventListener('scroll', update, { passive: true });
    return () => {
      window.removeEventListener('scroll', update);
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
}
