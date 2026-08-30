import Disintegrator from '../../../src/snapdom';

import { particleVortex } from './particle-vortex';

const effects = new Disintegrator();
const element = document.querySelector<HTMLElement>('.card')!;
const container = element.parentElement!;

const removal = effects.remove(element, {
  effect: particleVortex,
  retain: true,
});
await removal.finished;

const restored = removal.removalId === null ? null : effects.take(removal.removalId);
if (restored !== null) {
  container.append(restored);
  await effects.restore(restored, { effect: particleVortex }).finished;
}
