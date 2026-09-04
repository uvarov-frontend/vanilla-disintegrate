# Vanilla Disintegrate — Animate DOM Removal and Restoration

[![A card dissolving into particles with the scatter preset](docs/public/readme-preview.html.png?v2)](https://disintegrate.uvarov.tech)

[![version](https://img.shields.io/npm/v/vanilla-disintegrate.svg)](https://www.npmjs.com/package/vanilla-disintegrate)
[![CI](https://github.com/uvarov-frontend/vanilla-disintegrate/actions/workflows/ci.yml/badge.svg)](https://github.com/uvarov-frontend/vanilla-disintegrate/actions/workflows/ci.yml)
[![downloads](https://img.shields.io/npm/dm/vanilla-disintegrate.svg)](https://www.npmjs.com/package/vanilla-disintegrate)
[![license](https://img.shields.io/npm/l/vanilla-disintegrate.svg)](./LICENSE)

Vanilla Disintegrate is a lightweight TypeScript library for removing and restoring DOM elements with particle animations inspired by the recognizable Thanos snap effect. It works with plain JavaScript and any framework without requiring runtime CSS.

**Documentation and interactive playground:** [disintegrate.uvarov.tech](https://disintegrate.uvarov.tech)

## Key Features

- **Thanos snap effect**: Recreate the recognizable cinematic disintegration and restoration of real DOM elements with particles.
- **Four complete presets**: Choose `dust`, `scatter`, `vapor`, or `wind`; every preset includes removal, restoration, and matching audio.
- **Restore any element**: Animate a retained node back into a user-chosen location or use `restore()` to animate a completely new element appearing.
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

Each concurrently running built-in preset visual leases one WebGL2 context. When an operation ends, its textures are deleted and the context returns to a document-scoped pool. By default, the pool keeps at most four contexts alive, retains up to two of them while idle for 30 seconds, destroys excess contexts immediately, and releases everything on `pagehide`. These limits can be adjusted with `configureParticleContexts()` before effects start.

`preparation` progressively enhances the default removal flow. Browsers without `IntersectionObserver`, `ResizeObserver`, or `requestIdleCallback` still run effects; preparation uses the available fallback instead.

SnapDOM captures the rendered element through Canvas. Images, fonts, and stylesheets from another origin must send the appropriate CORS headers or be served through SnapDOM's proxy option; otherwise they may be missing from the snapshot. Safari is supported, though captures that embed fonts or use background and mask images can take longer.

## Support and Feedback

Vanilla Disintegrate is free and open source. Maintaining it takes time and resources; donations help keep the project improving while remaining available to everyone.

If it helps your project, consider giving it a 🌟 star on [GitHub](https://github.com/uvarov-frontend/vanilla-disintegrate), making a donation, reporting an issue, or sharing an idea.

[![](https://www.paypalobjects.com/en_US/i/btn/btn_donateCC_LG.gif)](https://buymeacoffee.com/uvarov)

## Getting Started

### Install

```sh
npm install vanilla-disintegrate @zumer/snapdom
```

### Use a Built-in Preset

```ts
import Disintegrator from 'vanilla-disintegrate/snapdom';

const effects = new Disintegrator({ preset: 'dust' });
const card = document.querySelector<HTMLElement>('.card');

document.querySelector('#remove')?.addEventListener('click', () => {
  if (card) effects.remove(card);
});
```

### Create a Custom Particle Effect

```ts
import Disintegrator, { createParticleEffect } from 'vanilla-disintegrate/snapdom';

const effect = createParticleEffect({
  remove: {
    curve: 'burst',
    release: 'left',
  },
  restore: {
    curve: 'float',
    release: 'top',
  },
});

const effects = new Disintegrator({ effect });
effects.remove('.card');
```

Build a complete effect in the [interactive playground](https://disintegrate.uvarov.tech) or read the [documentation](https://disintegrate.uvarov.tech/docs/learn/installation/) for restoration, audio, capture adapters, frameworks, and the full API.

## License

[MIT](./LICENSE) © 2026 [Yury Uvarov](https://github.com/uvarov-frontend). Bundled third-party licenses are listed in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
