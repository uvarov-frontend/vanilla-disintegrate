import type {
  AudioPreparationStrategy,
  SoundContext,
  SoundDefinition,
  SoundFactory,
  SoundOptions,
  SoundPlayback,
  SoundSource,
} from './types';

const noop = () => undefined;

type AudioContextConstructor = typeof AudioContext;
type SourceKey = string | ArrayBuffer | AudioBuffer;

interface CachedBuffer {
  readonly key: SourceKey;
  readonly reverse: boolean;
  promise: Promise<AudioBuffer>;
  buffer: AudioBuffer | null;
  controller: AbortController | null;
  bytes: number;
  invalidated: boolean;
}

interface SourceBuffers {
  forward?: CachedBuffer;
  reverse?: CachedBuffer;
}

export type PreparedSound =
  | { readonly type: 'native'; readonly options: SoundOptions; readonly buffer: AudioBuffer }
  | { readonly type: 'custom'; readonly factory: SoundFactory }
  | null;

function getAudioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === 'undefined') return null;
  const audioWindow = window as typeof window & { webkitAudioContext?: AudioContextConstructor };
  return window.AudioContext ?? audioWindow.webkitAudioContext ?? null;
}

function isAudioBuffer(source: SoundSource): source is AudioBuffer {
  return typeof AudioBuffer !== 'undefined' && source instanceof AudioBuffer;
}

function sourceKey(source: SoundSource): SourceKey {
  return source instanceof URL ? source.href : source;
}

function soundOptions(definition: Exclude<SoundDefinition, SoundFactory>): SoundOptions {
  return typeof definition === 'object' && 'src' in definition ? definition : { src: definition };
}

function bufferBytes(buffer: AudioBuffer) {
  return buffer.length * buffer.numberOfChannels * Float32Array.BYTES_PER_ELEMENT;
}

/** Copies rather than reversing in place: the source may be application-owned. */
function reverseBuffer(buffer: AudioBuffer, context: BaseAudioContext) {
  const reversed = context.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const samples = reversed.getChannelData(channel);
    samples.set(buffer.getChannelData(channel));
    samples.reverse();
  }
  return reversed;
}

export class SoundPlayer {
  private context: AudioContext | null = null;
  private contextError: unknown = null;
  private contextUnavailable = false;
  private readonly sources = new Map<SourceKey, SourceBuffers>();
  private readonly lru = new Map<CachedBuffer, undefined>();
  private readonly activeSources = new Set<AudioBufferSourceNode>();
  private readonly scheduled = new Set<() => void>();
  private cachedBytes = 0;
  private generation = 0;
  private destroyed = false;

  constructor(private readonly cacheByteBudget = 8 * 1024 * 1024) {}

  /** Starts fetching and decoding without blocking the caller. */
  schedule(definitions: readonly (SoundDefinition | null)[], strategy: AudioPreparationStrategy) {
    if (this.destroyed || definitions.length === 0 || typeof window === 'undefined') return;
    let cancel: () => void = noop;
    const prepare = () => {
      this.scheduled.delete(cancel);
      void this.prepareAll(definitions).catch(noop);
    };
    if (strategy === 'immediate') {
      prepare();
      return;
    }
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(prepare, { timeout: 1000 });
      cancel = () => window.cancelIdleCallback(id);
    } else {
      const id = window.setTimeout(prepare, 200);
      cancel = () => window.clearTimeout(id);
    }
    this.scheduled.add(cancel);
  }

  /** Resolves only after every native source is decoded and ready for synchronous playback. */
  async prepareAll(definitions: readonly (SoundDefinition | null)[]) {
    await Promise.all(definitions.map((definition) => this.prepare(definition)));
  }

  async prepare(definition: SoundDefinition | null): Promise<PreparedSound> {
    this.assertAlive();
    if (definition === null) return null;
    if (typeof definition === 'function') return { type: 'custom', factory: definition };
    const options = soundOptions(definition);
    const context = this.getContext();
    if (context === null) return null;
    const generation = this.generation;
    const buffer = await this.load(options.src, context, options.reverse === true);
    if (this.destroyed || generation !== this.generation) {
      throw new DOMException('Audio preparation was cancelled.', 'AbortError');
    }
    return { type: 'native', options, buffer };
  }

  /** Must run in the original user gesture so a suspended playback context can resume. */
  unlock(definition: SoundDefinition | null, onError: (error: unknown) => void) {
    if (definition === null || typeof definition === 'function') return;
    if (this.contextUnavailable) {
      if (this.contextError !== null) onError(this.contextError);
      return;
    }
    try {
      const context = this.getContext();
      if (context?.state === 'suspended') void context.resume().catch(onError);
    } catch (error) {
      onError(error);
    }
  }

  play(
    prepared: PreparedSound,
    fallbackDurationSeconds: number,
    soundContext: SoundContext,
    onError: (error: unknown) => void,
  ) {
    if (prepared === null) return noop;
    if (prepared.type === 'custom') return this.playCustom(prepared.factory, soundContext, onError);

    try {
      const context = this.context;
      if (context === null || context.state === 'closed') return noop;
      const { buffer, options } = prepared;
      const playbackRate = Math.max(0.01, options.playbackRate ?? 1);
      const availableDuration = buffer.duration / playbackRate;
      const requestedDuration =
        options.duration ?? (fallbackDurationSeconds > 0 ? fallbackDurationSeconds : availableDuration);
      const duration = Math.max(0, Math.min(requestedDuration, availableDuration));
      if (duration === 0) return noop;
      const fadeDuration = Math.max(0, Math.min(options.fadeDuration ?? 0.18, duration));
      const gainValue = Math.max(0, Math.min(options.gain ?? 0.32, 1));
      const startedAt = context.currentTime + Math.max(0, options.delay ?? 0) / 1000;
      const endsAt = startedAt + duration;
      const gain = context.createGain();
      const playback = context.createBufferSource();

      playback.buffer = buffer;
      playback.playbackRate.value = playbackRate;
      const offset = options.reverse === true ? Math.max(0, buffer.duration - duration * playbackRate) : 0;
      if (options.reverse === true) {
        gain.gain.setValueAtTime(0, startedAt);
        gain.gain.linearRampToValueAtTime(gainValue, startedAt + fadeDuration);
        gain.gain.setValueAtTime(gainValue, endsAt);
      } else {
        gain.gain.setValueAtTime(gainValue, startedAt);
        gain.gain.setValueAtTime(gainValue, endsAt - fadeDuration);
        gain.gain.linearRampToValueAtTime(0, endsAt);
      }
      playback.connect(gain);
      gain.connect(context.destination);
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
      playback.start(startedAt, offset);
      playback.stop(endsAt);
      return () => this.stop(playback);
    } catch (error) {
      onError(error);
      return noop;
    }
  }

  discard(definitions: readonly (SoundDefinition | null)[]) {
    let discarded = 0;
    for (const definition of definitions) {
      if (definition === null || typeof definition === 'function') continue;
      const options = soundOptions(definition);
      const pair = this.sources.get(sourceKey(options.src));
      const entries = options.reverse === true ? [pair?.reverse, pair?.forward] : [pair?.forward];
      for (const entry of entries) {
        if (entry !== undefined && !entry.invalidated) {
          this.deleteEntry(entry);
          discarded += 1;
        }
      }
    }
    return discarded;
  }

  clearPrepared() {
    for (const cancel of this.scheduled) cancel();
    this.scheduled.clear();
    for (const pair of this.sources.values()) {
      if (pair.forward !== undefined) this.deleteEntry(pair.forward);
      if (pair.reverse !== undefined) this.deleteEntry(pair.reverse);
    }
    this.sources.clear();
    this.lru.clear();
    this.cachedBytes = 0;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.generation += 1;
    for (const source of this.activeSources) this.stop(source);
    this.activeSources.clear();
    this.clearPrepared();
    const context = this.context;
    this.context = null;
    if (context !== null && context.state !== 'closed') void context.close().catch(noop);
  }

  private playCustom(factory: SoundFactory, context: SoundContext, onError: (error: unknown) => void) {
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

  private getContext() {
    if (this.context !== null) return this.context;
    if (this.contextUnavailable) return null;
    const Context = getAudioContextConstructor();
    if (Context === null) {
      this.contextUnavailable = true;
      return null;
    }
    try {
      this.context = new Context();
    } catch (error) {
      this.contextUnavailable = true;
      this.contextError = error;
      throw error;
    }
    return this.context;
  }

  private load(source: SoundSource, context: AudioContext, reverse: boolean) {
    if (!reverse && isAudioBuffer(source)) return Promise.resolve(source);
    const key = sourceKey(source);
    const pair = this.sources.get(key) ?? {};
    this.sources.set(key, pair);
    const cached = reverse ? pair.reverse : pair.forward;
    if (cached !== undefined) {
      this.touch(cached);
      return cached.promise;
    }

    const entry: CachedBuffer = {
      key,
      reverse,
      promise: Promise.resolve(source as unknown as AudioBuffer),
      buffer: null,
      controller: reverse ? null : new AbortController(),
      bytes: 0,
      invalidated: false,
    };
    const load = reverse
      ? this.load(source, context, false).then((buffer) => reverseBuffer(buffer, context))
      : this.loadSource(source as Exclude<SoundSource, AudioBuffer>, context, entry.controller!.signal);
    entry.promise = load
      .then((buffer) => {
        if (!entry.invalidated && !this.destroyed) {
          entry.buffer = buffer;
          entry.controller = null;
          entry.bytes = bufferBytes(buffer);
          this.cachedBytes += entry.bytes;
          this.touch(entry);
          this.evict();
        }
        return buffer;
      })
      .catch((error: unknown) => {
        this.deleteEntry(entry);
        throw error;
      });
    if (reverse) pair.reverse = entry;
    else pair.forward = entry;
    return entry.promise;
  }

  private async loadSource(source: Exclude<SoundSource, AudioBuffer>, context: AudioContext, signal: AbortSignal) {
    const data =
      source instanceof ArrayBuffer
        ? source.slice(0)
        : await fetch(source instanceof URL ? source.href : source, { signal }).then((response) => {
            if (!response.ok) throw new Error(`Unable to load disintegration sound: ${response.status}`);
            return response.arrayBuffer();
          });
    return context.decodeAudioData(data);
  }

  private touch(entry: CachedBuffer) {
    if (entry.invalidated || entry.buffer === null) return;
    this.lru.delete(entry);
    this.lru.set(entry, undefined);
  }

  private evict() {
    while (this.cachedBytes > this.cacheByteBudget) {
      const oldest = this.lru.keys().next().value;
      if (oldest === undefined) return;
      this.deleteEntry(oldest);
    }
  }

  private deleteEntry(entry: CachedBuffer) {
    if (entry.invalidated) return;
    entry.invalidated = true;
    entry.controller?.abort();
    entry.controller = null;
    this.lru.delete(entry);
    this.cachedBytes = Math.max(0, this.cachedBytes - entry.bytes);
    const pair = this.sources.get(entry.key);
    if (pair !== undefined) {
      if (pair.forward === entry) delete pair.forward;
      if (pair.reverse === entry) delete pair.reverse;
      if (pair.forward === undefined && pair.reverse === undefined) this.sources.delete(entry.key);
    }
  }

  private stop(source: AudioBufferSourceNode) {
    try {
      source.stop();
    } catch {
      // A source may have ended between the state check and stop().
    }
    this.activeSources.delete(source);
  }

  private assertAlive() {
    if (this.destroyed) throw new Error('Audio preparation was destroyed.');
  }
}
