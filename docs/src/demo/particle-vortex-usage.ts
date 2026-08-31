import Disintegrator from '../../../src/snapdom';

import { particleVortex } from './particle-vortex';

const effects = new Disintegrator({ effect: particleVortex });
const element = document.querySelector<HTMLElement>('.card')!;
const container = element.parentElement!;

const removal = effects.remove(element, {
  retain: true,
});
await removal.finished;

const restored = removal.removalId === null ? null : effects.take(removal.removalId);
if (restored !== null) {
  container.append(restored);
  await effects.restore(restored).finished;
}
