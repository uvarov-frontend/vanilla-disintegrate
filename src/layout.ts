import type { ResolvedLayoutOptions } from './defaults';

const noop = () => undefined;

interface SiblingPosition {
  readonly element: HTMLElement;
  readonly left: number;
  readonly top: number;
}

interface LayoutSnapshot {
  readonly container: HTMLElement | null;
  readonly height: number;
  readonly siblings: readonly SiblingPosition[];
}

export interface LayoutPlayback {
  readonly finished: Promise<void>;
  cancel(): void;
}

interface ActiveLayout {
  readonly animations: readonly Animation[];
  finish(): void;
}

function resolveContainer(element: HTMLElement, options: ResolvedLayoutOptions) {
  if (options.container instanceof HTMLElement) return options.container;
  if (typeof options.container === 'function') return options.container(element);
  return element.parentElement;
}

function resolveSiblings(element: HTMLElement, container: HTMLElement, options: ResolvedLayoutOptions) {
  if (typeof options.siblings === 'function') return options.siblings(element, container);
  const children = Array.from(container.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement && child !== element,
  );
  if (options.siblings === 'all') return children;
  return children.filter((child) => element.compareDocumentPosition(child) & Node.DOCUMENT_POSITION_FOLLOWING);
}

export class LayoutAnimator {
  private readonly active = new WeakMap<HTMLElement, ActiveLayout>();

  capture(element: HTMLElement, options: ResolvedLayoutOptions): LayoutSnapshot {
    const container = resolveContainer(element, options);
    if (!options.enabled || container === null) return { container: null, height: 0, siblings: [] };

    const containerRect = container.getBoundingClientRect();
    const siblings = resolveSiblings(element, container, options).map((sibling) => {
      const rect = sibling.getBoundingClientRect();
      return {
        element: sibling,
        left: rect.left - containerRect.left,
        top: rect.top - containerRect.top,
      };
    });
    this.finish(container);
    return { container, height: containerRect.height, siblings };
  }

  play(snapshot: LayoutSnapshot, options: ResolvedLayoutOptions, delay: number): LayoutPlayback {
    const container = snapshot.container;
    if (!options.enabled || container === null || typeof container.animate !== 'function') {
      return { finished: Promise.resolve(), cancel: noop };
    }

    const animations: Animation[] = [];
    const previousAlignContent = container.style.alignContent;
    const isGrid = getComputedStyle(container).display.includes('grid');
    if (isGrid) container.style.alignContent = 'start';
    const finalContainerRect = container.getBoundingClientRect();

    const animationOptions: KeyframeAnimationOptions = {
      duration: options.duration,
      easing: options.easing,
      ...(delay > 0 ? { delay, fill: 'backwards' } : {}),
    };

    try {
      for (const previous of snapshot.siblings) {
        const rect = previous.element.getBoundingClientRect();
        const deltaX = previous.left - (rect.left - finalContainerRect.left);
        const deltaY = previous.top - (rect.top - finalContainerRect.top);
        if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) continue;
        animations.push(
          previous.element.animate(
            [{ transform: `translate3d(${deltaX}px, ${deltaY}px, 0)` }, { transform: 'translate3d(0, 0, 0)' }],
            animationOptions,
          ),
        );
      }

      if (options.animateContainer && Math.abs(snapshot.height - finalContainerRect.height) >= 0.5) {
        animations.push(
          container.animate(
            [{ height: `${snapshot.height}px` }, { height: `${finalContainerRect.height}px` }],
            animationOptions,
          ),
        );
      }
    } catch (error) {
      for (const animation of animations) animation.cancel();
      container.style.alignContent = previousAlignContent;
      throw error;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (this.active.get(container) === activeLayout) this.active.delete(container);
      container.style.alignContent = previousAlignContent;
    };
    const activeLayout: ActiveLayout = { animations, finish };
    this.active.set(container, activeLayout);
    const finished = Promise.allSettled(animations.map((animation) => animation.finished)).then(finish);

    return {
      finished,
      cancel: () => {
        for (const animation of animations) animation.cancel();
        finish();
      },
    };
  }

  private finish(container: HTMLElement) {
    const active = this.active.get(container);
    if (active === undefined) return;
    this.active.delete(container);
    for (const animation of active.animations) animation.cancel();
    active.finish();
  }
}
