import { describe, expect, it, vi } from 'vitest';

import { resolveParticles } from '../src/defaults';
import {
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
  const createProgram = vi.fn(() => ({}));
  const deleteProgram = vi.fn();
  const drawArrays = vi.fn();
  const gl = {
    ...constants,
    activeTexture: vi.fn(),
    attachShader: vi.fn(),
    bindBuffer: vi.fn(),
    bindTexture: vi.fn(),
    bindVertexArray: vi.fn(),
    blendFunc: vi.fn(),
    bufferData: vi.fn(),
    clear: vi.fn(),
    clearColor: vi.fn(),
    compileShader: vi.fn(),
    createBuffer: vi.fn(() => ({})),
    createProgram,
    createShader: vi.fn(() => ({})),
    createTexture: vi.fn(() => ({})),
    createVertexArray: vi.fn(() => ({})),
    deleteBuffer: vi.fn(),
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
  return { createProgram, deleteProgram, drawArrays, gl, loseContext };
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

describe('particle renderer', () => {
  it('assigns every visible source block to exactly one particle', () => {
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
    const field = createParticleField(pixels, 1, 1, resolveParticles({ origin: 'random' }), 1, 1, () => 1);

    expect(field.data[2]).toBeCloseTo(0.68);
  });

  it('dissolves vapor evenly instead of peeling toward the centre', () => {
    const pixels = new Uint8ClampedArray(9 * 4);
    for (let index = 3; index < pixels.length; index += 4) pixels[index] = 255;
    const field = createParticleField(pixels, 9, 1, resolveParticles({ motion: 'vapor' }), 1, 1, () => 0.5);

    // One row, so nothing in the horizontal position may order the departures.
    const thresholdAt = (column: number) => field.data[column * 7 + 2] ?? 0;
    expect(thresholdAt(0)).toBeCloseTo(thresholdAt(4), 6);
    expect(thresholdAt(8)).toBeCloseTo(thresholdAt(4), 6);
  });

  it('releases the top rows of vapor first', () => {
    const pixels = new Uint8ClampedArray(9 * 4);
    for (let index = 3; index < pixels.length; index += 4) pixels[index] = 255;
    const field = createParticleField(pixels, 1, 9, resolveParticles({ motion: 'vapor' }), 1, 1, () => 0.5);

    // Row 0 is the top of the element, so it must leave before the bottom row.
    const thresholdAt = (rowIndex: number) => field.data[rowIndex * 7 + 2] ?? 0;
    expect(thresholdAt(0)).toBeLessThan(thresholdAt(8));
  });

  it('draws vapor toward a narrower central plume', () => {
    const pixels = new Uint8ClampedArray(9 * 4);
    for (let index = 3; index < pixels.length; index += 4) pixels[index] = 255;
    const field = createParticleField(pixels, 9, 1, resolveParticles({ motion: 'vapor' }), 1, 1, () => 0.5);

    const horizontalVelocityAt = (column: number) => field.data[column * 7 + 3] ?? 0;
    expect(horizontalVelocityAt(0)).toBeGreaterThan(0);
    expect(horizontalVelocityAt(8)).toBeLessThan(0);
  });

  it('dissolves scatter from left to right', () => {
    const pixels = new Uint8ClampedArray(9 * 4);
    for (let index = 3; index < pixels.length; index += 4) pixels[index] = 255;
    const scatter = createParticleField(
      pixels,
      9,
      1,
      resolveParticles({ motion: 'scatter', origin: 'left' }),
      1,
      1,
      () => 0.5,
    );

    const thresholdAt = (column: number) => scatter.data[column * 7 + 2] ?? 0;
    expect(thresholdAt(0)).toBeLessThan(thresholdAt(8));
  });

  it('spreads scatter on individually directed paths with an upward bias', () => {
    const pixels = new Uint8ClampedArray([255, 255, 255, 255]);
    const upward = createParticleField(
      pixels,
      1,
      1,
      resolveParticles({ motion: 'scatter', horizontalTravel: [-100, 100], rise: [50, 100] }),
      1,
      1,
      () => 0,
    );
    const downward = createParticleField(
      pixels,
      1,
      1,
      resolveParticles({ motion: 'scatter', horizontalTravel: [-100, 100], rise: [50, 100] }),
      1,
      1,
      () => 1,
    );

    expect(upward.data[3]).toBeLessThan(0);
    expect(upward.data[4]).toBeLessThan(0);
    expect(downward.data[3]).toBeGreaterThan(0);
    expect(downward.data[4]).toBeGreaterThan(0);
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
    expect(requestIdleCallback).toHaveBeenCalledTimes(1);
    runIdle({ didTimeout: false, timeRemaining: () => 10 });
    for (let index = 0; index < 2; index += 1) {
      const snapshot = document.createElement('canvas');
      snapshot.width = 16;
      snapshot.height = 16;
      const renderer = factory(particleContext(snapshot)) as ParticleRenderer | null;
      expect(renderer).not.toBeNull();
      if (renderer === null) continue;
      await renderer.finished;
      renderer.dispose();
    }

    expect(webglRequests).toHaveBeenCalledTimes(1);
    expect(createProgram).toHaveBeenCalledTimes(4);
    expect(drawArrays).toHaveBeenCalled();
    window.dispatchEvent(new Event('pagehide'));
    expect(loseContext).toHaveBeenCalledTimes(1);
    expect(deleteProgram).toHaveBeenCalledTimes(4);
  });
});
