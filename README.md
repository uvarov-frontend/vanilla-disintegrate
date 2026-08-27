# Vanilla Disintegrate

A lightweight, framework-agnostic TypeScript plugin that turns any DOM element into rising particles and smoothly closes the space it occupied. It is the polished “Thanos snap” effect extracted from a production interface—not a timing-only CSS imitation.

[![CI](https://github.com/uvarov-frontend/vanilla-disintegrate/actions/workflows/ci.yml/badge.svg)](https://github.com/uvarov-frontend/vanilla-disintegrate/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/vanilla-disintegrate.svg)](https://www.npmjs.com/package/vanilla-disintegrate)
[![license](https://img.shields.io/npm/l/vanilla-disintegrate.svg)](./LICENSE)

## Why it feels smooth

- Captures the real rendered element with SnapDOM, including text, images, and nested content.
- Uses a fixed overlay, so particles stay at the correct screen position after scrolling.
- Runs a FLIP layout transition only for elements that actually move.
- Prepares nearby snapshots during idle time, so user-triggered effects start immediately.
- Invalidates prepared snapshots when their DOM content or images change.
- Includes an optional original sound synchronized with the particles.
- Respects `prefers-reduced-motion` and never inserts accessible duplicate content.
- Ships ESM, CommonJS, IIFE, source maps, and TypeScript declarations.

## Install

```bash
npm install vanilla-disintegrate
```

```bash
pnpm add vanilla-disintegrate
```

## Quick start

```ts
import Disintegrator from 'vanilla-disintegrate';

const effect = new Disintegrator({ sound: true });
const unbind = effect.bind({
  items: '.card',
  trigger: '[data-remove]',
});

window.addEventListener(
  'pagehide',
  () => {
    unbind();
    effect.destroy();
  },
  { once: true },
);
```

`remove()` waits only until the snapshot overlay is ready, removes the real node, starts the layout transition, and returns a handle while the particles continue animating.

## Reactive frameworks

Let your framework own DOM removal. `disintegrate()` hides the original node after the overlay is ready; update application state immediately after it resolves.

```ts
const handle = await effect.disintegrate(cardElement);
removeCardFromState(cardId);

await handle.finished;
```

This works without an artificial timeout. Calling `register()` ahead of the interaction prepares nearby elements during idle time.

### React

```tsx
import { useEffect, useRef } from 'react';
import Disintegrator from 'vanilla-disintegrate';

const effect = new Disintegrator({ sound: true });

function Cards({ cards, setCards }) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!listRef.current) return;
    return effect.register(listRef.current.querySelectorAll<HTMLElement>('[data-card]'));
  }, [cards]);

  async function remove(id: string) {
    const card = listRef.current?.querySelector<HTMLElement>(`[data-card="${CSS.escape(id)}"]`);
    if (!card) return;

    await effect.disintegrate(card);
    setCards((items) => items.filter((item) => item.id !== id));
  }

  return <div ref={listRef}>{/* cards */}</div>;
}
```

Create the `Disintegrator` once for a page or feature, not during every render. Call `effect.destroy()` when that owner is disposed.

### Vue

```ts
import Disintegrator from 'vanilla-disintegrate';

const effect = new Disintegrator({ sound: true });

async function remove(card: HTMLElement, id: string) {
  await effect.disintegrate(card);
  cards.value = cards.value.filter((item) => item.id !== id);
}
```

### Svelte

```ts
import Disintegrator from 'vanilla-disintegrate';

const effect = new Disintegrator({ sound: true });

async function remove(card: HTMLElement, id: string) {
  await effect.disintegrate(card);
  cards = cards.filter((item) => item.id !== id);
}
```

## Script tag

```html
<script src="https://unpkg.com/vanilla-disintegrate/dist/vanilla-disintegrate.iife.min.js"></script>
<script>
  const effect = new VanillaDisintegrate.Disintegrator({ sound: true });
  effect.bind({ items: '.card', trigger: '[data-remove]' });
</script>
```

The IIFE build includes SnapDOM. Package-manager builds keep it as a normal dependency so bundlers can deduplicate it.

## Size

| Entry                       |    Gzip | Notes                                                       |
| --------------------------- | ------: | ----------------------------------------------------------- |
| `vanilla-disintegrate/core` | ~6.6 kB | No capture dependency or bundled sound import               |
| `vanilla-disintegrate`      | ~7.5 kB | Plugin code; SnapDOM remains an external package dependency |
| IIFE                        |  ~59 kB | Standalone build with SnapDOM included                      |

The original sound is a separate 41 kB MP3 and is only fetched when sound is enabled or explicitly preloaded.

## Options

```ts
const effect = new Disintegrator({
  sound: true,
  particles: {
    frames: 32,
    repetitions: 2,
    duration: 720,
    stagger: 180,
    horizontalDrift: 42,
    rise: [45, 100],
    rotation: 14,
    endScale: 0.92,
    origin: 'left',
    easing: 'ease-out',
  },
  layout: {
    duration: 300,
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    siblings: 'following',
    animateContainer: true,
  },
  preparation: {
    enabled: true,
    margin: 200,
    observeMutations: true,
  },
  respectReducedMotion: true,
  onTrigger: () => navigator.vibrate?.(8),
});
```

### Sound

Sound is opt-in and is never fetched when disabled.

```ts
// Bundled original sound
new Disintegrator({ sound: true });

// Custom sound, URL, ArrayBuffer, or decoded AudioBuffer
new Disintegrator({
  sound: {
    src: '/sounds/dust.mp3',
    gain: 0.32,
    duration: 0.9,
    fadeDuration: 0.18,
  },
});
```

`register()`, `prepare()`, and `preloadSound()` preload audio. Playback is unlocked from the same user interaction that calls `disintegrate()` or `remove()`, following browser autoplay rules.

### Layout

By default, the direct parent is the layout container and only following siblings are animated. This prevents cards above the removed item from jumping down and back up.

For custom markup:

```ts
new Disintegrator({
  layout: {
    container: (card) => card.closest<HTMLElement>('[data-grid]'),
    siblings: (card, grid) => [...grid.querySelectorAll<HTMLElement>('[data-card]')].filter((item) => item !== card),
  },
});
```

Set `layout: false` when another animation system owns the surrounding layout.

### Snapshot preparation

```ts
const unregister = effect.register(document.querySelectorAll('.card'));

await effect.prepare(importantCard); // capture immediately
effect.invalidate(importantCard); // discard stale cached capture
unregister();
```

Registered snapshots are limited to elements near the viewport and captured one at a time during idle periods. Scrolling and finite CSS/Web Animations are allowed to settle first.

## API

### `new Disintegrator(options?)`

Creates an isolated effect controller. No global listeners are installed until elements are registered.

### `register(target): () => void`

Observes an element, iterable of elements, or selector for idle snapshot preparation. Returns an unregister function.

### `bind(options): () => void`

Adds a delegated remove handler for vanilla DOM integrations, prepares matching items, and automatically tracks dynamically added or removed items. Returns an unbind function. `destroy()` also clears all bindings.

### `prepare(target): Promise<void>`

Immediately prepares snapshots for one or more elements.

### `disintegrate(target, options?): Promise<DisintegrationHandle>`

Starts the reversible visual effect and hides the original element.

### `remove(target, options?): Promise<DisintegrationHandle>`

Starts the effect and removes the original element from the DOM when the overlay is ready.

### `preloadSound()`

Fetches and decodes configured audio without playing it.

### `invalidate(target)`

Discards prepared snapshots for changed elements and refreshes registered nearby elements.

### `destroy()`

Disconnects observers, cancels active effects, restores their original elements, and closes the audio context.

### `DisintegrationHandle`

```ts
interface DisintegrationHandle {
  element: HTMLElement;
  status: 'running' | 'skipped';
  particlesFinished: Promise<void>;
  layoutFinished: Promise<void>;
  finished: Promise<void>;
  cancel(): void;
  restore(): void;
}
```

## Zero-dependency core

If the application already has an element-to-canvas capture implementation, import the dependency-free core:

```ts
import Disintegrator from 'vanilla-disintegrate/core';

const effect = new Disintegrator({
  capture: async (element) => myCaptureLibrary.toCanvas(element),
});
```

This entry contains particle generation, preparation, layout animation, lifecycle, and optional custom audio, but does not import SnapDOM or the bundled sound.

## Browser requirements

The effect targets modern browsers with Canvas, Web Animations, and `MutationObserver`. `IntersectionObserver` and `requestIdleCallback` have graceful fallbacks. Web Audio is only required when sound is enabled.

## Development

```bash
npm install
npm run dev
npm run check
```

The interactive demo runs through Vite. `npm run check` runs formatting, linting, type checking, tests, both library builds, and bundle-size budgets.

## License

Code and the bundled original sound are released under the [MIT License](./LICENSE). See [SOUND_LICENSE.md](./SOUND_LICENSE.md) for the audio attribution statement.
