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

  return { context, decoded, start, stop };
}

describe('SoundPlayer', () => {
  it('starts playback when a pending preload finishes', async () => {
    const { decoded, start } = mockAudio();
    const player = new SoundPlayer({ src: '/disintegrate.mp3' }, vi.fn());

    player.preload();
    player.play(0.9);
    expect(start).not.toHaveBeenCalled();

    decoded.resolve({ duration: 1.272 } as AudioBuffer);
    await vi.waitFor(() => expect(start).toHaveBeenCalledOnce());
    player.destroy();
  });

  it('does not start delayed playback after the effect is cancelled', async () => {
    const { decoded, start } = mockAudio();
    const player = new SoundPlayer({ src: '/disintegrate.mp3' }, vi.fn());

    player.preload();
    const stop = player.play(0.9);
    stop();
    decoded.resolve({ duration: 1.272 } as AudioBuffer);
    await Promise.resolve();
    await Promise.resolve();

    expect(start).not.toHaveBeenCalled();
    player.destroy();
  });
});
