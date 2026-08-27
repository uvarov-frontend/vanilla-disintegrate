import Disintegrator from '../src';

import './style.css';

function requiredElement<T extends Element>(selector: string) {
  const element = document.querySelector<T>(selector);
  if (element === null) throw new Error(`The demo element ${selector} is missing.`);
  return element;
}

const stories = requiredElement<HTMLElement>('#stories');
const empty = requiredElement<HTMLElement>('#empty');
const sound = requiredElement<HTMLInputElement>('#sound');
const reset = requiredElement<HTMLButtonElement>('#reset');

const cards = [
  ['The Last Lighthouse', 'A2 · 8 min', 'linear-gradient(145deg, #fb8a78, #8a3ffc)'],
  ['A Map of Quiet Places', 'B1 · 12 min', 'linear-gradient(145deg, #5bd9c8, #3157d5)'],
  ['Signals After Midnight', 'B2 · 16 min', 'linear-gradient(145deg, #ffc75c, #ef4d74)'],
  ['The Clockmaker’s Garden', 'A2 · 9 min', 'linear-gradient(145deg, #84e07b, #248a70)'],
] as const;

const effect = new Disintegrator({
  sound: true,
  onTrigger: () => navigator.vibrate?.(8),
  onError: (error) => console.error('[vanilla-disintegrate]', error),
});

let unregister: () => void = () => undefined;

function renderCards() {
  unregister();
  stories.replaceChildren(
    ...cards.map(([title, meta, cover], index) => {
      const article = document.createElement('article');
      article.className = 'story-card';
      article.innerHTML = `
        <div class="cover" style="--cover: ${cover}"><span>0${index + 1}</span></div>
        <div class="card-copy">
          <span>${meta}</span>
          <h3>${title}</h3>
        </div>
        <button type="button" aria-label="Remove ${title}">Remove</button>
      `;
      return article;
    }),
  );
  empty.hidden = true;
  unregister = effect.register('.story-card');
}

stories.addEventListener('click', (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>('button');
  const card = button?.closest<HTMLElement>('.story-card');
  if (!button || !card) return;

  button.disabled = true;
  void effect.remove(card, { sound: sound.checked }).then(() => {
    if (stories.childElementCount === 0) empty.hidden = false;
  });
});

reset.addEventListener('click', renderCards);
window.addEventListener('pagehide', () => effect.destroy(), { once: true });

renderCards();
