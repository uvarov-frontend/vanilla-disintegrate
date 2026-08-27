import { describe, expect, it, vi } from 'vitest';

import Disintegrator from '../src';

function rect(): DOMRect {
  return {
    bottom: 80,
    height: 80,
    left: 0,
    right: 240,
    top: 0,
    width: 240,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  };
}

function snapshot() {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;
  return canvas;
}

describe('Disintegrator.bind', () => {
  it('removes matching items through delegated triggers', async () => {
    const list = document.createElement('div');
    const card = document.createElement('article');
    const button = document.createElement('button');
    button.dataset.remove = '';
    card.className = 'card';
    card.append(button);
    list.append(card);
    document.body.append(list);
    Object.defineProperty(card, 'getBoundingClientRect', { value: rect });
    Object.defineProperty(list, 'getBoundingClientRect', { value: rect });

    const effect = new Disintegrator({
      capture: vi.fn().mockResolvedValue(snapshot()),
      particles: { frames: 2 },
      sound: false,
    });
    const unbind = effect.bind({ root: list, items: '.card', trigger: '[data-remove]' });

    button.click();
    await vi.waitFor(() => expect(card.isConnected).toBe(false));

    unbind();
    effect.destroy();
  });
});
