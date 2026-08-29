import { beforeEach, vi } from 'vitest';

export function resolvedAnimation(): Animation {
  return {
    cancel: vi.fn(),
    pause: vi.fn(),
    currentTime: 0,
    effect: {
      getComputedTiming: () => ({ iterations: 1 }),
    },
    finished: Promise.resolve(),
    playState: 'running',
  } as unknown as Animation;
}

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });

  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    value: vi.fn(resolvedAnimation),
  });

  Object.defineProperty(HTMLElement.prototype, 'getAnimations', {
    configurable: true,
    value: vi.fn().mockReturnValue([]),
  });

  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value(this: HTMLCanvasElement, contextId: string) {
      if (contextId !== '2d') return null;
      return {
        createImageData: (width: number, height: number) => ({
          data: new Uint8ClampedArray(width * height * 4),
          width,
          height,
          colorSpace: 'srgb',
        }),
        drawImage: vi.fn(),
        getImageData: (_x: number, _y: number, width: number, height: number) => {
          const data = new Uint8ClampedArray(width * height * 4);
          for (let index = 3; index < data.length; index += 4) data[index] = 255;
          return { data, width, height, colorSpace: 'srgb' };
        },
        putImageData: vi.fn(),
      } as unknown as CanvasRenderingContext2D;
    },
  });
});
