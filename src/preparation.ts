import type { ResolvedPreparationOptions } from './defaults';
import type { EffectOperationKind, SnapshotCapture, SnapshotCaptureContext } from './types';

interface PreparedSnapshot {
  readonly element: HTMLElement;
  readonly controller: AbortController;
  readonly width: number;
  readonly height: number;
  promise: Promise<HTMLCanvasElement>;
  snapshot: HTMLCanvasElement | null;
  pixels: number;
  cancelled: boolean;
  claimed: boolean;
}

interface MutationWatcher {
  readonly observer: MutationObserver;
  readonly onLoad: () => void;
}

const MUTATION_OPTIONS: MutationObserverInit = {
  attributes: true,
  characterData: true,
  childList: true,
  subtree: true,
};

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function disposeSnapshot(snapshot: HTMLCanvasElement | null) {
  if (snapshot === null) return;
  snapshot.width = 0;
  snapshot.height = 0;
  snapshot.remove();
}

export class SnapshotPreparation {
  private readonly prepared = new Map<HTMLElement, PreparedSnapshot>();
  private readonly registered = new Set<HTMLElement>();
  private readonly nearby = new Set<HTMLElement>();
  private readonly queue: HTMLElement[] = [];
  private readonly queued = new Set<HTMLElement>();
  private readonly mutationWatchers = new Map<HTMLElement, MutationWatcher>();
  private intersectionObserver: IntersectionObserver | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private cancelScheduled: (() => void) | null = null;
  private activeCaptures = 0;
  private cachedPixels = 0;
  private lastScrollAt = Number.NEGATIVE_INFINITY;
  private destroyed = false;

  constructor(
    private readonly capture: SnapshotCapture | undefined,
    private readonly options: ResolvedPreparationOptions,
    private readonly onError: (error: unknown, element: HTMLElement) => void,
  ) {}

  register(elements: readonly HTMLElement[]) {
    if (!this.options.enabled || this.destroyed) return () => undefined;
    for (const element of elements) this.registerElement(element);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      for (const element of elements) this.unregisterElement(element);
    };
  }

  async prepare(elements: readonly HTMLElement[]) {
    this.assertAlive();
    this.requireCapture();
    await Promise.all(
      elements.map(async (element) => {
        this.invalidateElement(element, false);
        const prepared = this.createPreparation(element);
        try {
          await prepared.promise;
        } catch (error) {
          if (!isAbortError(error)) this.onError(error, element);
        }
      }),
    );
  }

  invalidate(elements: readonly HTMLElement[]) {
    this.assertAlive();
    for (const element of elements) this.invalidateElement(element, true);
  }

  clear() {
    for (const element of [...this.prepared.keys()]) this.invalidateElement(element, false);
    this.queue.length = 0;
    this.queued.clear();
    this.cancelScheduled?.();
    this.cancelScheduled = null;
  }

  async take(
    element: HTMLElement,
    operation: EffectOperationKind,
    signal: AbortSignal,
    context: Pick<SnapshotCaptureContext, 'restoreRootOpacity'> = {},
  ) {
    this.assertAlive();
    const capture = this.requireCapture();
    const bounds = element.getBoundingClientRect();
    const existing = this.prepared.get(element);
    if (
      existing !== undefined &&
      Math.abs(existing.width - bounds.width) < 0.5 &&
      Math.abs(existing.height - bounds.height) < 0.5
    ) {
      this.prepared.delete(element);
      existing.claimed = true;
      if (existing.snapshot !== null) this.cachedPixels -= existing.pixels;
      return existing.promise;
    }
    if (existing !== undefined) this.invalidateElement(element, false);
    return Promise.resolve(capture(element, { operation, signal, ...context }));
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clear();
    this.intersectionObserver?.disconnect();
    this.resizeObserver?.disconnect();
    for (const [element, watcher] of this.mutationWatchers) {
      watcher.observer.disconnect();
      element.removeEventListener('load', watcher.onLoad, true);
    }
    this.mutationWatchers.clear();
    this.registered.clear();
    this.nearby.clear();
    document.removeEventListener('scroll', this.handleScroll, true);
  }

  private registerElement(element: HTMLElement) {
    if (this.registered.has(element)) return;
    this.registered.add(element);
    if (this.options.invalidateOnResize && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver ??= new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.target instanceof HTMLElement) this.invalidateElement(entry.target, true);
        }
      });
      this.resizeObserver.observe(element);
    }
    if (this.options.observeMutations && typeof MutationObserver !== 'undefined') this.watchMutations(element);

    if (this.options.strategy === 'visible-idle' && typeof IntersectionObserver !== 'undefined') {
      this.getIntersectionObserver().observe(element);
    } else {
      this.nearby.add(element);
      this.enqueue(element);
    }
    if (this.registered.size === 1 && this.options.strategy !== 'immediate') {
      document.addEventListener('scroll', this.handleScroll, { capture: true, passive: true });
    }
  }

  private unregisterElement(element: HTMLElement) {
    if (!this.registered.delete(element)) return;
    this.nearby.delete(element);
    this.queued.delete(element);
    const queueIndex = this.queue.indexOf(element);
    if (queueIndex !== -1) this.queue.splice(queueIndex, 1);
    this.intersectionObserver?.unobserve(element);
    this.resizeObserver?.unobserve(element);
    const watcher = this.mutationWatchers.get(element);
    watcher?.observer.disconnect();
    if (watcher !== undefined) element.removeEventListener('load', watcher.onLoad, true);
    this.mutationWatchers.delete(element);
    this.invalidateElement(element, false);
    if (this.registered.size === 0) {
      document.removeEventListener('scroll', this.handleScroll, true);
      this.intersectionObserver?.disconnect();
      this.intersectionObserver = null;
    }
  }

  private getIntersectionObserver() {
    this.intersectionObserver ??= new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!(entry.target instanceof HTMLElement) || !this.registered.has(entry.target)) continue;
          if (entry.isIntersecting) {
            this.nearby.add(entry.target);
            this.enqueue(entry.target);
          } else {
            this.nearby.delete(entry.target);
          }
        }
      },
      { root: this.options.root, rootMargin: this.options.rootMargin },
    );
    return this.intersectionObserver;
  }

  private watchMutations(element: HTMLElement) {
    const invalidate = () => this.invalidateElement(element, true);
    const observer = new MutationObserver(invalidate);
    observer.observe(element, MUTATION_OPTIONS);
    element.addEventListener('load', invalidate, true);
    this.mutationWatchers.set(element, { observer, onLoad: invalidate });
  }

  private invalidateElement(element: HTMLElement, reschedule: boolean) {
    const prepared = this.prepared.get(element);
    if (prepared !== undefined) {
      this.prepared.delete(element);
      prepared.cancelled = true;
      prepared.controller.abort();
      if (prepared.snapshot !== null) {
        this.cachedPixels -= prepared.pixels;
        disposeSnapshot(prepared.snapshot);
      }
    }
    if (reschedule && this.registered.has(element) && this.isEligible(element)) this.enqueue(element);
  }

  private enqueue(element: HTMLElement) {
    if (this.queued.has(element) || this.prepared.has(element) || !this.isEligible(element)) return;
    this.queued.add(element);
    this.queue.push(element);
    this.schedule();
  }

  private schedule() {
    if (this.destroyed || this.queue.length === 0 || this.activeCaptures >= this.options.concurrency) return;
    if (this.options.strategy === 'immediate') {
      this.drain();
      return;
    }
    if (this.cancelScheduled !== null) return;
    const run = () => {
      this.cancelScheduled = null;
      const remaining = this.options.scrollSettle - (performance.now() - this.lastScrollAt);
      if (remaining > 0) {
        const timeout = window.setTimeout(run, remaining);
        this.cancelScheduled = () => window.clearTimeout(timeout);
        return;
      }
      this.drain();
    };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(run, { timeout: this.options.idleTimeout });
      this.cancelScheduled = () => window.cancelIdleCallback(id);
    } else {
      const timeout = window.setTimeout(run, this.options.fallbackDelay);
      this.cancelScheduled = () => window.clearTimeout(timeout);
    }
  }

  private drain() {
    while (this.activeCaptures < this.options.concurrency) {
      const element = this.queue.shift();
      if (element === undefined) break;
      this.queued.delete(element);
      if (!this.isEligible(element) || this.prepared.has(element)) continue;
      this.activeCaptures += 1;
      void this.afterAnimations(element)
        .then(() => {
          if (!this.isEligible(element) || this.prepared.has(element)) return;
          return this.createPreparation(element).promise;
        })
        .catch((error: unknown) => {
          if (!isAbortError(error)) this.onError(error, element);
        })
        .finally(() => {
          this.activeCaptures -= 1;
          this.schedule();
        });
    }
  }

  private createPreparation(element: HTMLElement) {
    const capture = this.requireCapture();
    const rect = element.getBoundingClientRect();
    const controller = new AbortController();
    const prepared: PreparedSnapshot = {
      element,
      controller,
      width: rect.width,
      height: rect.height,
      promise: Promise.resolve(document.createElement('canvas')),
      snapshot: null,
      pixels: 0,
      cancelled: false,
      claimed: false,
    };
    prepared.promise = Promise.resolve(capture(element, { operation: 'prepare', signal: controller.signal }))
      .then((snapshot) => {
        if (prepared.cancelled) {
          disposeSnapshot(snapshot);
          throw new DOMException('Snapshot preparation was cancelled.', 'AbortError');
        }
        if (!prepared.claimed) {
          prepared.snapshot = snapshot;
          prepared.pixels = snapshot.width * snapshot.height;
          this.cachedPixels += prepared.pixels;
          this.touch(element, prepared);
          this.evict();
        }
        return snapshot;
      })
      .catch((error: unknown) => {
        if (this.prepared.get(element) === prepared) this.prepared.delete(element);
        throw error;
      });
    this.prepared.set(element, prepared);
    return prepared;
  }

  private touch(element: HTMLElement, prepared: PreparedSnapshot) {
    if (this.prepared.get(element) !== prepared) return;
    this.prepared.delete(element);
    this.prepared.set(element, prepared);
  }

  private evict() {
    while (this.cachedPixels > this.options.cachePixelBudget) {
      const oldest = this.prepared.entries().next().value;
      if (oldest === undefined) return;
      this.invalidateElement(oldest[0], false);
    }
  }

  private async afterAnimations(element: HTMLElement) {
    if (typeof element.getAnimations !== 'function') return;
    const animations = element.getAnimations({ subtree: true }).filter((animation) => {
      const iterations = animation.effect?.getComputedTiming().iterations;
      return animation.playState !== 'finished' && animation.playState !== 'paused' && Number.isFinite(iterations);
    });
    if (animations.length === 0) return;
    await Promise.race([
      Promise.allSettled(animations.map((animation) => animation.finished)),
      new Promise<void>((resolve) => window.setTimeout(resolve, this.options.animationSettle)),
    ]);
  }

  private isEligible(element: HTMLElement) {
    if (!element.isConnected || !this.registered.has(element)) return false;
    if (this.options.strategy === 'visible-idle' && !this.nearby.has(element)) return false;
    try {
      return this.options.shouldPrepare(element);
    } catch (error) {
      this.onError(error, element);
      return false;
    }
  }

  private requireCapture() {
    if (this.capture === undefined) throw new TypeError('This effect requires a capture(element) adapter.');
    return this.capture;
  }

  private readonly handleScroll = () => {
    this.lastScrollAt = performance.now();
  };

  private assertAlive() {
    if (this.destroyed) throw new Error('This Disintegrator instance has been destroyed.');
  }
}
