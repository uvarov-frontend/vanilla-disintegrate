/** Shows the run-button hint once per page, including after the card is recreated. */
export function mountPlaygroundCardHint(root: HTMLElement) {
  const hint = root.querySelector<HTMLElement>('[data-card-hint]');
  if (hint === null) throw new Error('Missing playground card hint.');
  let shown = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const hide = () => {
    hint.hidden = true;
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const onClick = (event: MouseEvent) => {
    const card = event.target instanceof Element ? event.target.closest('.playground-card') : null;
    if (card === null || !root.contains(card)) {
      hide();
      return;
    }
    if (shown || root.getAttribute('aria-busy') === 'true') return;
    shown = true;
    hint.hidden = false;
    timer = setTimeout(hide, 4000);
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
      hide();
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKeyDown);
    },
  };
}
