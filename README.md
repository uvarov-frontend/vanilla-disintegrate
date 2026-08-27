# Vanilla Disintegrate

A lightweight, framework-agnostic TypeScript plugin that turns any DOM element into rising particles and smoothly closes the space it occupied. It is the polished “Thanos snap” effect extracted from a production interface—not a timing-only CSS imitation.

<img width="1134" height="855" alt="Screen-Recording-2026-08-27-12-36-42" src="https://github.com/user-attachments/assets/c333d6f6-4cbf-4fd4-8865-7611872ea98b" />

[![CI](https://github.com/uvarov-frontend/vanilla-disintegrate/actions/workflows/ci.yml/badge.svg)](https://github.com/uvarov-frontend/vanilla-disintegrate/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/vanilla-disintegrate.svg)](https://www.npmjs.com/package/vanilla-disintegrate)
[![license](https://img.shields.io/npm/l/vanilla-disintegrate.svg)](./LICENSE)

## Documentation map

- [Install](#install)
- [Quick start](#quick-start-plain-html-and-javascript)
- [Choose the right removal method](#choose-the-right-removal-method)
- [Configuration and defaults](#configuration)
- [Binding remove buttons](#binding-remove-buttons)
- [Useful recipes](#useful-recipes)
- [API reference](#api-reference)
- [Troubleshooting](#troubleshooting)

## What it does

- Captures the real rendered element, including text, images, and nested content.
- Replaces it with rising particle layers at the same screen position.
- Removes the real element without waiting for an artificial timeout.
- Smoothly moves the surrounding cards into their new positions.
- Can prepare snapshots in the background for an immediate response to a click.
- Includes an optional original sound synchronized with the particles.
- Respects `prefers-reduced-motion` and does not add accessible duplicate content.

## Install

```bash
npm install vanilla-disintegrate
```

```bash
pnpm add vanilla-disintegrate
```

## Quick start: plain HTML and JavaScript

Add any number of items. Put `data-disintegrate` on the button that should remove its closest item:

```html
<div class="cards">
  <article class="card">
    <h2>First card</h2>
    <button type="button" data-disintegrate>Delete</button>
  </article>

  <article class="card">
    <h2>Second card</h2>
    <button type="button" data-disintegrate>Delete</button>
  </article>
</div>
```

Create one `Disintegrator` and bind it to the items:

```ts
import Disintegrator from 'vanilla-disintegrate';

const effect = new Disintegrator({ sound: true });

effect.bind({
  items: '.card',
});

window.addEventListener('pagehide', () => effect.destroy(), { once: true });
```

That is enough. Clicking either button will:

1. Capture the card.
2. Put the particle overlay at the card's current viewport position.
3. Remove the real card from the DOM.
4. Animate the remaining cards into place.
5. Remove the particle overlay when the animation finishes.

No plugin-specific CSS is required. The plugin follows the layout your page already has.

## Choose the right removal method

| Your application                         | Use                                  | Who removes the real DOM element? |
| ---------------------------------------- | ------------------------------------ | --------------------------------- |
| Plain HTML/JavaScript, automatic buttons | `effect.bind()`                      | The plugin                        |
| Plain HTML/JavaScript, manual event      | `await effect.remove(element)`       | The plugin                        |
| React, Vue, Svelte, or another UI system | `await effect.disintegrate(element)` | Your framework                    |
| Preview that must be reversible          | `await effect.disintegrate(element)` | Your code                         |

Always call `remove()` or `disintegrate()` while the target is still visible and connected. The plugin must capture it before your code removes it or updates framework state.

### Manual DOM removal

Use `remove()` when the plugin is allowed to remove the node:

```ts
const effect = new Disintegrator({ sound: true });
const card = document.querySelector<HTMLElement>('.card');
const button = card?.querySelector('button');

button?.addEventListener('click', async () => {
  if (!card) return;

  const handle = await effect.remove(card);
  await handle.finished;
  console.log('Particles and layout animation finished');
});
```

`remove()` resolves as soon as the overlay is ready and the real element has been removed. The particle animation continues through the returned handle.

### Reactive frameworks

Frameworks must remain responsible for their own DOM. Use `disintegrate()`, then update state immediately after it resolves:

```ts
const handle = await effect.disintegrate(cardElement);
removeCardFromState(cardId);

await handle.finished;
```

Do not add a timeout before updating state. The snapshot overlay is already ready when `disintegrate()` resolves.

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

  return <div ref={listRef}>{/* render cards here */}</div>;
}
```

Create the `Disintegrator` once for a page or feature, not during every render. Run this code on the client and call `effect.destroy()` when its owner is permanently disposed.

### Vue

```ts
const effect = new Disintegrator({ sound: true });

async function remove(card: HTMLElement, id: string) {
  await effect.disintegrate(card);
  cards.value = cards.value.filter((item) => item.id !== id);
}
```

### Svelte

```ts
const effect = new Disintegrator({ sound: true });

async function remove(card: HTMLElement, id: string) {
  await effect.disintegrate(card);
  cards = cards.filter((item) => item.id !== id);
}
```

## Script tag without a bundler

The IIFE build includes SnapDOM:

```html
<script src="https://unpkg.com/vanilla-disintegrate/dist/vanilla-disintegrate.iife.min.js"></script>
<script>
  const effect = new VanillaDisintegrate.Disintegrator({ sound: true });
  effect.bind({ items: '.card' });
</script>
```

The default trigger is `[data-disintegrate]`. Set `trigger` in `bind()` if your buttons use another selector.

## Configuration

The defaults are designed for a card list. Start with no options or only enable sound:

```ts
const effect = new Disintegrator(); // sound is off
```

```ts
const effect = new Disintegrator({ sound: true }); // bundled sound is on
```

Only change a setting when the default does not fit your interface.

### Top-level options

| Option                 | Default         | Purpose                                                                  |
| ---------------------- | --------------- | ------------------------------------------------------------------------ |
| `particles`            | See below       | Controls the particle look, direction, timing, and density.              |
| `layout`               | `true`          | Animates surrounding content after the element disappears.               |
| `preparation`          | `true`          | Prepares registered elements near the viewport during idle time.         |
| `sound`                | `false`         | Enables the bundled sound or configures a custom sound.                  |
| `snapdom`              | See below       | Configures the built-in SnapDOM capture.                                 |
| `capture`              | SnapDOM capture | Replaces SnapDOM with a custom element-to-canvas function.               |
| `respectReducedMotion` | `true`          | Skips visual effects when the user requests reduced motion.              |
| `overlayRoot`          | `document.body` | Chooses where the fixed particle overlay is inserted.                    |
| `zIndex`               | `2147483646`    | Sets the particle overlay's CSS `z-index`.                               |
| `random`               | `Math.random`   | Supplies randomness, mainly for deterministic tests or repeated visuals. |
| Lifecycle callbacks    | None            | Runs application code during the effect lifecycle.                       |

### Particle options

```ts
const effect = new Disintegrator({
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
});
```

| Option            | Default      | Meaning                                                                             |
| ----------------- | ------------ | ----------------------------------------------------------------------------------- |
| `frames`          | `32`         | Number of canvas layers, clamped to `1–128`. More layers cost more CPU and memory.  |
| `repetitions`     | `2`          | Layers receiving each pixel, clamped to `1–8`. Higher values make denser particles. |
| `duration`        | `720` ms     | Movement duration of each particle layer.                                           |
| `stagger`         | `180` ms     | Delay spread between the first and last particle layer.                             |
| `horizontalDrift` | `42` px      | Maximum horizontal wandering range.                                                 |
| `rise`            | `[45, 100]`  | Minimum and maximum upward movement in CSS pixels.                                  |
| `rotation`        | `14` degrees | Maximum clockwise/counter-clockwise rotation range.                                 |
| `endScale`        | `0.92`       | Scale of a layer at the end of its animation.                                       |
| `origin`          | `'left'`     | Starts the breakup from `'left'`, `'right'`, or a `'random'` direction.             |
| `easing`          | `'ease-out'` | Any valid Web Animations easing value.                                              |

For better performance on low-powered devices, reduce `frames` first. `frames: 20` and `repetitions: 1` are a reasonable lightweight starting point.

### Layout options

```ts
const effect = new Disintegrator({
  layout: {
    enabled: true,
    duration: 300,
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    container: undefined,
    siblings: 'following',
    animateContainer: true,
  },
});
```

| Option             | Default                          | Meaning                                                               |
| ------------------ | -------------------------------- | --------------------------------------------------------------------- |
| `enabled`          | `true`                           | Enables layout animation.                                             |
| `duration`         | `300` ms                         | Duration of surrounding element movement.                             |
| `easing`           | `cubic-bezier(0.22, 1, 0.36, 1)` | Movement easing.                                                      |
| `container`        | Removed element's parent         | Element whose layout and height should be measured.                   |
| `siblings`         | `'following'`                    | Animates following items, all items, or items returned by a function. |
| `animateContainer` | `true`                           | Smoothly animates the container height when it changes.               |

Only following siblings are animated by default. This prevents cards above the removed card from moving down and then back up.

Use a custom container when cards are nested inside wrappers:

```ts
const effect = new Disintegrator({
  layout: {
    container: (card) => card.closest<HTMLElement>('[data-grid]'),
    siblings: (card, grid) => [...grid.querySelectorAll<HTMLElement>('[data-card]')].filter((item) => item !== card),
  },
});
```

Disable layout animation when another library or framework already animates the list:

```ts
const effect = new Disintegrator({ layout: false });
```

### Snapshot preparation options

Preparation is enabled by default, but it only affects elements passed to `register()` or discovered by `bind()`.

```ts
const effect = new Disintegrator({
  preparation: {
    enabled: true,
    root: null,
    margin: 200,
    idleTimeout: 750,
    fallbackDelay: 250,
    scrollSettle: 120,
    animationSettle: 400,
    observeMutations: true,
  },
});
```

| Option             | Default  | Meaning                                                                 |
| ------------------ | -------- | ----------------------------------------------------------------------- |
| `enabled`          | `true`   | Enables background snapshot preparation.                                |
| `root`             | `null`   | `IntersectionObserver` root; `null` means the browser viewport.         |
| `margin`           | `200` px | Prepares elements this far outside the viewport.                        |
| `idleTimeout`      | `750` ms | Maximum wait for `requestIdleCallback`.                                 |
| `fallbackDelay`    | `250` ms | Delay used when `requestIdleCallback` is unavailable.                   |
| `scrollSettle`     | `120` ms | Wait after scrolling before a background capture.                       |
| `animationSettle`  | `400` ms | Maximum wait for finite CSS or Web Animations to finish before capture. |
| `observeMutations` | `true`   | Rebuilds snapshots when the registered element's DOM or images change.  |

Register elements before the user clicks them:

```ts
const unregister = effect.register(document.querySelectorAll('.card'));

await effect.prepare(importantCard); // capture one element immediately
effect.invalidate(changedCard); // discard a stale snapshot and schedule a new one

unregister();
```

Registered snapshots are limited to elements near the viewport and are captured one at a time. Set `preparation: false` if you prefer capture only when the effect is requested.

### Sound options

Sound is opt-in. The MP3 is not fetched when sound is disabled.

```ts
// Use the bundled original sound.
const effect = new Disintegrator({ sound: true });
```

```ts
// Use your own sound.
const effect = new Disintegrator({
  sound: {
    src: '/sounds/dust.mp3',
    gain: 0.32,
    duration: 0.9,
    fadeDuration: 0.18,
  },
});
```

| Option         | Default                       | Meaning                                                         |
| -------------- | ----------------------------- | --------------------------------------------------------------- |
| `src`          | Required for a custom sound   | A string, `URL`, `ArrayBuffer`, or decoded `AudioBuffer`.       |
| `gain`         | `0.32`                        | Linear Web Audio volume from `0` to `1`.                        |
| `duration`     | Particle `duration + stagger` | Playback duration in seconds, limited by the audio file length. |
| `fadeDuration` | `0.18` seconds                | Fade-out duration at the end of playback.                       |

For the default particles, the default sound duration is `(720 + 180) / 1000 = 0.9` seconds.

Browsers require audio playback to be unlocked by user interaction. Call `remove()` or `disintegrate()` directly from a click/tap handler. `bind()` already does this correctly. `register()`, `prepare()`, and `preloadSound()` start loading and decoding the audio without playing it.

The configured sound can be disabled for one operation:

```ts
await effect.remove(card, { sound: false });
```

### Snapshot capture options

The default entry uses SnapDOM with these capture defaults:

```ts
const effect = new Disintegrator({
  snapdom: {
    dpr: 1,
    scale: 1,
    embedFonts: true,
    fast: true,
    filterMode: 'remove',
    outerShadows: false,
    outerTransforms: false,
    reconcile: true,
  },
});
```

Pass any additional supported SnapDOM option through `snapdom`. For example, exclude controls from the captured image:

```ts
const effect = new Disintegrator({
  snapdom: {
    filter: (node) => !(node instanceof HTMLButtonElement),
  },
});
```

Replace SnapDOM entirely with a function that returns an `HTMLCanvasElement`:

```ts
const effect = new Disintegrator({
  capture: async (element) => myCaptureLibrary.toCanvas(element),
});
```

When `capture` is supplied, it takes precedence and the `snapdom` options are ignored.

### Lifecycle callbacks

```ts
const effect = new Disintegrator({
  onTrigger: ({ element }) => navigator.vibrate?.(8),
  onStart: ({ element, overlay }) => console.log('Started', element, overlay),
  onComplete: ({ element }) => console.log('Finished', element),
  onError: (error, context) => console.error(error, context.element),
});
```

| Callback     | When it runs                                                                  |
| ------------ | ----------------------------------------------------------------------------- |
| `onTrigger`  | Synchronously when an effect is requested. Useful for haptics.                |
| `onStart`    | When the overlay, first particle animations, and optional sound are starting. |
| `onComplete` | After both particle and layout animations finish.                             |
| `onError`    | For recoverable snapshot, audio, or callback errors.                          |

Callbacks can also be supplied for one `remove()` or `disintegrate()` operation.

### Per-operation options

`layout`, `sound`, and callbacks can be changed for a single operation:

```ts
const handle = await effect.remove(card, {
  sound: false,
  layout: { duration: 450 },
  onComplete: () => console.log('Finished'),
});
```

Particle and preparation options belong to the `Disintegrator` instance and cannot be changed per operation.

## Binding remove buttons

`bind()` uses event delegation, prepares matching elements, and tracks items added later.

```ts
const effect = new Disintegrator({ sound: true });

const unbind = effect.bind({
  root: document,
  items: '.card',
  trigger: '[data-disintegrate]',
  sound: true,
  preventDefault: true,
  onRemove: (handle, event) => {
    console.log('Removed', handle.element, event);
  },
});
```

| Option           | Default                | Meaning                                                               |
| ---------------- | ---------------------- | --------------------------------------------------------------------- |
| `root`           | `document`             | Document, element, or shadow root used for delegation and discovery.  |
| `items`          | Required               | Selector matching elements that should be removed.                    |
| `trigger`        | `[data-disintegrate]`  | Selector matching the remove control inside an item.                  |
| `sound`          | Instance configuration | Enables or disables the sound already configured on the instance.     |
| `preventDefault` | `true`                 | Prevents the trigger's default browser action.                        |
| `onRemove`       | None                   | Runs after the node is removed and the animation handle is available. |

Call `unbind()` to remove this binding. `effect.destroy()` also removes every active binding.

## Useful recipes

### Faster particles without changing layout speed

```ts
const effect = new Disintegrator({
  particles: { duration: 560, stagger: 130 },
  layout: { duration: 300 },
});
```

### Random breakup direction

```ts
const effect = new Disintegrator({
  particles: { origin: 'random' },
});
```

### Show an empty state after the last card closes

```ts
const handle = await effect.remove(card);

if (container.childElementCount === 0) {
  await handle.layoutFinished;
  emptyState.hidden = false;
}
```

### Disable sound for one button

```ts
button.addEventListener('click', async () => {
  await effect.remove(card, { sound: false });
});
```

## API reference

### `new Disintegrator(options?)`

Creates an isolated effect controller. Create one instance for a list, page, or feature instead of one instance per item.

### `register(target): () => void`

Registers an element, iterable of elements, or selector for background preparation. Returns an unregister function.

```ts
const unregister = effect.register('.card');
unregister();
```

### `bind(options): () => void`

Adds a delegated remove handler and automatically registers current and future matching items. Returns an unbind function.

### `prepare(target): Promise<void>`

Immediately captures and caches one or more elements.

### `disintegrate(target, options?): Promise<DisintegrationHandle>`

Starts the reversible effect and hides the original element. It does not remove that element from the DOM. Use it when a framework will update the DOM or when `restore()` may be needed.

### `remove(target, options?): Promise<DisintegrationHandle>`

Starts the effect and removes the original element from the DOM as soon as its overlay is ready.

### `preloadSound()`

Fetches and decodes the configured audio without playing it.

### `invalidate(target)`

Discards cached snapshots for changed elements and schedules fresh snapshots for registered nearby elements.

### `destroy()`

Removes bindings and observers, cancels active effects, restores connected original elements, and closes the audio context. Do not use the instance again after calling `destroy()`.

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

- `particlesFinished` resolves when every particle layer is finished and the overlay is removed.
- `layoutFinished` resolves when surrounding content and container height finish moving.
- `finished` waits for both.
- `cancel()` stops animations and leaves the original element hidden.
- `restore()` stops animations and restores the original element if it is still connected.
- `status` can be `'skipped'`, for example, when the target has no visible size, capture fails, or reduced motion is requested.

## Troubleshooting

### The element disappears but there are no particles

- Make sure the target is visible, connected to the document, and has non-zero width and height.
- Check `onError` for snapshot errors.
- When `prefers-reduced-motion` is enabled, the default behavior intentionally skips the effect. Set `respectReducedMotion: false` only if that matches your accessibility policy.

### There is no sound

- Sound is disabled by default. Pass `{ sound: true }`.
- Start removal directly from a user click or tap so the browser can unlock Web Audio.
- Check `onError` and the browser Network panel if using a custom URL.
- Make sure the custom server returns the audio file rather than an HTML fallback page.

### Particles are clipped

The default overlay is appended to `document.body` and is not clipped by the card container. If you set `overlayRoot`, do not point it at an element with `overflow: hidden`, clipping, transforms, or an insufficient `z-index` stacking context.

### Other cards jump or do not animate

- The removed card and animated cards should share the configured layout container.
- The direct parent is used by default. Configure `layout.container` for nested markup.
- The default `siblings: 'following'` animates only cards after the removed one. Use `'all'` or a resolver for unusual layouts.
- Set `layout: false` if another animation system owns the list.

### The snapshot is stale

Use `register()` or `bind()` with the default `observeMutations: true`. If external drawing or styling changes without a DOM mutation, call `effect.invalidate(element)` yourself.

## Size and package entries

| Entry                       |    Gzip | Notes                                                       |
| --------------------------- | ------: | ----------------------------------------------------------- |
| `vanilla-disintegrate/core` | ~6.6 kB | No capture dependency or bundled sound import               |
| `vanilla-disintegrate`      | ~7.5 kB | Plugin code; SnapDOM remains an external package dependency |
| IIFE                        |  ~59 kB | Standalone build with SnapDOM included                      |

The original sound is a separate 41 kB MP3 and is only fetched when sound is enabled or explicitly preloaded.

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

The plugin targets modern browsers with Canvas, Web Animations, and `MutationObserver`. `IntersectionObserver` and `requestIdleCallback` have graceful fallbacks. Web Audio is only required when sound is enabled.

The package is browser-oriented. In server-rendered applications, initialize and call it from client-side code where the target DOM elements exist.

## Development

```bash
npm install
npm run dev
npm run check
```

The interactive demo runs through Vite. `npm run check` runs formatting, linting, type checking, tests, all library builds, demo production build, smoke tests, and bundle-size budgets.

## License

Code and the bundled original sound are released under the [MIT License](./LICENSE). See [SOUND_LICENSE.md](./SOUND_LICENSE.md) for the audio attribution statement.
