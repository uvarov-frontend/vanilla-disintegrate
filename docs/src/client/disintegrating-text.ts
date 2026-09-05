import Disintegrator, { createParticleEffect } from '../../../src/index';
import type { DisintegratorBaseOptions, EffectOperation, ParticleOptions, RemovalId } from '../../../src/types';
import { createResidentGlyphCapture, mountResidentGlyph, type ResidentGlyph } from './glyph-capture';
import { mountSnapCursor, type SnapCursorPhase } from './snap-cursor';

const STEP = 320;
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
  removalId: RemovalId | null;
}

export interface DisintegratingTextOptions {
  readonly onError?: NonNullable<DisintegratorBaseOptions['onError']>;
  readonly overlayRoot?: DisintegratorBaseOptions['overlayRoot'];
}

export interface DisintegratingTextController {
  readonly ready: Promise<void>;
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

async function nextPaint() {
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
}

/** Mounts the user-triggered remove/restore interaction for marked heading words. */
export function setupDisintegratingText(
  root: HTMLElement,
  options: DisintegratingTextOptions = {},
): DisintegratingTextController | null {
  if (root.dataset.disintegratingTextState !== undefined) return null;
  const trigger = root.querySelector<HTMLButtonElement>('[data-disintegrating-text-trigger]');
  if (trigger === null) return null;
  const headingHint = root.querySelector<HTMLElement>('[data-heading-hint]');
  const wordRuns = [...root.querySelectorAll<HTMLElement>('[data-disintegrating-text-word]')].flatMap((word) => {
    const run = word.querySelector<HTMLElement>('[data-disintegrating-text-shaped]');
    return run === null ? [] : [{ word, run }];
  });
  if (wordRuns.length === 0) return null;

  const reducedMotion =
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) {
    root.dataset.disintegratingTextState = 'reduced-motion';
    trigger.disabled = true;
    return { ready: Promise.resolve(), cancel: () => undefined };
  }

  root.dataset.disintegratingTextState = 'preparing';
  trigger.disabled = true;
  const controller = new AbortController();
  const active = new Set<EffectOperation>();
  const words: AnimatedWord[] = [];
  const snapCursor = mountSnapCursor(trigger);
  let instance: Disintegrator | null = null;
  let busy = false;
  let removed = false;
  let redrawLocks = 0;
  let redrawNeeded = false;
  let redrawTimer: number | null = null;
  let redrawFrame: number | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let themeObserver: MutationObserver | null = null;
  let disposed = false;
  let hintAnimation: Animation | null = null;

  const showHeadingHint = () => {
    if (headingHint === null || disposed) return;
    hintAnimation?.cancel();
    headingHint.hidden = false;
    hintAnimation = headingHint.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 240,
      easing: 'ease-out',
    });
  };

  const cancelScheduledRedraw = () => {
    if (redrawTimer !== null) window.clearTimeout(redrawTimer);
    if (redrawFrame !== null) window.cancelAnimationFrame(redrawFrame);
    redrawTimer = null;
    redrawFrame = null;
  };
  const redrawNow = () => {
    cancelScheduledRedraw();
    if (disposed || redrawLocks > 0) return;
    redrawNeeded = false;
    for (const { resident } of words) {
      if (!resident.redraw()) redrawNeeded = true;
    }
  };
  const scheduleRedraw = () => {
    redrawNeeded = true;
    if (disposed || redrawLocks > 0 || redrawTimer !== null || redrawFrame !== null) return;
    redrawTimer = window.setTimeout(() => {
      redrawTimer = null;
      redrawFrame = window.requestAnimationFrame(() => {
        redrawFrame = null;
        redrawNow();
      });
    }, 120);
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (headingHint !== null) headingHint.hidden = true;
    hintAnimation?.cancel();
    cancelScheduledRedraw();
    window.removeEventListener('resize', scheduleRedraw);
    resizeObserver?.disconnect();
    themeObserver?.disconnect();
    snapCursor.destroy();
    instance?.destroy();
    instance = null;
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

  const unlockRedraw = () => {
    redrawLocks = Math.max(0, redrawLocks - 1);
    if (redrawLocks === 0 && redrawNeeded) redrawNow();
  };

  const removeWord = async (entry: AnimatedWord, index: number) => {
    if (!(await wait(index * STEP, controller.signal))) return false;
    const disintegrator = instance;
    if (disintegrator === null || controller.signal.aborted) return false;
    redrawLocks += 1;
    try {
      const canvas = entry.resident.canvas;
      canvas.dataset.disintegratingTextRunState = 'removing';
      const operation = disintegrator.remove(canvas, { sound: false, retain: true, layout: false });
      entry.removalId = operation.removalId;
      const result = await settle(operation);
      if ((result.status === 'completed' || result.status === 'skipped') && entry.removalId !== null) {
        canvas.dataset.disintegratingTextRunState = 'removed';
        return true;
      }
      if (entry.removalId !== null) {
        const retained = disintegrator.take(entry.removalId);
        entry.removalId = null;
        if (retained !== null && !retained.isConnected) entry.run.append(retained);
      }
      canvas.dataset.disintegratingTextRunState = 'ready';
      return false;
    } finally {
      unlockRedraw();
    }
  };

  const removeWords = async () => {
    const disintegrator = instance;
    if (disintegrator === null) return false;
    if (controller.signal.aborted) return false;
    const results = await Promise.allSettled(words.map((entry, index) => removeWord(entry, index)));
    const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failure !== undefined) throw failure.reason;
    const completed = results.every((result) => result.status === 'fulfilled' && result.value);
    if (completed) return true;
    for (const entry of words) {
      if (entry.removalId === null) continue;
      const retained = disintegrator.take(entry.removalId);
      entry.removalId = null;
      if (retained !== null && !retained.isConnected) entry.run.append(retained);
      entry.resident.canvas.dataset.disintegratingTextRunState = 'ready';
    }
    return false;
  };

  const restoreWord = async (entry: AnimatedWord, index: number) => {
    if (!(await wait(index * STEP, controller.signal))) return false;
    const disintegrator = instance;
    const removalId = entry.removalId;
    if (disintegrator === null || removalId === null || controller.signal.aborted) return false;
    redrawLocks += 1;
    try {
      const retained = disintegrator.take(removalId);
      entry.removalId = null;
      if (retained === null) return false;
      entry.run.append(retained);
      entry.resident.redraw();
      retained.dataset.disintegratingTextRunState = 'restoring';
      await settle(disintegrator.restore(retained, { sound: false }));
      retained.dataset.disintegratingTextRunState = 'ready';
      return true;
    } finally {
      unlockRedraw();
    }
  };

  const restoreWords = async () => {
    const results = await Promise.allSettled(words.map((entry, index) => restoreWord(entry, index)));
    const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failure !== undefined) throw failure.reason;
    return results.every((result) => result.status === 'fulfilled' && result.value);
  };

  const setTriggerState = () => {
    trigger.setAttribute('aria-pressed', String(removed));
    const label = removed ? trigger.dataset.restoreLabel : trigger.dataset.removeLabel;
    if (label !== undefined) trigger.setAttribute('aria-label', label);
  };

  const play = async (event: MouseEvent) => {
    if (busy || disposed || controller.signal.aborted || instance === null) return;
    if (headingHint !== null && !headingHint.hidden) {
      const opacity = getComputedStyle(headingHint).opacity;
      hintAnimation?.cancel();
      const fade = headingHint.animate([{ opacity }, { opacity: 0 }], {
        duration: 180,
        easing: 'ease-out',
        fill: 'forwards',
      });
      hintAnimation = fade;
      const hideHint = () => {
        if (hintAnimation !== fade) return;
        headingHint.hidden = true;
        fade.cancel();
      };
      void fade.finished.then(hideHint, hideHint);
    }
    busy = true;
    trigger.disabled = true;
    const phase: SnapCursorPhase = removed ? 'restore' : 'remove';
    root.dataset.disintegratingTextState = phase === 'remove' ? 'snapping' : 'reversing';
    const cursorPlayback = snapCursor.play(phase, event);
    const preparation =
      phase === 'remove'
        ? (() => {
            if (redrawNeeded) redrawNow();
            return instance.prepare(words.map(({ resident }) => resident.canvas));
          })()
        : Promise.resolve();
    const transition = (async () => {
      await Promise.all([cursorPlayback.cue, preparation]);
      if (controller.signal.aborted) return false;
      root.dataset.disintegratingTextState = phase === 'remove' ? 'removing' : 'restoring';
      return phase === 'remove' ? removeWords() : restoreWords();
    })();

    const [cursorResult, transitionResult] = await Promise.allSettled([cursorPlayback.finished, transition]);
    if (cursorResult.status === 'rejected') throw cursorResult.reason;
    if (transitionResult.status === 'rejected') throw transitionResult.reason;
    if (controller.signal.aborted) return;
    if (transitionResult.value) removed = phase === 'remove';
    root.dataset.disintegratingTextState = removed ? 'removed' : 'ready';
    setTriggerState();
    busy = false;
    trigger.disabled = false;
    // Both the cursor and every word have finished before inviting another click.
    if (!removed) showHeadingHint();
  };

  const onClick = (event: MouseEvent) => {
    void play(event).catch((error: unknown) => {
      busy = false;
      if (controller.signal.aborted) return;
      root.dataset.disintegratingTextState = 'failed';
      trigger.disabled = true;
      console.error('The heading animation failed.', error);
    });
  };
  trigger.addEventListener('click', onClick);

  const ready = (async () => {
    try {
      await document.fonts?.ready;
      if (controller.signal.aborted || !root.isConnected) return;
      for (const entry of wordRuns) {
        words.push({ ...entry, removalId: null, resident: mountResidentGlyph(entry.run) });
      }

      window.addEventListener('resize', scheduleRedraw, { passive: true });
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(scheduleRedraw);
        for (const { word } of words) resizeObserver.observe(word);
      }
      themeObserver = new MutationObserver(scheduleRedraw);
      themeObserver.observe(document.documentElement, { attributeFilter: ['data-theme'] });

      await Promise.all([snapCursor.ready, nextPaint()]);
      if (controller.signal.aborted || !root.isConnected) return;
      instance = new Disintegrator({
        capture: createResidentGlyphCapture(),
        effect: HEADING_EFFECT,
        sound: false,
        preparation: false,
        ...(options.overlayRoot === undefined ? {} : { overlayRoot: options.overlayRoot }),
        ...(options.onError === undefined ? {} : { onError: options.onError }),
      });
      root.dataset.disintegratingTextState = 'ready';
      setTriggerState();
      trigger.disabled = false;
      showHeadingHint();
    } catch (error) {
      dispose();
      root.dataset.disintegratingTextState = 'failed';
      throw error;
    }
  })();

  return {
    ready,
    cancel: () => {
      if (controller.signal.aborted) return;
      controller.abort();
      trigger.removeEventListener('click', onClick);
      for (const operation of active) operation.cancel();
      dispose();
      root.dataset.disintegratingTextState = 'cancelled';
    },
  };
}
