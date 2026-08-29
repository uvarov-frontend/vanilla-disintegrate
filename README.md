# Vanilla Disintegrate — Thanos Snap Animation for DOM Elements

[![Vanilla Disintegrate preview](https://github.com/user-attachments/assets/c333d6f6-4cbf-4fd4-8865-7611872ea98b)](https://github.com/uvarov-frontend/vanilla-disintegrate)

[![version](https://img.shields.io/npm/v/vanilla-disintegrate.svg)](https://www.npmjs.com/package/vanilla-disintegrate)
[![CI](https://github.com/uvarov-frontend/vanilla-disintegrate/actions/workflows/ci.yml/badge.svg)](https://github.com/uvarov-frontend/vanilla-disintegrate/actions/workflows/ci.yml)
[![downloads](https://img.shields.io/npm/dm/vanilla-disintegrate.svg)](https://www.npmjs.com/package/vanilla-disintegrate)
[![license](https://img.shields.io/npm/l/vanilla-disintegrate.svg)](./LICENSE)

Vanilla Disintegrate is a lightweight TypeScript library for removing and restoring DOM elements with a Thanos-snap particle effect. It works with plain JavaScript and any framework that renders DOM, needs no runtime CSS, and gives you four ready-made animation pairs or a contract for creating your own.

## Key Features

- **Thanos-snap effect**: Turn the real appearance of a DOM element into animated particles.
- **Four animation pairs**: Choose `dust`, `vapor`, `scatter`, or `wind`; every removal has a matching restoration animation.
- **Restore any element**: Animate a retained node back into a user-chosen location or use `restore()` as an entrance animation for a completely new element.
- **Simple integration**: Create an instance and call `remove(element)` directly from a click handler.
- **Framework-agnostic**: Use it with vanilla JavaScript, React, Vue, Svelte, Solid, Angular, Web Components, or another DOM renderer.
- **Custom effects**: Define independent removal and restoration phases with WAAPI, Canvas, SVG, WebGL, CSS, or another animation engine.
- **Custom capture**: SnapDOM captures elements by default; provide `capture` to use another renderer such as html2canvas.
- **Sound control**: Built-in effect audio is enabled by default where available; use your own source, `AudioBuffer`, or audio factory when needed.
- **Optional preparation**: Pre-capture chosen elements in the background with a bounded LRU snapshot cache.
- **Explicit memory control**: Keep a removed original node only with `retain: true`, then consume it with `take()` or release it with `discard()`.
- **No runtime CSS**: The library creates and removes its visual layer itself without a stylesheet import.
- **Accessible defaults**: Respects `prefers-reduced-motion` by default.

## Browser Support

Vanilla Disintegrate is built for modern browsers. Its ES2020 output and required Canvas, Web Animations, `AbortController`, and `requestAnimationFrame` APIs define the following support baseline. No polyfills are included.

| ![Chrome](https://raw.githubusercontent.com/alrra/browser-logos/master/src/chrome/chrome_48x48.png) | ![Firefox](https://raw.githubusercontent.com/alrra/browser-logos/master/src/firefox/firefox_48x48.png) | ![Edge](https://raw.githubusercontent.com/alrra/browser-logos/master/src/edge/edge_48x48.png) | ![Opera](https://raw.githubusercontent.com/alrra/browser-logos/master/src/opera/opera_48x48.png) | ![Safari](https://raw.githubusercontent.com/alrra/browser-logos/master/src/safari/safari_48x48.png) |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| 80+ ✔                                                                                               | 74+ ✔                                                                                                  | 80+ ✔                                                                                         | 67+ ✔                                                                                            | 13.1+ ✔                                                                                             |

Current Chrome for Android and iOS Safari are supported under the same engine baseline. Initialize the library only in the browser: it is not intended to run during server-side rendering.

`preparation` progressively enhances the default removal flow. Browsers without `IntersectionObserver`, `ResizeObserver`, or `requestIdleCallback` still run effects; preparation uses the available fallback instead.

SnapDOM captures the rendered element through Canvas. Images, fonts, and stylesheets from another origin must send the appropriate CORS headers or be served through SnapDOM's proxy option; otherwise they may be missing from the snapshot. Safari is supported, though captures that embed fonts or use background and mask images can take longer.

## Support and Feedback

Vanilla Disintegrate is free and open source. Maintaining it takes time and resources; donations help keep the project improving while remaining available to everyone.

If it helps your project, consider giving it a 🌟 star on [GitHub](https://github.com/uvarov-frontend/vanilla-disintegrate), making a donation, reporting an issue, or sharing an idea.

[![](https://www.paypalobjects.com/en_US/i/btn/btn_donateCC_LG.gif)](https://buymeacoffee.com/uvarov)

## Getting Started

### Installation

Use any supported package manager. SnapDOM is a regular dependency and is installed automatically.

```sh
npm install vanilla-disintegrate
# or
yarn add vanilla-disintegrate
# or
pnpm add vanilla-disintegrate
# or
bun add vanilla-disintegrate
```

### Remove an Element

Call `remove()` while the element is connected and visible. The library captures it, detaches it from the page, and plays the selected effect in an isolated visual layer.

```ts
import Disintegrator from 'vanilla-disintegrate';

const effects = new Disintegrator({
  effect: 'dust',
});

const card = document.querySelector<HTMLElement>('.card');

if (card) {
  card.querySelector('button')?.addEventListener('click', () => {
    effects.remove(card);
  });
}
```

`remove()` returns an operation handle immediately. Await `operation.finished` only when subsequent code needs to wait for the visual animation.

```ts
const operation = effects.remove(card);

await operation.finished;
```

### Remove and Restore the Same Node

Set `retain: true` when you need to keep the original DOM node for undo or later restoration. The library does not decide where it belongs: take the node, insert it into the location chosen by your application, and call `restore()`.

```ts
const removal = effects.remove(card, {
  effect: 'wind',
  retain: true,
});

await removal.finished;

if (removal.removalId) {
  const retained = effects.take(removal.removalId);
  const cards = document.querySelector<HTMLElement>('.cards');

  if (retained && cards) {
    cards.append(retained);
    await effects.restore(retained).finished;
  }
}
```

The retained node remembers the effect used for its removal, so `restore()` uses the matching phase unless another effect is explicitly passed.

### Animate a New Element

`restore()` is also an entrance animation. Insert a new element first, then animate its visible final geometry.

```ts
const message = document.createElement('aside');
message.textContent = 'Saved';

const notifications = document.querySelector<HTMLElement>('.notifications');
if (notifications) {
  notifications.append(message);
  effects.restore(message, { effect: 'vapor' });
}
```

### Built-in Effects

| Effect    | Removal                             | Restoration                             |
| --------- | ----------------------------------- | --------------------------------------- |
| `dust`    | Breaks into rising dust.            | Dust collects into the final element.   |
| `vapor`   | Softly evaporates.                  | Vapor condenses into the final element. |
| `scatter` | Bursts particles outward.           | Particles converge from outside.        |
| `wind`    | Carries particles away in a stream. | Returns them from the same direction.   |

Set an instance default or choose an effect for one operation:

```ts
const effects = new Disintegrator({ effect: 'vapor' });

effects.remove(firstCard);
effects.remove(secondCard, { effect: 'scatter' });
```

### Custom Effects and Capture

Custom effects use the same remove/restore pair as the built-ins. Each phase can return a Web Animation, a `Promise`, or a controller for Canvas, SVG, WebGL, or another renderer.

```ts
import { defineEffect } from 'vanilla-disintegrate';

function createLayerClone(element: HTMLElement, layer: HTMLElement) {
  const visual = element.cloneNode(true) as HTMLElement;
  Object.assign(visual.style, {
    height: '100%',
    inset: '0',
    margin: '0',
    pointerEvents: 'none',
    position: 'absolute',
    width: '100%',
  });
  layer.append(visual);
  return visual;
}

const fade = defineEffect({
  remove: {
    needsSnapshot: false,
    animate: ({ element, layer }) =>
      createLayerClone(element, layer).animate(
        [
          { opacity: 1, transform: 'scale(1)' },
          { opacity: 0, transform: 'scale(.7)' },
        ],
        { duration: 250 },
      ),
  },
  restore: {
    needsSnapshot: false,
    animate: ({ element, layer }) =>
      createLayerClone(element, layer).animate(
        [
          { opacity: 0, transform: 'scale(.7)' },
          { opacity: 1, transform: 'scale(1)' },
        ],
        { duration: 320 },
      ),
  },
});

effects.remove(card, { effect: fade });
effects.restore(insertedCard, { effect: fade });
```

To replace the default SnapDOM capture, pass an adapter that returns a canvas:

```ts
import html2canvas from 'html2canvas';

const effects = new Disintegrator({
  capture: (element) => html2canvas(element),
});
```

Install your chosen capture library separately; this example uses `npm install html2canvas`.

## Documentation

The repository includes a complete, editable documentation site in English, Russian, Chinese, and Korean:

- [Installation and first effect](./docs/content/en/learn/installation.mdx)
- [Remove and restore](./docs/content/en/learn/remove-restore.mdx)
- [Built-in effects](./docs/content/en/learn/effects.mdx)
- [Retained nodes and memory](./docs/content/en/learn/retention.mdx)
- [Snapshot preparation](./docs/content/en/learn/preparation.mdx)
- [Custom effects](./docs/content/en/learn/custom-effects.mdx)
- [Framework integration](./docs/content/en/learn/frameworks.mdx)
- [API reference](./docs/content/en/reference/api.mdx)
- [Audio reference](./docs/content/en/reference/audio.mdx)

## Development

```sh
pnpm install
pnpm run dev
pnpm run check
```

`pnpm run check` runs formatting, linting, TypeScript checks, tests, package validation, production builds, size budgets, and the SSR documentation smoke tests.

## License

[MIT](./LICENSE) © 2026 [Yury Uvarov](https://github.com/uvarov-frontend)
