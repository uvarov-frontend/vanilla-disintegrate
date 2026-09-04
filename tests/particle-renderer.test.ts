import { describe, expect, it, vi } from 'vitest';

import { resolveParticles } from '../src/defaults';
import {
  configureParticleContexts,
  createParticleAnimation,
  createParticleField,
  createParticleRestoreAnimation,
  type ParticleRenderer,
} from '../src/particle-renderer';
import type { AnimationContext } from '../src/types';

function createWebGL2Stub() {
  const constants = {
    ARRAY_BUFFER: 1,
    BLEND: 2,
    CLAMP_TO_EDGE: 3,
    COLOR_BUFFER_BIT: 4,
    COMPILE_STATUS: 5,
    DEPTH_TEST: 6,
    FLOAT: 7,
    FRAGMENT_SHADER: 8,
    LINEAR: 9,
    LINK_STATUS: 10,
    MAX_TEXTURE_SIZE: 11,
    MAX_VIEWPORT_DIMS: 12,
    NEAREST: 13,
    ONE: 14,
    ONE_MINUS_SRC_ALPHA: 15,
    POINTS: 16,
    R8: 17,
    RED: 18,
    RGBA: 19,
    STATIC_DRAW: 20,
    TEXTURE0: 21,
    TEXTURE_2D: 22,
    TEXTURE_MAG_FILTER: 23,
    TEXTURE_MIN_FILTER: 24,
    TEXTURE_WRAP_S: 25,
    TEXTURE_WRAP_T: 26,
    TRIANGLES: 27,
    UNPACK_ALIGNMENT: 28,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 29,
    UNSIGNED_BYTE: 30,
    VERTEX_SHADER: 31,
  } as const;
  let attribute = 0;
  const loseContext = vi.fn();
  const bufferData = vi.fn<(target: number, data: ArrayBufferView | number, usage: number) => void>();
  const createBuffer = vi.fn(() => ({}));
  const createProgram = vi.fn(() => ({}));
  const deleteBuffer = vi.fn();
  const deleteProgram = vi.fn();
  const drawArrays = vi.fn<(mode: number, first: number, count: number) => void>();
  const gl = {
    ...constants,
    activeTexture: vi.fn(),
    attachShader: vi.fn(),
    bindBuffer: vi.fn(),
    bindTexture: vi.fn(),
    bindVertexArray: vi.fn(),
    blendFunc: vi.fn(),
    bufferData,
    clear: vi.fn(),
    clearColor: vi.fn(),
    compileShader: vi.fn(),
    createBuffer,
    createProgram,
    createShader: vi.fn(() => ({})),
    createTexture: vi.fn(() => ({})),
    createVertexArray: vi.fn(() => ({})),
    deleteBuffer,
    deleteProgram,
    deleteShader: vi.fn(),
    deleteTexture: vi.fn(),
    deleteVertexArray: vi.fn(),
    disable: vi.fn(),
    drawArrays,
    enable: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    getAttribLocation: vi.fn(() => attribute++),
    getExtension: vi.fn(() => ({ loseContext })),
    getParameter: vi.fn((name: number) => (name === constants.MAX_VIEWPORT_DIMS ? new Int32Array([4096, 4096]) : 4096)),
    getProgramInfoLog: vi.fn(() => ''),
    getProgramParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ''),
    getShaderParameter: vi.fn(() => true),
    getUniformLocation: vi.fn(() => ({})),
    isContextLost: vi.fn(() => false),
    linkProgram: vi.fn(),
    pixelStorei: vi.fn(),
    shaderSource: vi.fn(),
    texImage2D: vi.fn(),
    texParameteri: vi.fn(),
    uniform1f: vi.fn(),
    uniform1i: vi.fn(),
    uniform2f: vi.fn(),
    useProgram: vi.fn(),
    vertexAttribPointer: vi.fn(),
    viewport: vi.fn(),
  } as unknown as WebGL2RenderingContext;
  return { bufferData, createBuffer, createProgram, deleteBuffer, deleteProgram, drawArrays, gl, loseContext };
}

function particleContext(snapshot: HTMLCanvasElement): AnimationContext {
  return {
    operation: 'remove',
    element: document.createElement('div'),
    layer: document.createElement('div'),
    visual: null,
    snapshot,
    bounds: new DOMRect(0, 0, snapshot.width, snapshot.height),
    signal: new AbortController().signal,
    reducedMotion: false,
    random: () => 0.5,
    addCleanup: () => undefined,
  };
}

function particleComponentAt(
  field: ReturnType<typeof createParticleField>,
  x: number,
  y: number,
  component: number,
): number {
  for (let offset = 0; offset < field.data.length; offset += 7) {
    if (field.data[offset] === x && field.data[offset + 1] === y) return field.data[offset + component] ?? 0;
  }
  throw new Error(`Missing particle at ${String(x)}:${String(y)}`);
}

describe('particle renderer', () => {
  it('assigns every visible source block once in Safari-safe upload order', () => {
    const width = 4;
    const height = 3;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let index = 3; index < pixels.length; index += 4) pixels[index] = 255;

    const field = createParticleField(pixels, width, height, resolveParticles(), 1, 1, () => 0.5);
    const sources = Array.from({ length: field.data.length / 7 }, (_, index) => {
      const offset = index * 7;
      return `${String(field.data[offset])}:${String(field.data[offset + 1])}`;
    });

    expect(field.blockSize).toBe(1);
    expect(sources).toHaveLength(width * height);
    expect(new Set(sources).size).toBe(sources.length);
    // Ascending source order produces a phantom strip along the element edge in Safari's WebGL renderer.
    expect(sources[0]).toBe('3:2');
    expect(sources.at(-1)).toBe('0:0');
    expect(field.thresholdMap.every((threshold) => threshold > 0 && threshold < 255)).toBe(true);
    expect(field.layoutReleaseProgress).toBeGreaterThan(0);
    expect(field.layoutReleaseProgress).toBeLessThan(1);

    const particleThresholds = Array.from({ length: field.data.length / 7 }, (_, index) => {
      const offset = index * 7;
      const x = field.data[offset] ?? 0;
      const y = field.data[offset + 1] ?? 0;
      const thresholdX = Math.floor(x / field.blockSize);
      const thresholdY = Math.floor(y / field.blockSize);
      return field.thresholdMap[thresholdY * field.thresholdWidth + thresholdX] ?? 0;
    }).sort((first, second) => first - second);
    const releaseIndex = Math.ceil(particleThresholds.length * 0.6) - 1;
    expect(field.layoutReleaseProgress).toBe((particleThresholds[releaseIndex] ?? 0) / 255);
  });

  it('does not create particles for fully transparent source blocks', () => {
    const pixels = new Uint8ClampedArray(4 * 4 * 4);
    pixels[3] = 255;

    const field = createParticleField(pixels, 4, 4, resolveParticles(), 1, 1, () => 0.5);

    expect(field.data.length / 7).toBe(1);
  });

  it('stores one threshold per particle block and sizes the particle buffer exactly', () => {
    const width = 600;
    const height = 400;
    const pixels = new Uint8ClampedArray(width * height * 4);
    pixels[3] = 255;

    const field = createParticleField(pixels, width, height, resolveParticles(), 1, 1, () => 0.5);

    expect(field.blockSize).toBe(2);
    expect(field.thresholdWidth).toBe(300);
    expect(field.thresholdHeight).toBe(200);
    expect(field.thresholdMap).toHaveLength(60_000);
    expect(field.data).toHaveLength(7);
    expect(field.data.byteLength).toBe(7 * Float32Array.BYTES_PER_ELEMENT);
  });

  it('keeps WebGL particle density independent from timeline options', () => {
    const width = 250;
    const height = 200;
    const pixels = new Uint8ClampedArray(width * height * 4);
    const short = createParticleField(pixels, width, height, resolveParticles({ duration: 200 }), 1, 1, () => 0.5);
    const long = createParticleField(pixels, width, height, resolveParticles({ duration: 4000 }), 1, 1, () => 0.5);

    expect(short.blockSize).toBe(1);
    expect(long.blockSize).toBe(1);
  });

  it('reserves enough timeline for the last particles to fade naturally', () => {
    const pixels = new Uint8ClampedArray([255, 255, 255, 255]);
    const field = createParticleField(pixels, 1, 1, resolveParticles({ release: 'random' }), 1, 1, () => 1);

    expect(field.data[2]).toBeCloseTo(0.68);
  });

  it('dissolves vapor evenly instead of peeling toward the centre', () => {
    const pixels = new Uint8ClampedArray(9 * 4);
    for (let index = 3; index < pixels.length; index += 4) pixels[index] = 255;
    const field = createParticleField(pixels, 9, 1, resolveParticles({ release: 'top' }), 1, 1, () => 0.5);

    // One row, so nothing in the horizontal position may order the departures.
    const thresholdAt = (column: number) => particleComponentAt(field, column, 0, 2);
    expect(thresholdAt(0)).toBeCloseTo(thresholdAt(4), 6);
    expect(thresholdAt(8)).toBeCloseTo(thresholdAt(4), 6);
  });

  it('releases the top rows of vapor first', () => {
    const pixels = new Uint8ClampedArray(9 * 4);
    for (let index = 3; index < pixels.length; index += 4) pixels[index] = 255;
    const field = createParticleField(pixels, 1, 9, resolveParticles({ release: 'top' }), 1, 1, () => 0.5);

    // Row 0 is the top of the element, so it must leave before the bottom row.
    const thresholdAt = (rowIndex: number) => particleComponentAt(field, 0, rowIndex, 2);
    expect(thresholdAt(0)).toBeLessThan(thresholdAt(8));
  });

  it('draws vapor toward a narrower central plume', () => {
    const pixels = new Uint8ClampedArray(9 * 4);
    for (let index = 3; index < pixels.length; index += 4) pixels[index] = 255;
    const field = createParticleField(pixels, 9, 1, resolveParticles({ convergence: 1 }), 1, 1, () => 0.5);

    const horizontalVelocityAt = (column: number) => particleComponentAt(field, column, 0, 3);
    expect(horizontalVelocityAt(0)).toBeGreaterThan(0);
    expect(horizontalVelocityAt(8)).toBeLessThan(0);
  });

  it('dissolves scatter from left to right', () => {
    const pixels = new Uint8ClampedArray(9 * 4);
    for (let index = 3; index < pixels.length; index += 4) pixels[index] = 255;
    const scatter = createParticleField(pixels, 9, 1, resolveParticles({ release: 'left' }), 1, 1, () => 0.5);

    const thresholdAt = (column: number) => particleComponentAt(scatter, column, 0, 2);
    expect(thresholdAt(0)).toBeLessThan(thresholdAt(8));
  });

  it('supports independently directed horizontal and vertical paths', () => {
    const pixels = new Uint8ClampedArray([255, 255, 255, 255]);
    const upward = createParticleField(
      pixels,
      1,
      1,
      resolveParticles({ horizontalTravel: [-100, 100], verticalTravel: [-100, 100] }),
      1,
      1,
      () => 0,
    );
    const downward = createParticleField(
      pixels,
      1,
      1,
      resolveParticles({ horizontalTravel: [-100, 100], verticalTravel: [-100, 100] }),
      1,
      1,
      () => 1,
    );

    expect(upward.data[3]).toBeLessThan(0);
    expect(upward.data[4]).toBeLessThan(0);
    expect(downward.data[3]).toBeGreaterThan(0);
    expect(downward.data[4]).toBeGreaterThan(0);
  });

  it('keeps particle geometry independent from the temporal curve', () => {
    const pixels = new Uint8ClampedArray(4 * 4 * 4).fill(255);
    const random = () => {
      let state = 0;
      return () => {
        state = (state * 1_664_525 + 1_013_904_223) >>> 0;
        return state / 4_294_967_296;
      };
    };
    const options = {
      convergence: 0.6,
      horizontalTravel: [-80, 120] as const,
      release: 'top' as const,
      verticalTravel: [-140, 35] as const,
    };

    const settle = createParticleField(pixels, 4, 4, resolveParticles({ ...options, curve: 'settle' }), 1, 1, random());
    const burst = createParticleField(pixels, 4, 4, resolveParticles({ ...options, curve: 'burst' }), 1, 1, random());

    expect(burst.thresholdMap).toEqual(settle.thresholdMap);
    expect(burst.data).toEqual(settle.data);
  });

  it('does not substitute another renderer when WebGL2 is unavailable', () => {
    const snapshot = document.createElement('canvas');
    snapshot.width = 2;
    snapshot.height = 2;
    const context: AnimationContext = {
      operation: 'remove',
      element: document.createElement('div'),
      layer: document.createElement('div'),
      visual: null,
      snapshot,
      bounds: new DOMRect(0, 0, 2, 2),
      signal: new AbortController().signal,
      reducedMotion: false,
      random: () => 0.5,
      addCleanup: () => undefined,
    };

    expect(createParticleAnimation()(context)).toBeNull();
    expect(createParticleRestoreAnimation()({ ...context, operation: 'restore' })).toBeNull();
  });

  it('applies automatic, exact and custom source-resolution policies', () => {
    const originalGetContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext')
      ?.value as typeof HTMLCanvasElement.prototype.getContext;
    const { gl } = createWebGL2Stub();
    const readbackSizes: Array<readonly [number, number]> = [];
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      this: HTMLCanvasElement,
      contextId: string,
      options?: unknown,
    ) {
      if (contextId === 'webgl2') return gl;
      const context = originalGetContext.call(this, contextId, options as never);
      if (contextId !== '2d' || context === null) return context;
      const readback = context as CanvasRenderingContext2D;
      const getImageData = readback.getImageData.bind(readback);
      readback.getImageData = (x: number, y: number, width: number, height: number) => {
        readbackSizes.push([width, height]);
        return getImageData(x, y, width, height);
      };
      return readback;
    } as typeof HTMLCanvasElement.prototype.getContext);
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const snapshot = document.createElement('canvas');
    snapshot.width = 4000;
    snapshot.height = 3000;
    const automatic = createParticleAnimation({ duration: 20, stagger: 0 })(
      particleContext(snapshot),
    ) as ParticleRenderer | null;

    const narrowSnapshot = document.createElement('canvas');
    narrowSnapshot.width = 2200;
    narrowSnapshot.height = 100;

    const exact = createParticleAnimation({
      duration: 20,
      stagger: 0,
      renderQuality: 'exact',
    })(particleContext(narrowSnapshot)) as ParticleRenderer | null;
    const custom = createParticleAnimation({
      duration: 20,
      stagger: 0,
      renderQuality: {
        maxSourcePixels: 100_000,
        maxSourceDimension: 1000,
        maxRenderPixels: 1_000_000,
      },
    })(particleContext(narrowSnapshot)) as ParticleRenderer | null;
    const roundedSnapshot = document.createElement('canvas');
    roundedSnapshot.width = 1758;
    roundedSnapshot.height = 1195;
    const rounded = createParticleAnimation({ duration: 20, stagger: 0 })({
      ...particleContext(roundedSnapshot),
      bounds: new DOMRect(0, 0, 394.045, 267.839),
    }) as ParticleRenderer | null;

    expect(automatic).not.toBeNull();
    expect(exact).not.toBeNull();
    expect(custom).not.toBeNull();
    expect(rounded).not.toBeNull();
    const automaticSize = readbackSizes[0];
    expect(automaticSize).toBeDefined();
    expect((automaticSize?.[0] ?? 0) * (automaticSize?.[1] ?? 0)).toBeLessThanOrEqual(2_000_000);
    expect(automaticSize?.[0]).toBeLessThanOrEqual(2048);
    expect(automaticSize?.[1]).toBeLessThanOrEqual(2048);
    expect((automatic?.canvas.width ?? 0) * (automatic?.canvas.height ?? 0)).toBeLessThanOrEqual(4_000_000);
    expect(readbackSizes.slice(1, 3)).toEqual([
      [2200, 100],
      [1000, 45],
    ]);
    expect((custom?.canvas.width ?? 0) * (custom?.canvas.height ?? 0)).toBeLessThanOrEqual(1_000_000);
    expect((rounded?.canvas.width ?? 0) * (rounded?.canvas.height ?? 0)).toBeLessThanOrEqual(4_000_000);
    automatic?.dispose();
    exact?.dispose();
    custom?.dispose();
    rounded?.dispose();
    window.dispatchEvent(new Event('pagehide'));
  });

  it('aligns the intact source quad to physical renderer pixels', () => {
    const originalGetContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext')
      ?.value as typeof HTMLCanvasElement.prototype.getContext;
    const { gl } = createWebGL2Stub();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      this: HTMLCanvasElement,
      contextId: string,
      options?: unknown,
    ) {
      if (contextId === 'webgl2') return gl;
      return originalGetContext.call(this, contextId, options as never);
    } as typeof HTMLCanvasElement.prototype.getContext);
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const snapshot = document.createElement('canvas');
    snapshot.width = 37;
    snapshot.height = 19;
    const context = {
      ...particleContext(snapshot),
      bounds: new DOMRect(12.3, 45.6, 18.5, 9.5),
    };
    const renderer = createParticleAnimation({ duration: 20, stagger: 0 })(context) as ParticleRenderer | null;

    expect(renderer).not.toBeNull();
    const cssWidth = Number.parseFloat(renderer?.canvas.style.width ?? '0');
    const cssHeight = Number.parseFloat(renderer?.canvas.style.height ?? '0');
    const scaleX = (renderer?.canvas.width ?? 0) / cssWidth;
    const scaleY = (renderer?.canvas.height ?? 0) / cssHeight;
    const sourceX = -Number.parseFloat(renderer?.canvas.style.left ?? '0') * scaleX;
    const sourceY = -Number.parseFloat(renderer?.canvas.style.top ?? '0') * scaleY;
    expect(sourceX).toBeCloseTo(Math.round(sourceX), 10);
    expect(sourceY).toBeCloseTo(Math.round(sourceY), 10);
    expect(context.bounds.width * scaleX).toBeCloseTo(snapshot.width, 10);
    expect(context.bounds.height * scaleY).toBeCloseTo(snapshot.height, 10);
    renderer?.dispose();
    window.dispatchEvent(new Event('pagehide'));
  });

  it('clamps the context ceiling and reports the values in use', () => {
    try {
      expect(configureParticleContexts({ maxContexts: 6, maxIdleContexts: 3 })).toEqual({
        maxContexts: 6,
        maxIdleContexts: 3,
      });
      // Keeping more warm than alive is meaningless, so the idle count follows.
      expect(configureParticleContexts({ maxContexts: 2 })).toEqual({ maxContexts: 2, maxIdleContexts: 2 });
      expect(configureParticleContexts({ maxContexts: 0, maxIdleContexts: -4 })).toEqual({
        maxContexts: 1,
        maxIdleContexts: 0,
      });
      expect(configureParticleContexts({ maxContexts: Number.NaN })).toEqual({ maxContexts: 1, maxIdleContexts: 0 });
    } finally {
      configureParticleContexts({ maxContexts: 4, maxIdleContexts: 2 });
    }
  });

  it('reports hardware limits instead of degrading exact rendering', () => {
    const originalGetContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext')
      ?.value as typeof HTMLCanvasElement.prototype.getContext;
    const { gl, loseContext } = createWebGL2Stub();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      this: HTMLCanvasElement,
      contextId: string,
      options?: unknown,
    ) {
      if (contextId === 'webgl2') return gl;
      return originalGetContext.call(this, contextId, options as never);
    } as typeof HTMLCanvasElement.prototype.getContext);
    const snapshot = document.createElement('canvas');
    snapshot.width = 4200;
    snapshot.height = 1;

    expect(() => createParticleAnimation({ renderQuality: 'exact' })(particleContext(snapshot))).toThrow(
      /Exact particle rendering requires a 4200×1 texture/,
    );
    expect(loseContext).toHaveBeenCalledOnce();
  });

  it('splits large particle fields into Safari-safe vertex buffers without dropping particles', () => {
    const originalGetContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext')
      ?.value as typeof HTMLCanvasElement.prototype.getContext;
    const { bufferData, deleteBuffer, drawArrays, gl } = createWebGL2Stub();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      this: HTMLCanvasElement,
      contextId: string,
      options?: unknown,
    ) {
      if (contextId === 'webgl2') return gl;
      return originalGetContext.call(this, contextId, options as never);
    } as typeof HTMLCanvasElement.prototype.getContext);
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const snapshot = document.createElement('canvas');
    snapshot.width = 400;
    snapshot.height = 100;

    const renderer = createParticleAnimation({ duration: 20, stagger: 0 })(
      particleContext(snapshot),
    ) as ParticleRenderer | null;
    const particleUploads = bufferData.mock.calls
      .map((call) => call[1])
      .filter((data): data is Float32Array => data instanceof Float32Array && data.length > 12);
    const particleDraws = drawArrays.mock.calls.filter((call) => call[0] === gl.POINTS);

    expect(renderer).not.toBeNull();
    expect(particleUploads.map((data) => data.length / 7)).toEqual([32_768, 7_232]);
    expect(particleDraws.map((call) => call[2])).toEqual([32_768, 7_232]);

    renderer?.dispose();
    expect(deleteBuffer).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('pagehide'));
  });

  it('reuses compiled WebGL resources and releases them when the page is hidden', async () => {
    const originalGetContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext')
      ?.value as typeof HTMLCanvasElement.prototype.getContext;
    const { createProgram, deleteProgram, drawArrays, gl, loseContext } = createWebGL2Stub();
    const webglRequests = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      this: HTMLCanvasElement,
      contextId: string,
      options?: unknown,
    ) {
      if (contextId === 'webgl2') {
        webglRequests();
        return gl;
      }
      return originalGetContext.call(this, contextId, options as never);
    } as typeof HTMLCanvasElement.prototype.getContext);
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    let runIdle: IdleRequestCallback = () => undefined;
    const requestIdleCallback = vi.fn((callback: IdleRequestCallback) => {
      runIdle = callback;
      return 1;
    });
    vi.stubGlobal('requestIdleCallback', requestIdleCallback);
    vi.stubGlobal('cancelIdleCallback', vi.fn());

    const factory = createParticleAnimation({ duration: 20, stagger: 0 });
    expect(requestIdleCallback).not.toHaveBeenCalled();
    for (let index = 0; index < 2; index += 1) {
      const snapshot = document.createElement('canvas');
      snapshot.width = 16;
      snapshot.height = 16;
      const renderer = factory(particleContext(snapshot)) as ParticleRenderer | null;
      expect(renderer).not.toBeNull();
      if (renderer === null) continue;
      await renderer.finished;
      renderer.dispose();
      if (index === 0) {
        expect(requestIdleCallback).toHaveBeenCalledTimes(1);
        runIdle({ didTimeout: false, timeRemaining: () => 10 });
      }
    }

    expect(webglRequests).toHaveBeenCalledTimes(1);
    expect(createProgram).toHaveBeenCalledTimes(4);
    expect(drawArrays).toHaveBeenCalled();
    window.dispatchEvent(new Event('pagehide'));
    expect(loseContext).toHaveBeenCalledTimes(1);
    expect(deleteProgram).toHaveBeenCalledTimes(4);
  });
});
