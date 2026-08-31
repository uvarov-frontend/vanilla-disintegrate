import { beforeEach, describe, expect, it, vi } from 'vitest';

import Disintegrator, { builtInEffects, createParticleEffect, defineEffect, particlePresets } from '../src';
import type { AnimationFactory } from '../src/types';

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

function target() {
  const element = document.createElement('article');
  document.body.append(element);
  Object.defineProperty(element, 'getBoundingClientRect', { value: rect });
  return element;
}

function customEffect(animate = vi.fn(() => Promise.resolve())) {
  return defineEffect({
    remove: { needsSnapshot: false, animate, sound: null },
    restore: { needsSnapshot: false, animate, sound: null },
  });
}

function mockNativeAudio(decoded: Promise<AudioBuffer> = Promise.resolve(audioBuffer())) {
  const source = {
    addEventListener: vi.fn(),
    buffer: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    playbackRate: { value: 1 },
    start: vi.fn(),
    stop: vi.fn(),
  } as unknown as AudioBufferSourceNode;
  const context = {
    close: vi.fn().mockResolvedValue(undefined),
    createBuffer: vi.fn(() => audioBuffer()),
    createBufferSource: vi.fn(() => source),
    createGain: vi.fn(() => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
      gain: { linearRampToValueAtTime: vi.fn(), setValueAtTime: vi.fn() },
    })),
    currentTime: 0,
    decodeAudioData: vi.fn(() => decoded),
    destination: {},
    resume: vi.fn().mockResolvedValue(undefined),
    state: 'running',
  } as unknown as AudioContext;
  const Context = vi.fn(function AudioContextMock() {
    return context;
  });
  const fetchMock = vi.fn().mockResolvedValue({
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    ok: true,
  });
  vi.stubGlobal('AudioContext', Context);
  vi.stubGlobal('fetch', fetchMock);
  return { Context, context, fetchMock, source };
}

function audioBuffer(): AudioBuffer {
  const samples = new Float32Array(8);
  return {
    duration: 1,
    getChannelData: () => samples,
    length: samples.length,
    numberOfChannels: 1,
    sampleRate: samples.length,
  } as unknown as AudioBuffer;
}

beforeEach(() => document.body.replaceChildren());

describe('public entries', () => {
  it('exports immutable particle presets and a silent paired-effect factory', () => {
    expect(Object.keys(particlePresets)).toEqual(['dust', 'vapor', 'scatter', 'wind']);
    expect(Object.isFrozen(particlePresets)).toBe(true);
    expect(Object.isFrozen(particlePresets.dust)).toBe(true);
    expect(Object.isFrozen(particlePresets.dust.horizontalTravel)).toBe(true);
    expect(Object.isFrozen(particlePresets.dust.verticalTravel)).toBe(true);

    const effect = createParticleEffect({ curve: 'drift', release: 'random' });
    expect(effect.remove.animate).toBeTypeOf('function');
    expect(effect.restore.animate).toBeTypeOf('function');
    expect(effect.remove.sound).toBeNull();
    expect(effect.restore.sound).toBeNull();
    expect(Object.isFrozen(effect)).toBe(true);
  });

  it('contains four paired effects and eight explicit audio slots', () => {
    expect(Object.keys(builtInEffects)).toEqual(['dust', 'vapor', 'scatter', 'wind']);
    for (const effect of Object.values(builtInEffects)) {
      expect(effect.remove.animate).toBeTypeOf('function');
      expect(effect.restore.animate).toBeTypeOf('function');
      expect('sound' in effect.remove).toBe(true);
      expect('sound' in effect.restore).toBe(true);
    }
    for (const name of ['dust', 'vapor', 'wind', 'scatter'] as const) {
      expect(builtInEffects[name].remove.sound).not.toBeNull();
      expect(builtInEffects[name].restore.sound).not.toBeNull();
    }
    expect(
      Object.values(builtInEffects)
        .flatMap((effect) => [effect.remove.sound, effect.restore.sound])
        .filter(Boolean),
    ).toHaveLength(8);
  });

  it('uses the capture adapter supplied to the core entry', async () => {
    const element = target();
    const capture = vi.fn().mockResolvedValue(snapshot());
    const effect = new Disintegrator({ capture, effect: 'dust', layout: false, sound: false });

    await effect.remove(element).finished;

    expect(capture).toHaveBeenCalledWith(element, expect.objectContaining({ operation: 'remove' }));
    effect.destroy();
  });

  it('runs snapshotless effects without requiring a capture adapter', async () => {
    const element = target();
    const animate = vi.fn(() => Promise.resolve());
    const effect = new Disintegrator({ effect: customEffect(animate), layout: false });

    const result = await effect.remove(element).finished;

    expect(result.status).toBe('completed');
    expect(animate).toHaveBeenCalledOnce();
    effect.destroy();
  });

  it('commits built-in content operations without substituting a renderer when WebGL2 is absent', async () => {
    const element = target();
    const effect = new Disintegrator({
      capture: vi.fn().mockResolvedValue(snapshot()),
      effect: 'dust',
      layout: false,
      sound: false,
    });

    const result = await effect.remove(element).finished;

    expect(result.status).toBe('skipped');
    expect(element.isConnected).toBe(false);
    effect.destroy();
  });

  it('leaves effect audio silent unless it is opted into', async () => {
    const element = target();
    const played: unknown[] = [];
    const animate = vi.fn(() => Promise.resolve());
    const sound = vi.fn(() => {
      played.push(true);
    });
    const effect = new Disintegrator({
      effect: defineEffect({
        remove: { needsSnapshot: false, animate, sound },
        restore: { needsSnapshot: false, animate, sound },
      }),
      layout: false,
    });

    await effect.remove(element).finished;

    expect(sound).not.toHaveBeenCalled();
    expect(played).toHaveLength(0);
    effect.destroy();
  });

  it('plays the phase sound once audio is enabled', async () => {
    const element = target();
    const animate = vi.fn(() => Promise.resolve());
    const sound = vi.fn();
    const effect = new Disintegrator({
      effect: defineEffect({
        remove: { needsSnapshot: false, animate, sound },
        restore: { needsSnapshot: false, animate, sound },
      }),
      layout: false,
      sound: true,
    });

    await effect.remove(element).finished;

    expect(sound).toHaveBeenCalledOnce();
    effect.destroy();
  });

  it('does no audio work while instance sound is disabled', async () => {
    const { Context, fetchMock } = mockNativeAudio();
    const effect = new Disintegrator({
      audioPreparation: { effects: ['dust', 'wind'] },
      effect: 'dust',
      sound: false,
    });

    await Promise.resolve();

    expect(Context).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    effect.destroy();
  });

  it('automatically prepares only the selected built-in effect', async () => {
    const { fetchMock } = mockNativeAudio();
    const effect = new Disintegrator({ effect: 'vapor', sound: true });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('vapor');
    effect.destroy();
  });

  it('can explicitly prepare several effects even while instance sound is disabled', async () => {
    const { fetchMock } = mockNativeAudio();
    const effect = new Disintegrator({ sound: false });

    await effect.prepareAudio(['dust', 'scatter', 'vapor', 'wind']);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    effect.destroy();
  });

  it('waits for native audio preparation before starting the visual phase', async () => {
    let resolveAudio!: (buffer: AudioBuffer) => void;
    const decoded = new Promise<AudioBuffer>((resolve) => {
      resolveAudio = resolve;
    });
    const { fetchMock } = mockNativeAudio(decoded);
    const animate = vi.fn(() => Promise.resolve());
    const effect = new Disintegrator({
      effect: defineEffect({
        remove: { needsSnapshot: false, animate, sound: { src: '/effect.mp3' } },
        restore: { needsSnapshot: false, animate, sound: { src: '/effect.mp3', reverse: true } },
      }),
      layout: false,
      sound: true,
    });

    const operation = effect.remove(target());
    await Promise.resolve();
    expect(animate).not.toHaveBeenCalled();

    resolveAudio(audioBuffer());
    await operation.finished;

    expect(animate).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
    effect.destroy();
  });

  it('continues the visual operation when native audio is unavailable', async () => {
    const unavailable = new Error('audio unavailable');
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function AudioContextMock() {
        throw unavailable;
      }),
    );
    const animate = vi.fn(() => Promise.resolve());
    const onError = vi.fn();
    const effect = new Disintegrator({
      audioPreparation: false,
      effect: defineEffect({
        remove: { needsSnapshot: false, animate, sound: { src: '/effect.mp3' } },
        restore: { needsSnapshot: false, animate, sound: null },
      }),
      layout: false,
      onError,
      sound: true,
    });

    const result = await effect.remove(target()).finished;

    expect(result.status).toBe('completed');
    expect(animate).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(unavailable, expect.objectContaining({ operation: 'remove' }));
    effect.destroy();
  });

  it('resolves registered custom effects by name', async () => {
    const element = target();
    const animate = vi.fn(() => Promise.resolve());
    const effect = new Disintegrator({
      effect: 'fold',
      effects: { fold: customEffect(animate) },
      layout: false,
    });

    await effect.remove(element).finished;

    expect(animate).toHaveBeenCalledOnce();
    effect.destroy();
  });

  it('normalizes a native WAAPI animation returned by a custom phase', async () => {
    const element = target();
    const animate = vi.fn<AnimationFactory>(({ visual }) => {
      expect(visual).toBeInstanceOf(HTMLCanvasElement);
      return visual!.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 20 });
    });
    const custom = defineEffect({
      remove: { animate, sound: null },
      restore: { animate, sound: null },
    });
    const effect = new Disintegrator({
      capture: vi.fn().mockResolvedValue(snapshot()),
      effect: custom,
      layout: false,
    });

    await effect.remove(element).finished;

    expect(animate).toHaveBeenCalledOnce();
    effect.destroy();
  });
});
