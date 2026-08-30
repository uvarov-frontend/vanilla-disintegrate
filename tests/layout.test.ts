import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveLayout } from '../src/defaults';
import { LayoutAnimator } from '../src/layout';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function rect(left: number, top: number, width = 200, height = 80): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

function controlledAnimation() {
  const completion = deferred();
  const cancel = vi.fn();
  return {
    animation: {
      cancel,
      finished: completion.promise,
    } as unknown as Animation,
    cancel,
    finish: completion.resolve,
  };
}

function layoutElements() {
  const container = document.createElement('section');
  const first = document.createElement('article');
  const second = document.createElement('article');
  const sibling = document.createElement('article');
  container.append(first, second, sibling);
  document.body.append(container);
  container.style.alignContent = 'center';

  let containerHeight = 240;
  let siblingTop = 160;
  vi.spyOn(container, 'getBoundingClientRect').mockImplementation(() => rect(0, 0, 320, containerHeight));
  vi.spyOn(sibling, 'getBoundingClientRect').mockImplementation(() => rect(0, siblingTop, 320, 80));
  vi.stubGlobal('getComputedStyle', vi.fn().mockReturnValue({ display: 'grid' }));

  const setFinalGeometry = (top: number, height = containerHeight) => {
    siblingTop = top;
    containerHeight = height;
  };

  return {
    container,
    first,
    second,
    sibling,
    setFinalGeometry,
  };
}

const options = () =>
  resolveLayout({
    animateContainer: false,
    duration: 240,
    easing: 'linear',
    siblings: (_element, container) => [container.lastElementChild as HTMLElement],
  });

beforeEach(() => document.body.replaceChildren());

describe('LayoutAnimator', () => {
  it('restores an inline grid alignContent value after playback', async () => {
    const { container, first, sibling, setFinalGeometry } = layoutElements();
    const controlled = controlledAnimation();
    const animate = vi.spyOn(sibling, 'animate').mockReturnValue(controlled.animation);
    const animator = new LayoutAnimator();
    const snapshot = animator.capture(first, options());

    setFinalGeometry(80);
    const playback = animator.play(snapshot, options(), 0);

    expect(container.style.alignContent).toBe('start');
    expect(animate).toHaveBeenCalledWith(
      [{ transform: 'translate3d(0px, 80px, 0)' }, { transform: 'translate3d(0, 0, 0)' }],
      { duration: 240, easing: 'linear' },
    );

    controlled.finish();
    await playback.finished;
    expect(container.style.alignContent).toBe('center');
  });

  it('cancels delayed backwards-filled animations and restores grid styles', () => {
    const { container, first, sibling, setFinalGeometry } = layoutElements();
    const controlled = controlledAnimation();
    const animate = vi.spyOn(sibling, 'animate').mockReturnValue(controlled.animation);
    const animator = new LayoutAnimator();
    const snapshot = animator.capture(first, options());

    setFinalGeometry(80);
    const playback = animator.play(snapshot, options(), 120);
    expect(animate).toHaveBeenCalledWith(expect.any(Array), {
      delay: 120,
      duration: 240,
      easing: 'linear',
      fill: 'backwards',
    });

    playback.cancel();
    expect(controlled.cancel).toHaveBeenCalledOnce();
    expect(container.style.alignContent).toBe('center');
  });

  it('hands a container from an overlapping layout animation to the newest playback', async () => {
    const { container, first, second, sibling, setFinalGeometry } = layoutElements();
    const firstAnimation = controlledAnimation();
    const secondAnimation = controlledAnimation();
    vi.spyOn(sibling, 'animate')
      .mockReturnValueOnce(firstAnimation.animation)
      .mockReturnValueOnce(secondAnimation.animation);
    const animator = new LayoutAnimator();

    const firstSnapshot = animator.capture(first, options());
    setFinalGeometry(120);
    animator.play(firstSnapshot, options(), 0);
    expect(container.style.alignContent).toBe('start');

    const secondSnapshot = animator.capture(second, options());
    expect(firstAnimation.cancel).toHaveBeenCalledOnce();
    expect(container.style.alignContent).toBe('center');

    setFinalGeometry(40);
    const secondPlayback = animator.play(secondSnapshot, options(), 0);
    firstAnimation.finish();
    await Promise.resolve();
    expect(container.style.alignContent).toBe('start');

    secondAnimation.finish();
    await secondPlayback.finished;
    expect(container.style.alignContent).toBe('center');
  });
});
