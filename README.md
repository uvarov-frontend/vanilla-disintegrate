# Vanilla Disintegrate

[![Vanilla Disintegrate preview](https://github.com/user-attachments/assets/c333d6f6-4cbf-4fd4-8865-7611872ea98b)](https://github.com/uvarov-frontend/vanilla-disintegrate)

[![npm](https://img.shields.io/npm/v/vanilla-disintegrate.svg)](https://www.npmjs.com/package/vanilla-disintegrate)
[![CI](https://github.com/uvarov-frontend/vanilla-disintegrate/actions/workflows/ci.yml/badge.svg)](https://github.com/uvarov-frontend/vanilla-disintegrate/actions/workflows/ci.yml)
[![downloads](https://img.shields.io/npm/dm/vanilla-disintegrate.svg)](https://www.npmjs.com/package/vanilla-disintegrate)
[![license](https://img.shields.io/npm/l/vanilla-disintegrate.svg)](./LICENSE)

A lightweight TypeScript library for removing and restoring any DOM element with a Thanos-snap effect. It includes four paired animations, optional sound, custom effects, and works with any browser UI that renders DOM elements.

[npm](https://www.npmjs.com/package/vanilla-disintegrate) · [GitHub](https://github.com/uvarov-frontend/vanilla-disintegrate)

## Install

```sh
npm install vanilla-disintegrate
```

## Use

```ts
import Disintegrator from 'vanilla-disintegrate';

const effects = new Disintegrator();
const card = document.querySelector<HTMLElement>('.card')!;

effects.remove(card, { effect: 'dust' });
```

The repository includes documentation for restoring saved nodes, custom animations, audio, snapshot preparation, and framework integration.

## Support

Vanilla Disintegrate is free and open source. If it helps your project, consider giving it a star on [GitHub](https://github.com/uvarov-frontend/vanilla-disintegrate) or supporting its development.

[![](https://www.paypalobjects.com/en_US/i/btn/btn_donateCC_LG.gif)](https://buymeacoffee.com/uvarov)

## License

[MIT](./LICENSE) © 2026 [Yury Uvarov](https://github.com/uvarov-frontend)
