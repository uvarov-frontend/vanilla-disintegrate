import { Disintegrator } from '../../src/snapdom';
import type { AnimationContext } from '../../src/types';

const days = document.querySelector('[data-calendar-days]')!;
for (let day = 1; day <= 28; day++) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = String(day);
  button.className = day === 23 ? 'selected' : day % 7 > 4 || day % 7 === 0 ? 'weekend' : '';
  days.append(button);
}

// Values deliberately differ from HTML attributes to exercise current form state.
document.querySelector<HTMLInputElement>('[name="name"]')!.value = 'Updated value';
document.querySelector<HTMLSelectElement>('[name="plan"]')!.selectedIndex = 1;
document.querySelector<HTMLTextAreaElement>('[name="notes"]')!.value = 'Current notes\nВторая строка';
document.querySelector<HTMLInputElement>('[name="enabled"]')!.checked = true;
document.querySelector<HTMLInputElement>('[name="mode"]')!.checked = true;
document.querySelector('.scroll-window')!.scrollTop = 20;

const canvas = document.querySelector('canvas')!;
const context = canvas.getContext('2d')!;
context.fillStyle = '#ecf0f7';
context.fillRect(0, 0, 120, 80);
for (const [index, height] of [24, 48, 36, 64].entries()) {
  context.fillStyle = index % 2 ? '#285bc5' : '#13856f';
  context.fillRect(8 + index * 28, 76 - height, 20, height);
}
document.querySelector<HTMLImageElement>('[data-raster]')!.src = canvas.toDataURL();

const shadow = document.querySelector('[data-shadow-host]')!.attachShadow({ mode: 'open' });
shadow.innerHTML = `
  <style>
    :host { display:block; }
    section { display:flex; flex-wrap:wrap; gap:12px; padding:12px; border:2px solid #285bc5; border-radius:12px; }
    strong { color:var(--accent); }
    button { font:inherit; line-height:24px; padding:4px 12px; border:0; border-radius:6px; color:white; background:#285bc5; }
  </style>
  <section><strong><slot name="label"></slot></strong><span>Inside the shadow root</span><button type="button">Action</button></section>
`;

export const ready = Promise.all([document.fonts.ready, ...Array.from(document.images, (image) => image.decode())]);

/** Exercise the public lifecycle, including the concealed original during restore. */
export async function captureFixture(id: string, operation: 'remove' | 'restore') {
  await ready;
  const element = document.querySelector<HTMLElement>(`[data-case="${id}"]`)!;
  const marker = document.createComment('retained fixture position');
  element.before(marker);
  const snapshots: Array<{ operation: string; png: string; width: number; height: number }> = [];
  const animate = ({ snapshot, operation }: AnimationContext) => {
    if (!snapshot) throw new Error('The effect received no snapshot');
    snapshots.push({ operation, png: snapshot.toDataURL(), width: snapshot.width, height: snapshot.height });
    return Promise.resolve();
  };
  const effects = new Disintegrator({
    effect: { remove: { animate }, restore: { animate } },
    snapdom: { dpr: window.devicePixelRatio },
    preparation: false,
    layout: false,
    sound: false,
  });
  try {
    if (operation === 'restore') {
      const result = await effects.restore(element).finished;
      return { snapshots, status: result.status };
    }
    const removal = effects.remove(element, { retain: true });
    const result = await removal.finished;
    marker.after(effects.take(removal.removalId!)!);
    return { snapshots, status: result.status };
  } finally {
    effects.destroy();
    if (!element.isConnected) marker.after(element);
    marker.remove();
  }
}

declare global {
  interface Window {
    captureFixtures: { ready: typeof ready; capture: typeof captureFixture };
  }
}

window.captureFixtures = { ready, capture: captureFixture };
