import type { SoundContext, SoundDefinition, SoundOptions, SoundPlayback, SoundSource } from './types';

const noop = () => undefined;

type AudioContextConstructor = typeof AudioContext;

function getAudioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === 'undefined') return null;
  const audioWindow = window as typeof window & { webkitAudioContext?: AudioContextConstructor };
  return window.AudioContext ?? audioWindow.webkitAudioContext ?? null;
}

function isAudioBuffer(source: SoundSource): source is AudioBuffer {
  return typeof AudioBuffer !== 'undefined' && source instanceof AudioBuffer;
}

export class SoundPlayer {
  private context: AudioContext | null = null;
  private readonly buffers = new Map<SoundSource, Promise<AudioBuffer>>();
  private readonly activeSources = new Set<AudioBufferSourceNode>();
  private generation = 0;

  play(
    definition: SoundDefinition | null,
    fallbackDurationSeconds: number,
    soundContext: SoundContext,
    onError: (error: unknown) => void,
  ) {
    if (definition === null) return noop;
    if (typeof definition === 'function') return this.playCustom(definition, soundContext, onError);
    const options: SoundOptions =
      typeof definition === 'object' && 'src' in definition ? definition : { src: definition };
    let context: AudioContext | null;
    try {
      context = this.getContext();
    } catch (error) {
      onError(error);
      return noop;
    }
    if (context === null) return noop;

    const generation = this.generation;
    let cancelled = false;
    let source: AudioBufferSourceNode | null = null;
    if (context.state === 'suspended') {
      try {
        void context.resume().catch(onError);
      } catch (error) {
        onError(error);
      }
    }

    const start = async () => {
      const buffer = await this.load(options.src, context);
      if (cancelled || generation !== this.generation || context.state === 'closed') return;
      if (context.state !== 'running') await context.resume();
      if (cancelled || generation !== this.generation) return;

      const playbackRate = Math.max(0.01, options.playbackRate ?? 1);
      const availableDuration = buffer.duration / playbackRate;
      const requestedDuration =
        options.duration ?? (fallbackDurationSeconds > 0 ? fallbackDurationSeconds : availableDuration);
      const duration = Math.max(0, Math.min(requestedDuration, availableDuration));
      if (duration === 0) return;
      const fadeDuration = Math.max(0, Math.min(options.fadeDuration ?? 0.18, duration));
      const gainValue = Math.max(0, Math.min(options.gain ?? 0.32, 1));
      const startedAt = context.currentTime + Math.max(0, options.delay ?? 0) / 1000;
      const endsAt = startedAt + duration;
      const gain = context.createGain();
      const playback = context.createBufferSource();

      playback.buffer = buffer;
      playback.playbackRate.value = playbackRate;
      gain.gain.setValueAtTime(gainValue, startedAt);
      gain.gain.setValueAtTime(gainValue, endsAt - fadeDuration);
      gain.gain.linearRampToValueAtTime(0, endsAt);
      playback.connect(gain);
      gain.connect(context.destination);
      source = playback;
      this.activeSources.add(playback);
      playback.addEventListener(
        'ended',
        () => {
          playback.disconnect();
          gain.disconnect();
          this.activeSources.delete(playback);
        },
        { once: true },
      );
      playback.start(startedAt);
      playback.stop(endsAt);
    };

    void start().catch(onError);
    return () => {
      cancelled = true;
      if (source !== null) this.stop(source);
    };
  }

  private playCustom(
    factory: Extract<SoundDefinition, (...args: never[]) => unknown>,
    context: SoundContext,
    onError: (error: unknown) => void,
  ) {
    let cancelled = false;
    let playback: SoundPlayback | void;
    const stop = () => {
      cancelled = true;
      try {
        playback?.stop?.();
        playback?.dispose?.();
      } catch (error) {
        onError(error);
      }
    };
    try {
      void Promise.resolve(factory(context)).then((resolved) => {
        playback = resolved;
        if (cancelled) stop();
      }, onError);
    } catch (error) {
      onError(error);
    }
    return stop;
  }

  destroy() {
    this.generation += 1;
    for (const source of this.activeSources) this.stop(source);
    this.activeSources.clear();
    this.buffers.clear();
    const context = this.context;
    this.context = null;
    if (context !== null && context.state !== 'closed') void context.close().catch(noop);
  }

  private getContext() {
    if (this.context !== null) return this.context;
    const Context = getAudioContextConstructor();
    if (Context === null) return null;
    this.context = new Context();
    return this.context;
  }

  private load(source: SoundSource, context: AudioContext) {
    if (isAudioBuffer(source)) return Promise.resolve(source);
    const cached = this.buffers.get(source);
    if (cached !== undefined) return cached;

    const promise = this.loadSource(source, context).catch((error: unknown) => {
      this.buffers.delete(source);
      throw error;
    });
    this.buffers.set(source, promise);
    return promise;
  }

  private async loadSource(source: Exclude<SoundSource, AudioBuffer>, context: AudioContext) {
    const data =
      source instanceof ArrayBuffer
        ? source.slice(0)
        : await fetch(source instanceof URL ? source.href : source).then((response) => {
            if (!response.ok) throw new Error(`Unable to load disintegration sound: ${response.status}`);
            return response.arrayBuffer();
          });
    return context.decodeAudioData(data);
  }

  private stop(source: AudioBufferSourceNode) {
    try {
      source.stop();
    } catch {
      // A source may have ended between the state check and stop().
    }
    this.activeSources.delete(source);
  }
}
