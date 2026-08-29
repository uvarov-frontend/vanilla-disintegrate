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
  const linearRampToValueAtTime = vi.fn();
  const setValueAtTime = vi.fn();
  const gain = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: { linearRampToValueAtTime, setValueAtTime },
  } as unknown as GainNode;
  const context = {
    close: vi.fn().mockResolvedValue(undefined),
    createBuffer: vi.fn((numberOfChannels: number, length: number, sampleRate: number) =>
      fakeBuffer(
        Array.from({ length: numberOfChannels }, () => new Float32Array(length)),
        sampleRate,
      ),
    ),
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

  return { context, decoded, linearRampToValueAtTime, setValueAtTime, source, start };
}

function fakeBuffer(channels: readonly Float32Array[], sampleRate: number): AudioBuffer {
  return {
    duration: (channels[0]?.length ?? 0) / sampleRate,
    getChannelData: (channel: number) => channels[channel],
    length: channels[0]?.length ?? 0,
    numberOfChannels: channels.length,
    sampleRate,
  } as unknown as AudioBuffer;
}

/** One channel, one sample per unit of time, so durations are easy to reason about. */
function sourceBuffer(samples: readonly number[]) {
  const channel = Float32Array.from(samples);
  return { buffer: fakeBuffer([channel], samples.length), channel };
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

  it('reverses the decoded source without touching the original buffer', async () => {
    const { decoded, source, start } = mockAudio();
    const player = new SoundPlayer();
    const original = sourceBuffer([1, 2, 3, 4, 5, 6, 7, 8]);

    player.play({ src: '/dust.mp3', reverse: true }, 1, soundContext(), vi.fn());
    decoded.resolve(original.buffer);
    await vi.waitFor(() => expect(start).toHaveBeenCalledOnce());

    expect([...source.buffer!.getChannelData(0)]).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
    expect([...original.channel]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    player.destroy();
  });

  it('plays the end of a reversed source so its transient lands on the animation end', async () => {
    const { decoded, start } = mockAudio();
    const player = new SoundPlayer();

    // One second of audio against a 0.4s animation: the last 0.4s must play.
    player.play({ src: '/dust.mp3', reverse: true }, 0.4, soundContext(), vi.fn());
    decoded.resolve(sourceBuffer([1, 2, 3, 4, 5, 6, 7, 8]).buffer);
    await vi.waitFor(() => expect(start).toHaveBeenCalledOnce());

    expect(start).toHaveBeenCalledWith(0, expect.closeTo(0.6, 5));
    player.destroy();
  });

  it('keeps forward playback anchored to the start of the source', async () => {
    const { decoded, start } = mockAudio();
    const player = new SoundPlayer();

    player.play({ src: '/dust.mp3' }, 0.4, soundContext(), vi.fn());
    decoded.resolve(sourceBuffer([1, 2, 3, 4, 5, 6, 7, 8]).buffer);
    await vi.waitFor(() => expect(start).toHaveBeenCalledOnce());

    expect(start).toHaveBeenCalledWith(0, 0);
    player.destroy();
  });

  it('fades a reversed source in rather than out', async () => {
    const { decoded, linearRampToValueAtTime, setValueAtTime, start } = mockAudio();
    const player = new SoundPlayer();

    player.play({ src: '/dust.mp3', reverse: true, gain: 0.5, fadeDuration: 0.1 }, 1, soundContext(), vi.fn());
    decoded.resolve(sourceBuffer([1, 2, 3, 4, 5, 6, 7, 8]).buffer);
    await vi.waitFor(() => expect(start).toHaveBeenCalledOnce());

    expect(setValueAtTime).toHaveBeenCalledWith(0, 0);
    expect(linearRampToValueAtTime).toHaveBeenCalledWith(0.5, 0.1);
    expect(linearRampToValueAtTime).not.toHaveBeenCalledWith(0, expect.anything());
    player.destroy();
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
