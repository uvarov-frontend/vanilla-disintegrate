import { beforeEach, describe, expect, it, vi } from 'vitest';

import Disintegrator, {
  builtInPresets,
  builtInSounds,
  createParticleEffect,
  defineEffect,
  definePreset,
  particlePresets,
} from '../src';
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
    remove: { needsSnapshot: false, animate },
    restore: { needsSnapshot: false, animate },
  });
}

function mockNativeAudio(decoded: Promise<AudioBuffer> = Promise.resolve(audioBuffer())) {
  const decodeAudioData = vi.fn(() => decoded);
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
    decodeAudioData,
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
  return { Context, context, decodeAudioData, fetchMock, source };
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
  it('requires exactly one complete preset or custom effect', () => {
    type Options = ConstructorParameters<typeof Disintegrator>[0];
    const invalidTypeContracts: [
      [] extends ConstructorParameters<typeof Disintegrator> ? true : false,
      { effect: 'dust' } extends Options ? true : false,
      { sound: false } extends Options ? true : false,
      { preset: 'dust'; effect: ReturnType<typeof customEffect> } extends Options ? true : false,
      { preset: 'dust'; sound: { remove: { src: 'wind' } } } extends Options ? true : false,
    ] = [false, false, false, false, false];
    expect(invalidTypeContracts).toEqual([false, false, false, false, false]);
    expect(() => {
      Reflect.construct(Disintegrator, []);
    }).toThrow('Configure exactly one of preset or effect');
    expect(() => {
      Reflect.construct(Disintegrator, [{ effect: 'dust' }]);
    }).toThrow('requires remove and restore animation phases');
    expect(() => {
      Reflect.construct(Disintegrator, [{ sound: false }]);
    }).toThrow('Configure exactly one of preset or effect');
    expect(() => {
      Reflect.construct(Disintegrator, [{ preset: 'dust', effect: customEffect() }]);
    }).toThrow('Configure exactly one of preset or effect');
    expect(() => {
      Reflect.construct(Disintegrator, [{ preset: 'dust', sound: { remove: { src: 'wind' } } }]);
    }).toThrow('A preset may only be muted');

    const preset = new Disintegrator({ audioPreparation: false, preset: 'dust' });
    const silentEffect = new Disintegrator({ effect: customEffect() });
    preset.destroy();
    silentEffect.destroy();
  });

  it('exports immutable particle presets and a silent paired-effect factory', () => {
    expect(Object.keys(particlePresets)).toEqual(['dust', 'scatter', 'vapor', 'wind']);
    expect(Object.isFrozen(particlePresets)).toBe(true);
    expect(Object.isFrozen(particlePresets.dust)).toBe(true);
    expect(Object.isFrozen(particlePresets.dust.horizontalTravel)).toBe(true);
    expect(Object.isFrozen(particlePresets.dust.rotation)).toBe(true);
    expect(Object.isFrozen(particlePresets.dust.verticalTravel)).toBe(true);
    expect(particlePresets.vapor).toEqual({
      particleSize: 'auto',
      alphaThreshold: 0,
      curve: 'float',
      duration: 750,
      stagger: 80,
      horizontalDrift: 80,
      horizontalTravel: [-10, 10],
      verticalTravel: [-255, -130],
      convergence: 0.8,
      swirl: 5,
      endScale: 0.6,
      rotation: [0, 0],
      release: 'top',
      releaseRandomness: 0.84,
      fadeStart: 0.3,
      waveTurns: 1.6,
      layoutRelease: 0.6,
    });

    const effect = createParticleEffect({
      remove: { curve: 'burst', release: 'random' },
      restore: { curve: 'drift', release: 'right' },
    });
    expect(effect.remove.animate).toBeTypeOf('function');
    expect(effect.restore.animate).toBeTypeOf('function');
    expect('sound' in effect.remove).toBe(false);
    expect('sound' in effect.restore).toBe(false);
    expect(Object.isFrozen(effect)).toBe(true);
  });

  it('exports bundled sound URLs under stable identifiers', () => {
    expect(Object.keys(builtInSounds)).toEqual(['dust', 'scatter', 'vapor', 'wind']);
    expect(Object.isFrozen(builtInSounds)).toBe(true);
    for (const source of Object.values(builtInSounds)) expect(source).toBeTypeOf('string');
  });

  it('exports complete presets without putting sound back into visual phases', () => {
    expect(Object.keys(builtInPresets)).toEqual(['dust', 'scatter', 'vapor', 'wind']);
    expect(Object.isFrozen(builtInPresets)).toBe(true);
    expect(builtInPresets.vapor.effect.remove.animate).toBeTypeOf('function');
    expect(builtInPresets.vapor.effect.restore.animate).toBeTypeOf('function');
    expect(builtInPresets.vapor.sound).toEqual({
      remove: { src: 'vapor', volume: 0.32, fadeDuration: 0.18 },
      restore: { src: 'vapor', volume: 0.32, fadeDuration: 0.18, reverse: true },
    });
    expect('sound' in builtInPresets.vapor.effect.remove).toBe(false);
  });

  it('defines immutable custom presets without freezing caller-owned audio data', () => {
    const source = new Uint8Array([1, 2, 3]);
    const animate = () => Promise.resolve();
    const preset = definePreset({
      effect: { remove: { needsSnapshot: false, animate }, restore: { needsSnapshot: false, animate } },
      sound: { remove: { src: source, volume: 0.4 }, restore: false },
    });

    expect(Object.isFrozen(preset)).toBe(true);
    expect(Object.isFrozen(preset.effect)).toBe(true);
    expect(Object.isFrozen(preset.effect.remove)).toBe(true);
    expect(Object.isFrozen(preset.effect.restore)).toBe(true);
    expect(Object.isFrozen(preset.sound)).toBe(true);
    expect(Object.isFrozen(preset.sound.remove)).toBe(true);
    expect(Object.isFrozen(source)).toBe(false);
  });

  it('uses a complete built-in preset by name for explicit audio preparation', async () => {
    const { fetchMock } = mockNativeAudio();
    const effect = new Disintegrator({ audioPreparation: false, preset: 'vapor', layout: false });

    await effect.prepareAudio();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('vapor');
    effect.destroy();
  });

  it('keeps both halves of an operation preset for a retained restore', async () => {
    const removeSound = vi.fn();
    const restoreSound = vi.fn();
    const preset = {
      effect: customEffect(),
      sound: { remove: removeSound, restore: restoreSound },
    } as const;
    const effect = new Disintegrator({ audioPreparation: false, layout: false, preset });
    const removal = effect.remove(target(), { retain: true });

    await removal.finished;
    const retained = effect.take(removal.removalId!);
    document.body.append(retained!);
    await effect.restore(retained!).finished;

    expect(removeSound).toHaveBeenCalledOnce();
    expect(restoreSound).toHaveBeenCalledOnce();
    effect.destroy();
  });

  it('resolves a registered complete preset without partial overrides', async () => {
    const presetAnimation = vi.fn(() => Promise.resolve());
    const presetSound = vi.fn();
    const complete = {
      effect: customEffect(presetAnimation),
      sound: { remove: presetSound, restore: presetSound },
    } as const;
    const effect = new Disintegrator({
      audioPreparation: false,
      layout: false,
      preset: 'complete',
      presets: { complete },
    });

    await effect.remove(target()).finished;

    expect(presetAnimation).toHaveBeenCalledOnce();
    expect(presetSound).toHaveBeenCalledOnce();
    effect.destroy();
  });

  it('rejects an unknown preset before allocating runtime resources', () => {
    expect(() => new Disintegrator({ preset: 'missing' })).toThrow('Unknown disintegration preset: missing');
  });

  it('uses the capture adapter supplied to the core entry', async () => {
    const element = target();
    const capture = vi.fn().mockResolvedValue(snapshot());
    const effect = new Disintegrator({ capture, preset: 'dust', layout: false, sound: false });

    await effect.remove(element).finished;

    expect(capture).toHaveBeenCalledWith(element, expect.objectContaining({ operation: 'remove' }));
    effect.destroy();
  });

  it('runs snapshotless effects without requiring a capture adapter', async () => {
    const element = target();
    const animate = vi.fn(() => Promise.resolve());
    const effect = new Disintegrator({ effect: customEffect(animate), layout: false, sound: false });

    const result = await effect.remove(element).finished;

    expect(result.status).toBe('completed');
    expect(animate).toHaveBeenCalledOnce();
    effect.destroy();
  });

  it('commits built-in content operations without substituting a renderer when WebGL2 is absent', async () => {
    const element = target();
    const effect = new Disintegrator({
      capture: vi.fn().mockResolvedValue(snapshot()),
      preset: 'dust',
      layout: false,
      sound: false,
    });

    const result = await effect.remove(element).finished;

    expect(result.status).toBe('skipped');
    expect(element.isConnected).toBe(false);
    effect.destroy();
  });

  it('leaves visual effects silent when no independent sound is configured', async () => {
    const element = target();
    const animate = vi.fn(() => Promise.resolve());
    const sound = vi.fn(() => {
      throw new Error('Sound should not run');
    });
    const effect = new Disintegrator({
      effect: customEffect(animate),
      layout: false,
    });

    await effect.remove(element).finished;

    expect(sound).not.toHaveBeenCalled();
    expect(animate).toHaveBeenCalledOnce();
    effect.destroy();
  });

  it('plays independently configured sounds for their respective operations', async () => {
    const removed = target();
    const restored = target();
    const animate = vi.fn(() => Promise.resolve());
    const removeSound = vi.fn();
    const restoreSound = vi.fn();
    const effect = new Disintegrator({
      effect: customEffect(animate),
      layout: false,
      sound: { remove: removeSound, restore: restoreSound },
    });

    await effect.remove(removed).finished;
    await effect.restore(restored).finished;

    expect(removeSound).toHaveBeenCalledOnce();
    expect(restoreSound).toHaveBeenCalledOnce();
    effect.destroy();
  });

  it('makes an operation-level custom effect silent instead of inheriting preset audio', async () => {
    const presetSound = vi.fn();
    const customAnimation = vi.fn(() => Promise.resolve());
    const effect = new Disintegrator({
      audioPreparation: false,
      layout: false,
      preset: {
        effect: customEffect(),
        sound: { remove: presetSound, restore: presetSound },
      },
    });

    await effect.remove(target(), { effect: customEffect(customAnimation) }).finished;

    expect(customAnimation).toHaveBeenCalledOnce();
    expect(presetSound).not.toHaveBeenCalled();
    effect.destroy();
  });

  it('rejects preset and effect combinations at operation runtime boundaries', () => {
    const effect = new Disintegrator({ effect: customEffect() });

    expect(() => effect.remove(target(), { preset: 'dust', effect: customEffect() } as never)).toThrow(
      'cannot combine preset and effect',
    );

    effect.destroy();
  });

  it('does no audio work while instance sound is disabled', async () => {
    const { Context, fetchMock } = mockNativeAudio();
    const effect = new Disintegrator({
      audioPreparation: 'immediate',
      effect: customEffect(),
    });

    await Promise.resolve();

    expect(Context).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    effect.destroy();
  });

  it('lets one operation explicitly silence a complete audible preset', async () => {
    const sound = vi.fn();
    const effect = new Disintegrator({
      audioPreparation: false,
      preset: { effect: customEffect(), sound: { remove: sound, restore: sound } },
    });

    await effect.remove(target(), { sound: false }).finished;

    expect(sound).not.toHaveBeenCalled();
    effect.destroy();
  });

  it('automatically prepares the selected sound independently of the visual effect', async () => {
    const { fetchMock } = mockNativeAudio();
    const effect = new Disintegrator({
      effect: customEffect(),
      sound: { remove: { src: builtInSounds.vapor } },
    });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('vapor');
    effect.destroy();
  });

  it('can explicitly prepare several sounds even while instance sound is disabled', async () => {
    const { fetchMock } = mockNativeAudio();
    const effect = new Disintegrator({ effect: customEffect() });

    await effect.prepareAudio(Object.values(builtInSounds).map((src) => ({ src })));

    expect(fetchMock).toHaveBeenCalledTimes(4);
    effect.destroy();
  });

  it('prepares arrays of complete remove and restore sound pairs', async () => {
    const { fetchMock } = mockNativeAudio();
    const effect = new Disintegrator({ effect: customEffect() });

    await effect.prepareAudio([false, builtInPresets.dust.sound, builtInPresets.vapor.sound]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    effect.destroy();
  });

  it('discards selected decoded audio without changing the configured preset', async () => {
    const { fetchMock } = mockNativeAudio();
    const effect = new Disintegrator({ audioPreparation: false, preset: 'dust' });

    await effect.prepareAudio();
    expect(effect.discardPreparedAudio()).toBe(2);
    await effect.prepareAudio();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    effect.clearPreparedAudio();
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
      effect: customEffect(animate),
      layout: false,
      sound: {
        remove: { src: '/effect.mp3' },
        restore: { src: '/effect.mp3', reverse: true },
      },
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
      effect: customEffect(animate),
      layout: false,
      onError,
      sound: { remove: { src: '/effect.mp3' } },
    });

    const result = await effect.remove(target()).finished;

    expect(result.status).toBe('completed');
    expect(animate).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(unavailable, expect.objectContaining({ operation: 'remove' }));
    effect.destroy();
  });

  it('decodes a local Blob directly without fetching or converting it to base64', async () => {
    const { decodeAudioData, fetchMock } = mockNativeAudio();
    const sound = new Blob([new Uint8Array(8)], { type: 'audio/mpeg' });
    const effect = new Disintegrator({
      audioPreparation: false,
      effect: customEffect(),
      layout: false,
      sound: { remove: { src: sound } },
    });

    await effect.remove(target()).finished;

    expect(fetchMock).not.toHaveBeenCalled();
    expect(decodeAudioData).toHaveBeenCalledOnce();
    effect.destroy();
  });

  it('recognizes a Blob created in another JavaScript realm as a sound source', async () => {
    const { decodeAudioData, fetchMock } = mockNativeAudio();
    const arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(8));
    const foreignBlob = {
      arrayBuffer,
      size: 8,
      type: 'audio/mpeg',
      [Symbol.toStringTag]: 'Blob',
    } as unknown as Blob;
    const effect = new Disintegrator({
      audioPreparation: false,
      effect: customEffect(),
      layout: false,
      sound: { remove: { src: foreignBlob } },
    });

    await effect.remove(target()).finished;

    expect(arrayBuffer).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(decodeAudioData).toHaveBeenCalledOnce();
    effect.destroy();
  });

  it('decodes an ArrayBuffer view without fetching unrelated bytes from its backing buffer', async () => {
    const { decodeAudioData, fetchMock } = mockNativeAudio();
    const bytes = new Uint8Array(new ArrayBuffer(16), 4, 8);
    const effect = new Disintegrator({
      audioPreparation: false,
      effect: customEffect(),
      sound: { remove: { src: bytes } },
    });

    await effect.remove(target()).finished;

    expect(fetchMock).not.toHaveBeenCalled();
    expect(decodeAudioData).toHaveBeenCalledWith(expect.objectContaining({ byteLength: 8 }));
    effect.destroy();
  });

  it('accepts a custom effect object per operation without a named registry', async () => {
    const element = target();
    const animate = vi.fn(() => Promise.resolve());
    const effect = new Disintegrator({
      effect: customEffect(),
      layout: false,
    });

    await effect.remove(element, { effect: customEffect(animate) }).finished;

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
      remove: { animate },
      restore: { animate },
    });
    const effect = new Disintegrator({
      capture: vi.fn().mockResolvedValue(snapshot()),
      effect: custom,
      layout: false,
      sound: false,
    });

    await effect.remove(element).finished;

    expect(animate).toHaveBeenCalledOnce();
    effect.destroy();
  });
});
