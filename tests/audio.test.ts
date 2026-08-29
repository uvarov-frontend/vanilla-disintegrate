import { describe, expect, it, vi } from 'vitest';

import { SoundPlayer } from '../src/audio';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
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

describe('SoundPlayer', () => {
  const soundContext = () => ({
    operation: 'remove' as const,
    element: document.createElement('div'),
    signal: new AbortController().signal,
  });

  it('reports an unavailable audio context while unlocking without throwing', () => {
    const error = new Error('audio unavailable');
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function AudioContextMock() {
        throw error;
      }),
    );
    const onError = vi.fn();
    const player = new SoundPlayer();

    expect(() => player.unlock({ src: '/dust.mp3' }, onError)).not.toThrow();
    expect(onError).toHaveBeenCalledWith(error);
  });

  it('does not start playback until a source has been fully decoded', async () => {
    const { decoded, start } = mockAudio();
    const player = new SoundPlayer();
    const preparation = player.prepare({ src: '/dust.mp3' });

    await Promise.resolve();
    expect(start).not.toHaveBeenCalled();
    decoded.resolve(sourceBuffer([1, 2, 3, 4]).buffer);
    const prepared = await preparation;
    player.play(prepared, 0.9, soundContext(), vi.fn());

    expect(start).toHaveBeenCalledOnce();
    player.destroy();
  });

  it('does not start pending playback after destroy', async () => {
    const { decoded, start } = mockAudio();
    const player = new SoundPlayer();
    const preparation = player.prepare({ src: '/dust.mp3' });

    player.destroy();
    decoded.resolve(sourceBuffer([1, 2, 3, 4]).buffer);

    await expect(preparation).rejects.toMatchObject({ name: 'AbortError' });
    expect(start).not.toHaveBeenCalled();
  });

  it('reverses the decoded source without touching the original buffer', async () => {
    const { decoded, source, start } = mockAudio();
    const player = new SoundPlayer();
    const original = sourceBuffer([1, 2, 3, 4, 5, 6, 7, 8]);
    const preparation = player.prepare({ src: '/dust.mp3', reverse: true });

    decoded.resolve(original.buffer);
    const prepared = await preparation;
    player.play(prepared, 1, soundContext(), vi.fn());

    expect(start).toHaveBeenCalledOnce();
    expect([...source.buffer!.getChannelData(0)]).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
    expect([...original.channel]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    player.destroy();
  });

  it('plays the end of a reversed source so its transient lands on the animation end', async () => {
    const { decoded, start } = mockAudio();
    const player = new SoundPlayer();
    const preparation = player.prepare({ src: '/dust.mp3', reverse: true });

    decoded.resolve(sourceBuffer([1, 2, 3, 4, 5, 6, 7, 8]).buffer);
    player.play(await preparation, 0.4, soundContext(), vi.fn());

    expect(start).toHaveBeenCalledWith(0, expect.closeTo(0.6, 5));
    player.destroy();
  });

  it('keeps forward playback anchored to the start of the source', async () => {
    const { decoded, start } = mockAudio();
    const player = new SoundPlayer();
    const preparation = player.prepare({ src: '/dust.mp3' });

    decoded.resolve(sourceBuffer([1, 2, 3, 4, 5, 6, 7, 8]).buffer);
    player.play(await preparation, 0.4, soundContext(), vi.fn());

    expect(start).toHaveBeenCalledWith(0, 0);
    player.destroy();
  });

  it('fades a reversed source in rather than out', async () => {
    const { decoded, linearRampToValueAtTime, setValueAtTime } = mockAudio();
    const player = new SoundPlayer();
    const preparation = player.prepare({ src: '/dust.mp3', reverse: true, gain: 0.5, fadeDuration: 0.1 });

    decoded.resolve(sourceBuffer([1, 2, 3, 4, 5, 6, 7, 8]).buffer);
    player.play(await preparation, 1, soundContext(), vi.fn());

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
    const prepared = await player.prepare(factory);

    const cancel = player.play(prepared, 1, soundContext(), vi.fn());
    await Promise.resolve();
    cancel();

    expect(factory).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('deduplicates the forward source used to prepare a reversed copy', async () => {
    const { decoded } = mockAudio();
    const player = new SoundPlayer();
    const forward = player.prepare({ src: '/dust.mp3' });
    const reverse = player.prepare({ src: '/dust.mp3', reverse: true });

    decoded.resolve(sourceBuffer([1, 2, 3, 4]).buffer);
    await Promise.all([forward, reverse]);

    expect(fetch).toHaveBeenCalledOnce();
    player.destroy();
  });

  it('evicts the least recently used decoded buffer when the byte budget is exceeded', async () => {
    const { context } = mockAudio();
    vi.spyOn(context, 'decodeAudioData').mockResolvedValue(sourceBuffer([1, 2, 3, 4]).buffer);
    const player = new SoundPlayer(16);

    await player.prepare({ src: '/first.mp3' });
    await player.prepare({ src: '/second.mp3' });
    await player.prepare({ src: '/first.mp3' });

    expect(fetch).toHaveBeenCalledTimes(3);
    player.destroy();
  });

  it('aborts an unfinished fetch when prepared audio is cleared', async () => {
    mockAudio();
    let fetchSignal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_source: string, init?: RequestInit) => {
        fetchSignal = init?.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
          fetchSignal?.addEventListener(
            'abort',
            () => reject(new DOMException('Audio preparation was cancelled.', 'AbortError')),
            { once: true },
          );
        });
      }),
    );
    const player = new SoundPlayer();
    const preparation = player.prepare({ src: '/pending.mp3' });

    await vi.waitFor(() => expect(fetchSignal).toBeDefined());
    player.clearPrepared();

    expect(fetchSignal?.aborted).toBe(true);
    await expect(preparation).rejects.toMatchObject({ name: 'AbortError' });
    player.destroy();
  });

  it('defers idle preparation but starts immediate preparation in the same turn', async () => {
    const { decoded } = mockAudio();
    vi.useFakeTimers();
    const immediate = new SoundPlayer();
    immediate.schedule([{ src: '/immediate.mp3' }], 'immediate');
    await Promise.resolve();
    expect(fetch).toHaveBeenCalledOnce();

    const idle = new SoundPlayer();
    idle.schedule([{ src: '/idle.mp3' }], 'idle');
    expect(fetch).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(200);
    expect(fetch).toHaveBeenCalledTimes(2);

    decoded.resolve(sourceBuffer([1, 2, 3, 4]).buffer);
    await vi.runAllTimersAsync();
    immediate.destroy();
    idle.destroy();
    vi.useRealTimers();
  });
});
