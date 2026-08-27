import { SoundPlayer } from './audio';
import {
  resolveLayout,
  resolveParticles,
  resolvePreparation,
  type ResolvedLayoutOptions,
  type ResolvedParticleOptions,
  type ResolvedPreparationOptions,
} from './defaults';
import type {
  CoreDisintegratorOptions,
  DisintegrateOptions,
  DisintegrateTarget,
  DisintegrationContext,
  DisintegrationHandle,
  EffectCallbacks,
} from './types';

const noop = () => undefined;
const resolvedPromise = Promise.resolve();
const SNAPSHOT_MUTATION_OPTIONS: MutationObserverInit = {
  subtree: true,
  childList: true,
  characterData: true,
  attributes: true,
  attributeFilter: ['class', 'src', 'srcset'],
};

interface PreparedSnapshot {
  element: HTMLElement;
  promise: Promise<HTMLCanvasElement> | null;
  cancelled: boolean;
}

interface MutationWatcher {
  observer: MutationObserver;
  handleLoad: () => void;
}

interface InternalOptions extends Omit<CoreDisintegratorOptions, 'particles' | 'layout' | 'preparation'> {
  particles: ResolvedParticleOptions;
  layout: ResolvedLayoutOptions;
  preparation: ResolvedPreparationOptions;
  respectReducedMotion: boolean;
  zIndex: number;
  random: () => number;
}

function combineCallbacks(base: EffectCallbacks, local: EffectCallbacks): Required<EffectCallbacks> {
  const reportCallbackError = (error: unknown, context: DisintegrationContext) => {
    try {
      base.onError?.(error, context);
      local.onError?.(error, context);
    } catch {
      // User callbacks must not break cleanup or the visual effect.
    }
  };

  const call =
    (
      baseCallback: ((context: DisintegrationContext) => void) | undefined,
      localCallback: ((context: DisintegrationContext) => void) | undefined,
    ) =>
    (context: DisintegrationContext) => {
      try {
        baseCallback?.(context);
        localCallback?.(context);
      } catch (error) {
        reportCallbackError(error, context);
      }
    };

  return {
    onTrigger: call(base.onTrigger, local.onTrigger),
    onStart: call(base.onStart, local.onStart),
    onComplete: call(base.onComplete, local.onComplete),
    onError: reportCallbackError,
  };
}

export class CoreDisintegrator {
  private readonly options: InternalOptions;
  private readonly sound: SoundPlayer;
  private readonly prepared = new Map<HTMLElement, PreparedSnapshot>();
  private readonly queue: PreparedSnapshot[] = [];
  private readonly observed = new Set<HTMLElement>();
  private readonly nearby = new Set<HTMLElement>();
  private readonly suspended = new Set<HTMLElement>();
  private readonly mutationWatchers = new Map<HTMLElement, MutationWatcher>();
  private readonly activeRestores = new Set<() => void>();
  private intersectionObserver: IntersectionObserver | null = null;
  private backgroundCaptureRunning = false;
  private cancelScheduledCapture: (() => void) | null = null;
  private lastScrollAt = Number.NEGATIVE_INFINITY;
  private destroyed = false;

  constructor(options: CoreDisintegratorOptions) {
    if (typeof options.capture !== 'function') throw new TypeError('A capture(element) function is required.');
    this.options = {
      ...options,
      particles: resolveParticles(options.particles),
      layout: resolveLayout(options.layout),
      preparation: resolvePreparation(options.preparation),
      respectReducedMotion: options.respectReducedMotion ?? true,
      zIndex: options.zIndex ?? 2147483646,
      random: options.random ?? Math.random,
    };
    this.sound = new SoundPlayer(options.sound ?? false, (error) => {
      this.reportBackgroundError(error, document.documentElement);
    });
  }

  /** Register one or more elements for idle snapshot preparation. */
  register(target: DisintegrateTarget | Iterable<HTMLElement>) {
    this.assertAlive();
    this.sound.preload();
    if (!this.options.preparation.enabled || this.shouldReduceMotion()) return noop;
    const elements = this.resolveElements(target);
    for (const element of elements) this.registerElement(element);

    let registered = true;
    return () => {
      if (!registered) return;
      registered = false;
      for (const element of elements) this.unregisterElement(element);
    };
  }

  /** Immediately create and cache snapshots for the supplied elements. */
  async prepare(target: DisintegrateTarget | Iterable<HTMLElement>) {
    this.assertAlive();
    if (this.shouldReduceMotion()) return;
    const captures = this.resolveElements(target).map((element) => {
      const preparation = this.createPreparation(element);
      this.pauseMutations(element);
      return this.startPreparation(preparation)
        .catch((error: unknown) => {
          this.reportBackgroundError(error, element);
        })
        .finally(() => {
          this.resumeMutations(element);
        });
    });
    this.sound.preload();
    await Promise.allSettled(captures);
  }

  /** Start the reversible disintegration effect. */
  async disintegrate(target: DisintegrateTarget, overrides: DisintegrateOptions = {}): Promise<DisintegrationHandle> {
    this.assertAlive();
    const element = this.resolveElement(target);
    const callbacks = combineCallbacks(this.options, overrides);
    const emptyContext: DisintegrationContext = { element, overlay: null };
    if (this.shouldReduceMotion()) return this.createSkippedHandle(element);

    const initialRect = element.getBoundingClientRect();
    if (initialRect.width <= 0 || initialRect.height <= 0) return this.createSkippedHandle(element);

    const previousPointerEvents = element.style.pointerEvents;
    const snapshotPromise = this.takeSnapshot(element);
    element.style.pointerEvents = 'none';
    callbacks.onTrigger(emptyContext);
    if (overrides.sound !== false) this.sound.unlock();

    try {
      const snapshot = await snapshotPromise;
      if (!element.isConnected) return this.createSkippedHandle(element);
      return this.startEffect(element, snapshot, previousPointerEvents, overrides, callbacks);
    } catch (error) {
      if (element.isConnected) {
        element.style.pointerEvents = previousPointerEvents;
        this.resumePreparation(element);
      }
      callbacks.onError(error, emptyContext);
      return this.createSkippedHandle(element);
    }
  }

  /** Disintegrate an element and remove it from the DOM once the overlay is ready. */
  async remove(target: DisintegrateTarget, overrides: DisintegrateOptions = {}) {
    const handle = await this.disintegrate(target, overrides);
    if (handle.element.isConnected) handle.element.remove();
    return handle;
  }

  preloadSound() {
    this.sound.preload();
  }

  /** Discard cached snapshots and schedule fresh ones for registered nearby elements. */
  invalidate(target: DisintegrateTarget | Iterable<HTMLElement>) {
    this.assertAlive();
    for (const element of this.resolveElements(target)) {
      this.discardPreparation(element);
      if (this.nearby.has(element) && !this.suspended.has(element)) this.prepareSnapshot(element);
    }
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const restore of [...this.activeRestores]) restore();
    for (const element of [...this.observed]) this.unregisterElement(element);
    for (const [element, watcher] of this.mutationWatchers) {
      watcher.observer.disconnect();
      element.removeEventListener('load', watcher.handleLoad, true);
    }
    this.mutationWatchers.clear();
    this.intersectionObserver?.disconnect();
    this.intersectionObserver = null;
    this.cancelScheduledCapture?.();
    this.cancelScheduledCapture = null;
    this.queue.length = 0;
    this.prepared.clear();
    this.nearby.clear();
    this.suspended.clear();
    document.removeEventListener('scroll', this.handleScroll, true);
    this.sound.destroy();
  }

  private startEffect(
    element: HTMLElement,
    snapshot: HTMLCanvasElement,
    previousPointerEvents: string,
    overrides: DisintegrateOptions,
    callbacks: Required<EffectCallbacks>,
  ): DisintegrationHandle {
    const rect = element.getBoundingClientRect();
    const overlay = this.createOverlay(rect);
    const context: DisintegrationContext = { element, overlay };
    const frames = this.generateFrames(snapshot);
    if (frames.length === 0) {
      element.style.pointerEvents = previousPointerEvents;
      this.resumePreparation(element);
      return this.createSkippedHandle(element);
    }

    for (const frame of frames) {
      Object.assign(frame.style, {
        position: 'absolute',
        inset: '0',
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        willChange: 'transform, opacity',
      });
      overlay.appendChild(frame);
    }

    this.resolveOverlayRoot().appendChild(overlay);
    const layout = overrides.layout === undefined ? this.options.layout : resolveLayout(overrides.layout);
    const layoutState = this.captureLayout(element, layout);
    callbacks.onStart(context);
    const stopSound =
      overrides.sound === false
        ? noop
        : this.sound.play((this.options.particles.duration + this.options.particles.stagger) / 1000);
    const particleAnimations = this.animateParticles(frames);
    const particlesFinished = Promise.allSettled(particleAnimations.map((animation) => animation.finished)).then(() => {
      overlay.remove();
    });

    const previousDisplay = element.style.display;
    element.style.display = 'none';
    const { animations: layoutAnimations, restoreContainerStyles } = this.animateLayout(layoutState, layout);
    const layoutFinished = Promise.allSettled(layoutAnimations.map((animation) => animation.finished)).then(() => {
      restoreContainerStyles();
    });

    let active = true;
    const cleanupAnimations = () => {
      for (const animation of particleAnimations) animation.cancel();
      for (const animation of layoutAnimations) animation.cancel();
      stopSound();
      overlay.remove();
      restoreContainerStyles();
    };
    const restore = () => {
      if (!active) return;
      active = false;
      cleanupAnimations();
      this.activeRestores.delete(restore);
      if (element.isConnected) {
        element.style.display = previousDisplay;
        element.style.pointerEvents = previousPointerEvents;
        this.resumePreparation(element);
      }
    };
    const cancel = () => {
      if (!active) return;
      active = false;
      cleanupAnimations();
      this.activeRestores.delete(restore);
    };
    this.activeRestores.add(restore);

    const finished = Promise.all([particlesFinished, layoutFinished]).then(() => {
      if (!active) return;
      active = false;
      this.activeRestores.delete(restore);
      callbacks.onComplete(context);
    });

    return {
      element,
      status: 'running',
      particlesFinished,
      layoutFinished,
      finished,
      cancel,
      restore,
    };
  }

  private createOverlay(rect: DOMRect) {
    const overlay = document.createElement('div');
    overlay.setAttribute('aria-hidden', 'true');
    Object.assign(overlay.style, {
      contain: 'strict',
      height: `${rect.height}px`,
      isolation: 'isolate',
      left: `${rect.left}px`,
      pointerEvents: 'none',
      position: 'fixed',
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      zIndex: `${this.options.zIndex}`,
    });
    return overlay;
  }

  private generateFrames(source: HTMLCanvasElement) {
    const context = source.getContext('2d');
    if (context === null) return [];
    const { width, height } = source;
    const original = context.getImageData(0, 0, width, height);
    const originalPixels = new Uint32Array(
      original.data.buffer,
      original.data.byteOffset,
      original.data.byteLength / Uint32Array.BYTES_PER_ELEMENT,
    );
    const frames = Array.from({ length: this.options.particles.frames }, () => {
      const data = context.createImageData(width, height);
      return {
        data,
        pixels: new Uint32Array(
          data.data.buffer,
          data.data.byteOffset,
          data.data.byteLength / Uint32Array.BYTES_PER_ELEMENT,
        ),
      };
    });

    for (let x = 0; x < width; x += 1) {
      const progress = this.getColumnProgress(x, width);
      for (let y = 0; y < height; y += 1) {
        const pixelIndex = y * width + x;
        if (original.data[pixelIndex * 4 + 3] === 0) continue;
        for (let repetition = 0; repetition < this.options.particles.repetitions; repetition += 1) {
          const frameIndex = Math.min(
            frames.length - 1,
            Math.floor((frames.length * (this.options.random() + 2 * progress)) / 3),
          );
          const frame = frames[frameIndex];
          if (frame !== undefined) frame.pixels[pixelIndex] = originalPixels[pixelIndex] ?? 0;
        }
      }
    }

    return frames.map(({ data }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')?.putImageData(data, 0, 0);
      return canvas;
    });
  }

  private animateParticles(frames: HTMLCanvasElement[]) {
    const particles = this.options.particles;
    return frames.map((frame, index) => {
      const driftX = particles.horizontalDrift * (this.options.random() - 0.5);
      const riseY = -(particles.rise[0] + this.options.random() * (particles.rise[1] - particles.rise[0]));
      const rotation = particles.rotation * (this.options.random() - 0.5);
      return frame.animate(
        [
          { opacity: 1, transform: 'translate3d(0, 0, 0) rotate(0deg)' },
          {
            offset: 0.45,
            opacity: 0.85,
            transform: `translate3d(${driftX * 0.3}px, ${riseY * 0.35}px, 0) rotate(${rotation * 0.35}deg)`,
          },
          {
            opacity: 0,
            transform: `translate3d(${driftX}px, ${riseY}px, 0) rotate(${rotation}deg) scale(${particles.endScale})`,
          },
        ],
        {
          duration: particles.duration,
          delay: (particles.stagger * index) / frames.length,
          easing: particles.easing,
          fill: 'forwards',
        },
      );
    });
  }

  private captureLayout(element: HTMLElement, layout: ResolvedLayoutOptions) {
    const container = this.resolveLayoutContainer(element, layout);
    if (!layout.enabled || container === null) return { container: null, initialHeight: 0, siblings: [] };
    const siblings = this.resolveLayoutSiblings(element, container, layout);
    return {
      container,
      initialHeight: container.getBoundingClientRect().height,
      siblings: siblings.map((sibling) => ({ sibling, rect: sibling.getBoundingClientRect() })),
    };
  }

  private animateLayout(state: ReturnType<CoreDisintegrator['captureLayout']>, layout: ResolvedLayoutOptions) {
    const animations: Animation[] = [];
    const container = state.container;
    if (!layout.enabled || container === null || typeof container.animate !== 'function') {
      return { animations, restoreContainerStyles: noop };
    }

    for (const { sibling, rect: previousRect } of state.siblings) {
      const currentRect = sibling.getBoundingClientRect();
      const deltaX = previousRect.left - currentRect.left;
      const deltaY = previousRect.top - currentRect.top;
      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) continue;
      animations.push(
        sibling.animate(
          [{ transform: `translate3d(${deltaX}px, ${deltaY}px, 0)` }, { transform: 'translate3d(0, 0, 0)' }],
          {
            duration: layout.duration,
            easing: layout.easing,
          },
        ),
      );
    }

    const previousAlignContent = container.style.alignContent;
    const display = getComputedStyle(container).display;
    if (display.includes('grid')) container.style.alignContent = 'start';
    const restoreContainerStyles = () => {
      container.style.alignContent = previousAlignContent;
    };

    if (layout.animateContainer) {
      const finalHeight = container.getBoundingClientRect().height;
      if (Math.abs(state.initialHeight - finalHeight) >= 0.5) {
        animations.push(
          container.animate([{ height: `${state.initialHeight}px` }, { height: `${finalHeight}px` }], {
            duration: layout.duration,
            easing: layout.easing,
          }),
        );
      }
    }
    return { animations, restoreContainerStyles };
  }

  private resolveLayoutContainer(element: HTMLElement, layout: ResolvedLayoutOptions) {
    if (layout.container instanceof HTMLElement) return layout.container;
    if (typeof layout.container === 'function') return layout.container(element);
    return element.parentElement;
  }

  private resolveLayoutSiblings(element: HTMLElement, container: HTMLElement, layout: ResolvedLayoutOptions) {
    if (typeof layout.siblings === 'function') return layout.siblings(element, container);
    const children = Array.from(container.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement && child !== element,
    );
    if (layout.siblings === 'all') return children;
    const following: HTMLElement[] = [];
    for (let sibling = element.nextElementSibling; sibling; sibling = sibling.nextElementSibling) {
      if (sibling instanceof HTMLElement) following.push(sibling);
    }
    return following;
  }

  private getColumnProgress(x: number, width: number) {
    if (this.options.particles.origin === 'random') return this.options.random();
    const progress = x / Math.max(1, width);
    return this.options.particles.origin === 'right' ? 1 - progress : progress;
  }

  private registerElement(element: HTMLElement) {
    if (this.observed.has(element)) return;
    this.observed.add(element);
    if (typeof IntersectionObserver === 'undefined') {
      this.startPreparingNearby(element);
    } else {
      this.getIntersectionObserver().observe(element);
    }
    if (this.observed.size === 1)
      document.addEventListener('scroll', this.handleScroll, { capture: true, passive: true });
  }

  private unregisterElement(element: HTMLElement) {
    if (!this.observed.has(element)) return;
    this.intersectionObserver?.unobserve(element);
    this.observed.delete(element);
    this.suspended.delete(element);
    this.stopPreparingNearby(element);
    if (this.observed.size === 0) {
      document.removeEventListener('scroll', this.handleScroll, true);
      this.intersectionObserver?.disconnect();
      this.intersectionObserver = null;
    }
  }

  private getIntersectionObserver() {
    this.intersectionObserver ??= new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!(entry.target instanceof HTMLElement) || !this.observed.has(entry.target)) continue;
          if (entry.isIntersecting && !this.suspended.has(entry.target)) this.startPreparingNearby(entry.target);
          else this.stopPreparingNearby(entry.target);
        }
      },
      {
        root: this.options.preparation.root,
        rootMargin: `${this.options.preparation.margin}px 0px`,
      },
    );
    return this.intersectionObserver;
  }

  private startPreparingNearby(element: HTMLElement) {
    this.nearby.add(element);
    this.watchMutations(element);
    this.prepareSnapshot(element);
  }

  private stopPreparingNearby(element: HTMLElement) {
    this.nearby.delete(element);
    this.stopWatchingMutations(element);
    this.discardPreparation(element);
  }

  private watchMutations(element: HTMLElement) {
    if (!this.options.preparation.observeMutations || this.mutationWatchers.has(element)) return;
    const invalidate = () => {
      if (!this.nearby.has(element) || this.suspended.has(element) || !element.isConnected) return;
      this.discardPreparation(element);
      this.prepareSnapshot(element);
    };
    const observer = new MutationObserver(invalidate);
    observer.observe(element, SNAPSHOT_MUTATION_OPTIONS);
    element.addEventListener('load', invalidate, true);
    this.mutationWatchers.set(element, { observer, handleLoad: invalidate });
  }

  private stopWatchingMutations(element: HTMLElement) {
    const watcher = this.mutationWatchers.get(element);
    watcher?.observer.disconnect();
    if (watcher !== undefined) element.removeEventListener('load', watcher.handleLoad, true);
    this.mutationWatchers.delete(element);
  }

  private pauseMutations(element: HTMLElement) {
    this.mutationWatchers.get(element)?.observer.disconnect();
  }

  private resumeMutations(element: HTMLElement) {
    if (!this.nearby.has(element)) return;
    this.mutationWatchers.get(element)?.observer.observe(element, SNAPSHOT_MUTATION_OPTIONS);
  }

  private prepareSnapshot(element: HTMLElement) {
    if (!element.isConnected || !this.nearby.has(element) || this.suspended.has(element) || this.prepared.has(element))
      return;
    const preparation = this.createPreparation(element);
    this.queue.push(preparation);
    this.scheduleNextPreparation();
  }

  private createPreparation(element: HTMLElement) {
    this.discardPreparation(element);
    const preparation: PreparedSnapshot = { element, promise: null, cancelled: false };
    this.prepared.set(element, preparation);
    return preparation;
  }

  private startPreparation(preparation: PreparedSnapshot) {
    preparation.promise ??= this.options.capture(preparation.element).catch((error: unknown) => {
      this.discard(preparation);
      throw error;
    });
    return preparation.promise;
  }

  private discardPreparation(element: HTMLElement) {
    const preparation = this.prepared.get(element);
    if (preparation !== undefined) this.discard(preparation);
  }

  private discard(preparation: PreparedSnapshot) {
    preparation.cancelled = true;
    if (this.prepared.get(preparation.element) === preparation) this.prepared.delete(preparation.element);
    const index = this.queue.indexOf(preparation);
    if (index !== -1) this.queue.splice(index, 1);
    if (this.queue.length === 0 && !this.backgroundCaptureRunning) {
      this.cancelScheduledCapture?.();
      this.cancelScheduledCapture = null;
    }
  }

  private takeSnapshot(element: HTMLElement) {
    const preparation = this.prepared.get(element);
    this.suspended.add(element);
    this.stopPreparingNearby(element);
    return preparation?.promise ?? this.options.capture(element);
  }

  private resumePreparation(element: HTMLElement) {
    this.suspended.delete(element);
    if (!this.observed.has(element) || !element.isConnected || !this.isNearViewport(element)) return;
    this.startPreparingNearby(element);
  }

  private scheduleNextPreparation() {
    if (this.backgroundCaptureRunning || this.cancelScheduledCapture !== null || this.queue.length === 0) return;
    const idleWindow = window;
    if (idleWindow.requestIdleCallback !== undefined) {
      const requestId = idleWindow.requestIdleCallback(this.runScheduledPreparation, {
        timeout: this.options.preparation.idleTimeout,
      });
      this.cancelScheduledCapture = () => idleWindow.cancelIdleCallback?.(requestId);
    } else {
      const timeout = window.setTimeout(this.runScheduledPreparation, this.options.preparation.fallbackDelay);
      this.cancelScheduledCapture = () => window.clearTimeout(timeout);
    }
  }

  private readonly runScheduledPreparation = () => {
    this.cancelScheduledCapture = null;
    if (this.backgroundCaptureRunning || this.queue.length === 0) return;
    const settleDelay = this.options.preparation.scrollSettle - (performance.now() - this.lastScrollAt);
    if (settleDelay > 0) {
      const timeout = window.setTimeout(this.runScheduledPreparation, settleDelay);
      this.cancelScheduledCapture = () => window.clearTimeout(timeout);
      return;
    }
    this.startNextPreparation();
  };

  private startNextPreparation() {
    const preparation = this.getNextPreparation();
    if (preparation === null) return;
    this.backgroundCaptureRunning = true;
    const finish = () => {
      this.backgroundCaptureRunning = false;
      this.scheduleNextPreparation();
    };
    const capture = () => {
      if (!this.canPrepare(preparation)) {
        finish();
        return;
      }
      this.pauseMutations(preparation.element);
      void this.startPreparation(preparation)
        .catch((error: unknown) => {
          this.reportBackgroundError(error, preparation.element);
        })
        .finally(() => {
          this.resumeMutations(preparation.element);
          finish();
        });
    };
    this.afterFiniteAnimations(preparation.element, capture);
  }

  private getNextPreparation() {
    let preparation = this.queue.shift();
    while (preparation !== undefined && (preparation.promise !== null || !this.canPrepare(preparation)))
      preparation = this.queue.shift();
    return preparation ?? null;
  }

  private canPrepare(preparation: PreparedSnapshot) {
    return (
      !preparation.cancelled &&
      preparation.element.isConnected &&
      this.nearby.has(preparation.element) &&
      !this.suspended.has(preparation.element) &&
      this.prepared.get(preparation.element) === preparation
    );
  }

  private afterFiniteAnimations(element: HTMLElement, callback: () => void) {
    const animations = element.getAnimations({ subtree: true }).filter((animation) => {
      const iterations = animation.effect?.getComputedTiming().iterations;
      return animation.playState !== 'finished' && animation.playState !== 'paused' && Number.isFinite(iterations);
    });
    if (animations.length === 0) {
      callback();
      return;
    }
    let completed = false;
    const finish = () => {
      if (completed) return;
      completed = true;
      window.clearTimeout(timeout);
      callback();
    };
    const timeout = window.setTimeout(finish, this.options.preparation.animationSettle);
    void Promise.allSettled(animations.map((animation) => animation.finished)).then(finish);
  }

  private readonly handleScroll = () => {
    this.lastScrollAt = performance.now();
  };

  private isNearViewport(element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    const margin = this.options.preparation.margin;
    return (
      rect.bottom >= -margin &&
      rect.top <= window.innerHeight + margin &&
      rect.right >= 0 &&
      rect.left <= window.innerWidth
    );
  }

  private resolveOverlayRoot() {
    if (typeof this.options.overlayRoot === 'function') return this.options.overlayRoot();
    return this.options.overlayRoot ?? document.body;
  }

  private resolveElement(target: DisintegrateTarget) {
    if (target instanceof HTMLElement) return target;
    const element = document.querySelector<HTMLElement>(target);
    if (element === null) throw new TypeError(`No HTMLElement matches selector: ${target}`);
    return element;
  }

  private resolveElements(target: DisintegrateTarget | Iterable<HTMLElement>) {
    if (target instanceof HTMLElement) return [target];
    if (typeof target === 'string') return Array.from(document.querySelectorAll<HTMLElement>(target));
    return Array.from(target).filter((element): element is HTMLElement => element instanceof HTMLElement);
  }

  private shouldReduceMotion() {
    return this.options.respectReducedMotion && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  private createSkippedHandle(element: HTMLElement): DisintegrationHandle {
    return {
      element,
      status: 'skipped',
      particlesFinished: resolvedPromise,
      layoutFinished: resolvedPromise,
      finished: resolvedPromise,
      cancel: noop,
      restore: noop,
    };
  }

  private reportBackgroundError(error: unknown, element: HTMLElement) {
    try {
      this.options.onError?.(error, { element, overlay: null });
    } catch {
      // User callbacks must not break audio cleanup or the preparation queue.
    }
  }

  private assertAlive() {
    if (this.destroyed) throw new Error('This Disintegrator instance has been destroyed.');
  }
}

export type { CoreDisintegratorOptions, DisintegrateOptions, DisintegrationHandle, LayoutOptions } from './types';
