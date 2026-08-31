# Vanilla Disintegrate — Particle Animations for DOM Elements

[![A card dissolving into particles with the scatter preset](docs/public/readme-preview.html.png?v2)](https://disintegrate.uvarov.tech)

[![version](https://img.shields.io/npm/v/vanilla-disintegrate.svg)](https://www.npmjs.com/package/vanilla-disintegrate)
[![CI](https://github.com/uvarov-frontend/vanilla-disintegrate/actions/workflows/ci.yml/badge.svg)](https://github.com/uvarov-frontend/vanilla-disintegrate/actions/workflows/ci.yml)
[![downloads](https://img.shields.io/npm/dm/vanilla-disintegrate.svg)](https://www.npmjs.com/package/vanilla-disintegrate)
[![license](https://img.shields.io/npm/l/vanilla-disintegrate.svg)](./LICENSE)

Vanilla Disintegrate is a lightweight TypeScript library for removing and restoring DOM elements with particle animations inspired by the recognizable Thanos snap effect. It works with plain JavaScript and any framework that renders DOM, needs no runtime CSS, and provides four complete visual-and-audio presets plus a clean contract for building your own effects.

**Website and interactive documentation:** [disintegrate.uvarov.tech](https://disintegrate.uvarov.tech)

## Key Features

- **Real DOM particles**: Turn the captured appearance of a DOM element into animated particles.
- **Four complete presets**: Choose `dust`, `scatter`, `vapor`, or `wind`; every preset includes removal, restoration, and matching audio.
- **Restore any element**: Animate a retained node back into a user-chosen location or use `restore()` as an entrance animation for a completely new element.
- **Simple integration**: Create an instance and call `remove(element)` directly from a click handler.
- **Framework-agnostic**: Use it with vanilla JavaScript, React, Vue, Svelte, Solid, Angular, Web Components, or another DOM renderer.
- **Custom effects**: Define independent removal and restoration phases with WAAPI, Canvas, SVG, WebGL, CSS, or another animation engine.
- **Custom capture**: The `vanilla-disintegrate/snapdom` entry wires SnapDOM for you; the default entry accepts another renderer such as html2canvas.
- **Zero runtime dependencies**: The ESM package has no mandatory dependencies; SnapDOM is an optional peer installed only if you use its entry.
- **Independent audio**: Custom effects can use bundled sound names, URLs, local `Blob`/`File` objects, encoded data, `AudioBuffer`, or a custom player factory.
- **Background preparation**: Registered elements are pre-captured with a visible-idle policy and a bounded LRU snapshot cache; disable it when unnecessary.
- **Explicit memory control**: Keep a removed original node only with `retain: true`, then consume it with `take()` or release it with `discard()`.
- **No runtime CSS**: The library creates and removes its visual layer itself without a stylesheet import.
- **Accessible defaults**: Respects `prefers-reduced-motion` by default.

## Browser Support

Vanilla Disintegrate is built for modern browsers. Its runtime is emitted as ES2020 and relies on Canvas, Web Animations (`Animation.finished` and `Element.getAnimations()`), `AbortController`, and `requestAnimationFrame`. The built-in presets use the library's **WebGL2** particle renderer; custom effects can use any suitable animation engine. The combined API baseline is shown below; no polyfills are included.

| ![Chrome](https://raw.githubusercontent.com/alrra/browser-logos/master/src/chrome/chrome_48x48.png) | ![Firefox](https://raw.githubusercontent.com/alrra/browser-logos/master/src/firefox/firefox_48x48.png) | ![Edge](https://raw.githubusercontent.com/alrra/browser-logos/master/src/edge/edge_48x48.png) | ![Opera](https://raw.githubusercontent.com/alrra/browser-logos/master/src/opera/opera_48x48.png) | ![Safari](https://raw.githubusercontent.com/alrra/browser-logos/master/src/safari/safari_48x48.png) |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| 84+ ✔                                                                                               | 75+ ✔                                                                                                  | 84+ ✔                                                                                         | 70+ ✔                                                                                            | 15+ ✔                                                                                               |

The same baseline applies to Chrome for Android 84+ and iOS Safari 15+. These are API compatibility baselines, not a guarantee that every GPU, driver, or browser setting allows WebGL2 context creation. Initialize the library only in the browser: it is not intended to run during server-side rendering.

Where WebGL2 is missing or a context cannot be created, built-in preset visuals degrade instead of failing: `remove()` still detaches the element and `restore()` still reveals it, the operation resolves with status `skipped`, and `onError` receives the reason. Custom effects that do not use WebGL are unaffected, so a WAAPI or CSS phase keeps animating on older engines.

Each concurrently running built-in preset visual leases one WebGL2 context. When an operation ends, its textures are deleted and the context returns to a document-scoped pool. The pool retains at most two idle contexts for up to 30 seconds, destroys excess contexts immediately, and releases everything on `pagehide`.

`preparation` progressively enhances the default removal flow. Browsers without `IntersectionObserver`, `ResizeObserver`, or `requestIdleCallback` still run effects; preparation uses the available fallback instead.

SnapDOM captures the rendered element through Canvas. Images, fonts, and stylesheets from another origin must send the appropriate CORS headers or be served through SnapDOM's proxy option; otherwise they may be missing from the snapshot. Safari is supported, though captures that embed fonts or use background and mask images can take longer.

## Support and Feedback

Vanilla Disintegrate is free and open source. Maintaining it takes time and resources; donations help keep the project improving while remaining available to everyone.

If it helps your project, consider giving it a 🌟 star on [GitHub](https://github.com/uvarov-frontend/vanilla-disintegrate), making a donation, reporting an issue, or sharing an idea.

[![](https://www.paypalobjects.com/en_US/i/btn/btn_donateCC_LG.gif)](https://buymeacoffee.com/uvarov)

## Getting Started

### Installation

The package has no mandatory runtime dependencies. Capture is pluggable, so the capture library is installed alongside it — [SnapDOM](https://zumerlab.github.io/snapdom/) for the ready-made adapter:

```sh
npm install vanilla-disintegrate @zumer/snapdom
# or
yarn add vanilla-disintegrate @zumer/snapdom
# or
pnpm add vanilla-disintegrate @zumer/snapdom
# or
bun add vanilla-disintegrate @zumer/snapdom
```

The package has five tree-shakable entry points:

| Entry                            | Contents                                                                   | Install                   |
| -------------------------------- | -------------------------------------------------------------------------- | ------------------------- |
| `vanilla-disintegrate/core`      | Lifecycle, layout and audio for custom effects; no particles or presets.   | No runtime dependencies   |
| `vanilla-disintegrate/particles` | Particle factories and reusable geometry configurations.                   | No runtime dependencies   |
| `vanilla-disintegrate/sounds`    | URLs of the four bundled audio files, without the runtime.                 | No runtime dependencies   |
| `vanilla-disintegrate`           | `Disintegrator` with all four complete presets. You provide `capture`.     | No runtime dependencies   |
| `vanilla-disintegrate/snapdom`   | The same complete presets with SnapDOM already wired as default `capture`. | Requires `@zumer/snapdom` |

The default and `/snapdom` entries export the same `Disintegrator` API. Neither chooses an effect implicitly: every instance must receive exactly one `preset` or one custom `effect`. `@zumer/snapdom` is an optional peer dependency, and the other entries never reach for it. Import `/core` for a custom, snapshotless effect without pulling the particle renderer or bundled audio into the module graph.

### Remove an Element

Call `remove()` while the element is connected and visible. The library captures it, detaches it from the page, and plays the selected effect in an isolated visual layer.

```ts
import Disintegrator from 'vanilla-disintegrate/snapdom';

const effects = new Disintegrator({
  preset: 'dust',
});

const card = document.querySelector<HTMLElement>('.card');

if (card) {
  const unregister = effects.register(card);

  card.querySelector('button')?.addEventListener('click', () => {
    effects.remove(card);
    unregister();
  });
}
```

`remove()` returns an operation handle immediately. Await `operation.finished` only when subsequent code needs to wait for the visual animation.

```ts
const operation = effects.remove(card);

await operation.finished;
```

Only one operation can own an element at a time. A concurrent call does not touch the DOM or allocate a retention ID. Its `finished` promise waits for the current owner to release the element and then resolves with `status: 'rejected'`, so awaiting the handle remains a safe lifecycle barrier.

### Remove and Restore the Same Node

Set `retain: true` when you need to keep the original DOM node for undo or later restoration. The library does not decide where it belongs: take the node, insert it into the location chosen by your application, and call `restore()`.

```ts
const removal = effects.remove(card, {
  preset: 'wind',
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

The retained node remembers the complete presentation used for removal, so `restore()` uses the matching animation and sound unless another preset or custom effect is explicitly passed.

### Animate a New Element

`restore()` is also an entrance animation. Insert a new element first, then animate its visible final geometry.

```ts
const message = document.createElement('aside');
message.textContent = 'Saved';

const notifications = document.querySelector<HTMLElement>('.notifications');
if (notifications) {
  notifications.append(message);
  effects.restore(message, { preset: 'vapor' });
}
```

### Built-in Presets

| Preset    | Removal                                                     | Restoration                                                |
| --------- | ----------------------------------------------------------- | ---------------------------------------------------------- |
| `dust`    | Breaks into rising dust.                                    | Dust collects into the final element.                      |
| `scatter` | Dissolves left to right into a fine, upward-biased scatter. | Fragments gather from the same scattered field.            |
| `vapor`   | Lifts the surface away at random and swells as it climbs.   | A narrowing vapor stream condenses into the final element. |
| `wind`    | Carries particles away in a long stream.                    | Returns them from the same direction.                      |

Choose one complete preset for the instance or another complete preset for one operation:

```ts
const effects = new Disintegrator({ preset: 'vapor' });

effects.remove(firstCard);
effects.remove(secondCard, { preset: 'scatter' });
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

const customEffects = new Disintegrator({ effect: fade });

customEffects.remove(card);
customEffects.restore(insertedCard);
```

To use a renderer other than SnapDOM with the built-in presets, import the default entry and pass an adapter that returns a canvas:

```ts
import Disintegrator from 'vanilla-disintegrate';
import html2canvas from 'html2canvas';

const effects = new Disintegrator({
  preset: 'dust',
  capture: (element) => html2canvas(element),
});
```

Install your chosen capture library separately; this example uses `npm install html2canvas`. Nothing from SnapDOM enters your bundle on this path.

### Local setup or CDN

To start without a bundler or package manager, load the IIFE from the CDN or [download the latest local example](https://cdn.jsdelivr.net/npm/vanilla-disintegrate@latest/vanilla-disintegrate-iife.zip).

The IIFE build includes SnapDOM and exposes the API as `VanillaDisintegrate`:

```html
<script src="https://cdn.jsdelivr.net/npm/vanilla-disintegrate@latest/dist/vanilla-disintegrate.iife.min.js"></script>
<script>
  const effects = new VanillaDisintegrate.Disintegrator({ preset: 'dust' });
  effects.remove(document.querySelector('.card'));
</script>
```

The archive contains a minimal HTML example, the IIFE build, licenses, and built-in audio. Serve it through a local HTTP server. When copying files manually, keep `sounds` next to the IIFE script; CDN assets resolve automatically.

### Sound

Every built-in preset already includes audio for both phases. Restoration reuses the removal recording through `reverse`, so a second file is not shipped. Pass `sound: false` when the preset should stay visual-only:

```ts
const effects = new Disintegrator({ preset: 'dust' });

effects.remove(card, { sound: false });
```

With a custom effect, sound is off unless you provide an explicit remove/restore pair. A bundled name can be used directly as `src`, or you can provide a URL, local file, encoded data, decoded buffer, or player factory:

```ts
const effects = new Disintegrator({
  effect: fade,
  sound: {
    remove: { src: 'dust', volume: 0.35, fadeDuration: 0.12 },
    restore: { src: 'dust', volume: 0.35, fadeDuration: 0.12, reverse: true },
  },
});
```

Automatic audio preparation uses the `idle` strategy by default. Use `prepareAudio()` when a specific selection must be decoded before interaction, and call `remove()` or `restore()` from a user gesture so Web Audio can resume playback.

Call `remove()` or `restore()` from a user gesture such as a click so the library can resume Web Audio playback.

## Documentation

The complete documentation and interactive demos are available in English, Russian, Chinese, and Korean at [disintegrate.uvarov.tech](https://disintegrate.uvarov.tech):

- [Installation and first effect](https://disintegrate.uvarov.tech/docs/learn/installation/)
- [Remove and restore](https://disintegrate.uvarov.tech/docs/learn/remove-restore/)
- [Built-in presets](https://disintegrate.uvarov.tech/docs/learn/effects/)
- [Retained nodes and memory](https://disintegrate.uvarov.tech/docs/learn/retention/)
- [Snapshot preparation](https://disintegrate.uvarov.tech/docs/learn/preparation/)
- [Custom effects](https://disintegrate.uvarov.tech/docs/learn/custom-effects/)
- [Framework integration](https://disintegrate.uvarov.tech/docs/learn/frameworks/)
- [API reference](https://disintegrate.uvarov.tech/docs/reference/api/)
- [Audio reference](https://disintegrate.uvarov.tech/docs/reference/audio/)

## Development

```sh
pnpm install
pnpm run dev
pnpm run check
```

`pnpm run check` runs formatting, linting, TypeScript checks, unit and browser tests, coverage thresholds, package validation, production builds, size budgets, and the SSR documentation smoke tests.

## License

[MIT](./LICENSE) © 2026 [Yury Uvarov](https://github.com/uvarov-frontend). Bundled third-party licenses are listed in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
