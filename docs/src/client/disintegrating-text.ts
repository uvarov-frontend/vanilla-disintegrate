import Disintegrator, { createParticleEffect } from '../../../src/index';
import type { DisintegratorBaseOptions, EffectOperation, ParticleOptions, RemovalId } from '../../../src/types';
import { createResidentGlyphCapture, mountResidentGlyph, type ResidentGlyph } from './glyph-capture';

const PAUSE = 200;
const STEP = 320;
const REDRAW_SETTLE = 120;
const sharedParticleOptions: ParticleOptions = {
  release: 'left',
  convergence: 0,
};
const HEADING_EFFECT = createParticleEffect({
  remove: {
    ...sharedParticleOptions,
    curve: 'burst',
    duration: 1800,
    release: 'left',
    stagger: 70,
    horizontalDrift: 80,
    horizontalTravel: [-119, -10],
    verticalTravel: [-105, 36],
    swirl: 8,
    endScale: 0.4,
  },
  restore: {
    ...sharedParticleOptions,
    curve: 'settle',
    duration: 1800,
    release: 'right',
    stagger: 130,
    horizontalDrift: 70,
    horizontalTravel: [40, 190],
    verticalTravel: [-210, -30],
    swirl: 34,
    endScale: 0.55,
  },
});

interface AnimatedWord {
  readonly resident: ResidentGlyph;
  readonly run: HTMLElement;
  readonly word: HTMLElement;
}

export interface DisintegratingTextOptions {
  readonly onError?: NonNullable<DisintegratorBaseOptions['onError']>;
  readonly overlayRoot?: DisintegratorBaseOptions['overlayRoot'];
}

export interface DisintegratingTextPlayback {
  readonly finished: Promise<void>;
  cancel(): void;
}

function wait(duration: number, signal: AbortSignal) {
  return new Promise<boolean>((resolve) => {
    if (signal.aborted) return resolve(false);
    const finish = (completed: boolean) => {
      window.clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      resolve(completed);
    };
    const abort = () => finish(false);
    const timeout = window.setTimeout(() => finish(true), duration);
    signal.addEventListener('abort', abort, { once: true });
  });
}

function isVisible(element: HTMLElement) {
  const bounds = element.getBoundingClientRect();
  return bounds.width > 0 && bounds.height > 0 && bounds.bottom > 0 && bounds.top < window.innerHeight;
}

async function nextPaint() {
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
}

/** Animates marked words as resident canvases without changing the heading layout. */
export function animateDisintegratingText(
  root: HTMLElement,
  options: DisintegratingTextOptions = {},
): DisintegratingTextPlayback | null {
  if (root.dataset.disintegratingTextState !== undefined) return null;
  const wordRuns = [...root.querySelectorAll<HTMLElement>('[data-disintegrating-text-word]')].flatMap((word) => {
    const run = word.querySelector<HTMLElement>('[data-disintegrating-text-shaped]');
    return run === null ? [] : [{ word, run }];
  });
  if (wordRuns.length === 0) return null;

  const reducedMotion =
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) {
    root.dataset.disintegratingTextState = 'reduced-motion';
    return { finished: Promise.resolve(), cancel: () => undefined };
  }

  root.dataset.disintegratingTextState = 'preparing';
  const controller = new AbortController();
  const active = new Set<EffectOperation>();
  const words: AnimatedWord[] = [];
  let instance: Disintegrator | null = null;
  let animationStarted = false;
  let animationSettled = false;
  let redrawLocks = 0;
  let redrawNeeded = false;
  let redrawTimer: number | null = null;
  let redrawFrame: number | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let themeObserver: MutationObserver | null = null;
  let lifecycleDisposed = false;

  const cancelScheduledRedraw = () => {
    if (redrawTimer !== null) window.clearTimeout(redrawTimer);
    if (redrawFrame !== null) window.cancelAnimationFrame(redrawFrame);
    redrawTimer = null;
    redrawFrame = null;
  };
  const redrawNow = () => {
    cancelScheduledRedraw();
    if (lifecycleDisposed || redrawLocks > 0) return;
    redrawNeeded = false;
    for (const { resident } of words) {
      if (!resident.redraw()) redrawNeeded = true;
    }
  };
  const scheduleRedraw = () => {
    redrawNeeded = true;
    if (lifecycleDisposed || redrawLocks > 0 || redrawTimer !== null || redrawFrame !== null) return;
    redrawTimer = window.setTimeout(() => {
      redrawTimer = null;
      redrawFrame = window.requestAnimationFrame(() => {
        redrawFrame = null;
        redrawNow();
      });
    }, REDRAW_SETTLE);
  };
  const disposeLifecycle = () => {
    if (lifecycleDisposed) return;
    lifecycleDisposed = true;
    cancelScheduledRedraw();
    window.removeEventListener('resize', scheduleRedraw);
    resizeObserver?.disconnect();
    themeObserver?.disconnect();
    for (const { resident } of words) resident.dispose();
  };

  const settle = async (operation: EffectOperation) => {
    active.add(operation);
    try {
      return await operation.finished;
    } finally {
      active.delete(operation);
    }
  };

  const animate = async (entry: AnimatedWord, index: number) => {
    if (!(await wait(index * STEP, controller.signal)) || !entry.resident.canvas.isConnected || !isVisible(root))
      return;
    const disintegrator = instance;
    if (disintegrator === null) throw new Error('The heading animator was not initialized.');
    if (redrawNeeded) redrawNow();
    redrawLocks += 1;

    let removalId: RemovalId | null = null;
    const canvas = entry.resident.canvas;
    canvas.dataset.disintegratingTextRunState = 'preparing';
    try {
      // Removal and restoration share this one bitmap.
      await disintegrator.prepare(canvas);
      if (controller.signal.aborted) return;
      if (!canvas.isConnected) {
        entry.resident.dispose();
        return;
      }

      animationStarted = true;
      canvas.dataset.disintegratingTextRunState = 'removing';
      const removal = disintegrator.remove(canvas, {
        sound: false,
        retain: true,
        layout: false,
      });
      removalId = removal.removalId;
      const removalResult = await settle(removal);
      if (removalId === null) return;
      if (removalResult.status !== 'completed') {
        const retained = disintegrator.take(removalId);
        removalId = null;
        if (retained !== null) {
          entry.run.append(retained);
          retained.dataset.disintegratingTextRunState = 'complete';
        }
        return;
      }
      canvas.dataset.disintegratingTextRunState = 'removed';

      const completedPause = await wait(PAUSE, controller.signal);
      const retained = disintegrator.take(removalId);
      removalId = null;
      if (retained === null) return;
      entry.run.append(retained);
      if (!completedPause || !isVisible(root)) {
        retained.dataset.disintegratingTextRunState = 'complete';
        return;
      }

      retained.dataset.disintegratingTextRunState = 'restoring';
      await settle(disintegrator.restore(retained, { sound: false }));
      retained.dataset.disintegratingTextRunState = 'complete';
    } finally {
      if (removalId !== null) {
        const retained = disintegrator.take(removalId);
        if (retained !== null) entry.run.append(retained);
      }
      redrawLocks = Math.max(0, redrawLocks - 1);
      if (redrawLocks === 0 && redrawNeeded) redrawNow();
    }
  };

  const finished = (async () => {
    let outcome: 'complete' | 'failed' = 'complete';
    try {
      await document.fonts?.ready;
      if (controller.signal.aborted || !root.isConnected) return;
      for (const entry of wordRuns) {
        words.push({ ...entry, resident: mountResidentGlyph(entry.run) });
      }

      window.addEventListener('resize', scheduleRedraw, { passive: true });
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(scheduleRedraw);
        for (const { word } of words) resizeObserver.observe(word);
      }
      themeObserver = new MutationObserver(scheduleRedraw);
      themeObserver.observe(document.documentElement, { attributeFilter: ['data-theme'] });

      await nextPaint();
      if (controller.signal.aborted || !root.isConnected || !isVisible(root)) return;
      instance = new Disintegrator({
        capture: createResidentGlyphCapture(),
        effect: HEADING_EFFECT,
        sound: false,
        preparation: true,
        ...(options.overlayRoot === undefined ? {} : { overlayRoot: options.overlayRoot }),
        ...(options.onError === undefined ? {} : { onError: options.onError }),
      });
      root.dataset.disintegratingTextState = 'running';
      const results = await Promise.allSettled(words.map((entry, index) => animate(entry, index)));
      const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
      if (failure !== undefined) throw failure.reason;
    } catch (error) {
      outcome = 'failed';
      throw error;
    } finally {
      instance?.destroy();
      animationSettled = true;
      if (controller.signal.aborted || outcome === 'failed' || !animationStarted) disposeLifecycle();
      root.dataset.disintegratingTextState = controller.signal.aborted ? 'cancelled' : outcome;
    }
  })();

  return {
    finished,
    cancel: () => {
      if (controller.signal.aborted) return;
      controller.abort();
      for (const operation of active) operation.cancel();
      if (animationSettled) {
        disposeLifecycle();
        root.dataset.disintegratingTextState = 'cancelled';
      }
    },
  };
}
