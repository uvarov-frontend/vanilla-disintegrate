/** Shows the run-button hint on each card click, including after reset. */
export function mountPlaygroundCardHint(root: HTMLElement) {
  const hint = root.querySelector<HTMLElement>('[data-card-hint]');
  if (hint === null) throw new Error('Missing playground card hint.');
  let timer: ReturnType<typeof setTimeout> | null = null;
  let animation: Animation | null = null;
  let closing = false;
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const finishHide = () => {
    hint.hidden = true;
    animation?.cancel();
    animation = null;
    closing = false;
  };
  const hide = (immediate = false) => {
    clearTimer();
    if (immediate || reducedMotion() || animation === null) {
      finishHide();
      return;
    }
    if (closing) return;
    closing = true;
    animation.reverse();
  };
  const show = () => {
    clearTimer();
    if (hint.hidden) {
      hint.hidden = false;
      if (!reducedMotion()) {
        const motion = hint.animate(
          [
            { opacity: 0, transform: 'translate(-50%, 6px) scale(0.92, 0.2)' },
            { opacity: 1, transform: 'translate(-50%, 0) scale(1)' },
          ],
          { duration: 220, easing: 'ease-out', fill: 'both' },
        );
        animation = motion;
        motion.onfinish = () => {
          if (animation === motion && closing) finishHide();
        };
      }
    } else if (closing) {
      // Reopen from the current frame if another click arrives during dismissal.
      closing = false;
      animation?.reverse();
    }
    timer = setTimeout(hide, 3000);
  };
  const onClick = (event: MouseEvent) => {
    const card = event.target instanceof Element ? event.target.closest('.playground-card') : null;
    if (card === null || !root.contains(card)) {
      hide();
      return;
    }
    if (root.getAttribute('aria-busy') === 'true') return;
    show();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') hide();
  };
  // Delegation also handles SVG targets, retained cards and cards recreated by reset.
  document.addEventListener('click', onClick);
  document.addEventListener('keydown', onKeyDown);

  return {
    hide,
    dispose() {
      hide(true);
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKeyDown);
    },
  };
}
