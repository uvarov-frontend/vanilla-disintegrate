import { describe, expect, it, vi } from 'vitest';

import { SoundPlayer } from '../src/audio';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function mockAudio() {
  const decoded = deferred<AudioBuffer>();
  const start = vi.fn();
  const stop = vi.fn();
  const source = {
    addEventListener: vi.fn(),
    buffer: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    playbackRate: { value: 1 },
    start,
    stop,
  } as unknown as AudioBufferSourceNode;
  const gain = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: {
      linearRampToValueAtTime: vi.fn(),
      setValueAtTime: vi.fn(),
    },
  } as unknown as GainNode;
  const context = {
    close: vi.fn().mockResolvedValue(undefined),
    createBufferSource: vi.fn(() => source),
    createGain: vi.fn(() => gain),
    currentTime: 0,
    decodeAudioData: vi.fn(() => decoded.promise),
    destination: {},
    resume: vi.fn().mockResolvedValue(undefined),
    state: 'running',
  } as unknown as AudioContext;

  vi.stubGlobal(
    'AudioContext',
    vi.fn(function AudioContextMock() {
      return context;
    }),
  );
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      ok: true,
    }),
  );

  return { context, decoded, start };
}

describe('SoundPlayer', () => {
  const soundContext = () => ({
    operation: 'remove' as const,
    element: document.createElement('div'),
    signal: new AbortController().signal,
  });

  it('reports unavailable audio without throwing into the visual effect', () => {
    const error = new Error('audio unavailable');
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function AudioContextMock() {
        throw error;
      }),
    );
    const onError = vi.fn();
    const player = new SoundPlayer();

    expect(() => player.play({ src: '/dust.mp3' }, 0.9, soundContext(), onError)).not.toThrow();
    expect(onError).toHaveBeenCalledWith(error);
  });

  it('plays an asynchronously decoded source', async () => {
    const { decoded, start } = mockAudio();
    const player = new SoundPlayer();

    player.play({ src: '/dust.mp3' }, 0.9, soundContext(), vi.fn());
    decoded.resolve({ duration: 1.2 } as AudioBuffer);

    await vi.waitFor(() => expect(start).toHaveBeenCalledOnce());
    player.destroy();
  });

  it('does not start pending playback after destroy', async () => {
    const { decoded, start } = mockAudio();
    const player = new SoundPlayer();

    player.play({ src: '/dust.mp3' }, 0.9, soundContext(), vi.fn());
    player.destroy();
    decoded.resolve({ duration: 1.2 } as AudioBuffer);
    await Promise.resolve();
    await Promise.resolve();

    expect(start).not.toHaveBeenCalled();
  });

  it('supports a custom sound factory and disposes it on stop', async () => {
    const stop = vi.fn();
    const dispose = vi.fn();
    const factory = vi.fn(() => ({ stop, dispose }));
    const player = new SoundPlayer();

    const cancel = player.play(factory, 1, soundContext(), vi.fn());
    await Promise.resolve();
    cancel();

    expect(factory).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
