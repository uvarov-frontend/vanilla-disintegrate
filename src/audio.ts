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

interface AudioClient {
  readonly cacheByteBudget: number;
  readonly entries: Map<CachedBuffer, undefined>;
}

interface CachedBuffer {
  readonly key: SourceKey;
  readonly reverse: boolean;
  readonly clients: Set<AudioClient>;
  readonly dependents: Set<CachedBuffer>;
  dependency: CachedBuffer | null;
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

const sharedEngines = new WeakMap<Window, SharedAudioEngine>();

function getAudioContextConstructor(ownerWindow: Window): AudioContextConstructor | null {
  const audioWindow = ownerWindow as Window & typeof globalThis & { webkitAudioContext?: AudioContextConstructor };
  return audioWindow.AudioContext ?? audioWindow.webkitAudioContext ?? null;
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

function reverseBuffer(buffer: AudioBuffer, context: BaseAudioContext) {
  const reversed = context.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const samples = reversed.getChannelData(channel);
    samples.set(buffer.getChannelData(channel));
    samples.reverse();
  }
  return reversed;
}

class SharedAudioEngine {
  private context: AudioContext | null = null;
  private contextError: unknown = null;
  private contextUnavailable = false;
  private readonly sources = new Map<SourceKey, SourceBuffers>();
  private readonly clients = new Set<AudioClient>();

  constructor(private readonly ownerWindow: Window) {}

  acquire(client: AudioClient) {
    this.clients.add(client);
  }

  getContext() {
    if (this.context !== null && this.context.state !== 'closed') return this.context;
    if (this.contextUnavailable) return null;
    const Context = getAudioContextConstructor(this.ownerWindow);
    if (Context === null) {
      this.contextUnavailable = true;
      return null;
    }
    try {
      this.context = new Context();
    } catch (error) {
      this.contextError = error;
      this.contextUnavailable = true;
      throw error;
    }
    return this.context;
  }

  getContextError() {
    return this.contextError;
  }

  currentContext() {
    return this.context?.state === 'closed' ? null : this.context;
  }

  load(client: AudioClient, source: SoundSource, reverse: boolean, context: AudioContext) {
    if (!reverse && isAudioBuffer(source)) return Promise.resolve(source);

    const entry = this.entryFor(source, reverse, context);
    this.claim(client, entry);
    this.touch(client, entry);
    this.enforceBudget(client);
    return entry.promise;
  }

  private entryFor(source: SoundSource, reverse: boolean, context: AudioContext) {
    const key = sourceKey(source);
    const pair = this.sources.get(key) ?? {};
    this.sources.set(key, pair);
    const cached = reverse ? pair.reverse : pair.forward;
    if (cached !== undefined) return cached;

    const entry: CachedBuffer = {
      key,
      reverse,
      clients: new Set(),
      dependents: new Set(),
      dependency: null,
      promise: Promise.resolve(source as unknown as AudioBuffer),
      buffer: null,
      controller: reverse ? null : new AbortController(),
      bytes: 0,
      invalidated: false,
    };
    if (reverse) pair.reverse = entry;
    else pair.forward = entry;

    let loading: Promise<AudioBuffer>;
    if (reverse) {
      if (isAudioBuffer(source)) {
        loading = Promise.resolve(source);
      } else {
        const dependency = this.entryFor(source, false, context);
        entry.dependency = dependency;
        dependency.dependents.add(entry);
        loading = dependency.promise;
      }
      loading = loading.then((buffer) => reverseBuffer(buffer, context));
    } else {
      loading = this.loadSource(source as Exclude<SoundSource, AudioBuffer>, context, entry.controller!.signal);
    }
    entry.promise = loading
      .then((buffer) => {
        this.releaseDependency(entry);
        if (!entry.invalidated && (entry.clients.size > 0 || entry.dependents.size > 0)) {
          entry.buffer = buffer;
          entry.controller = null;
          entry.bytes = bufferBytes(buffer);
          for (const client of [...entry.clients]) this.enforceBudget(client);
        }
        return buffer;
      })
      .catch((error: unknown) => {
        this.deleteEntry(entry);
        throw error;
      });
    return entry;
  }

  discard(client: AudioClient, source: SoundSource, reverse: boolean) {
    const pair = this.sources.get(sourceKey(source));
    const entries = reverse ? [pair?.reverse] : [pair?.forward];
    let discarded = 0;
    for (const entry of entries) {
      if (entry !== undefined && entry.clients.has(client)) {
        this.release(client, entry);
        discarded += 1;
      }
    }
    return discarded;
  }

  clear(client: AudioClient) {
    for (const entry of [...client.entries.keys()]) this.release(client, entry);
  }

  releaseClient(client: AudioClient) {
    this.clear(client);
    this.clients.delete(client);
    if (this.clients.size > 0) return;

    for (const pair of [...this.sources.values()]) {
      if (pair.forward !== undefined) this.deleteEntry(pair.forward);
      if (pair.reverse !== undefined) this.deleteEntry(pair.reverse);
    }
    this.sources.clear();
    const context = this.context;
    this.context = null;
    if (context !== null && context.state !== 'closed') void context.close().catch(noop);
    sharedEngines.delete(this.ownerWindow);
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

  private claim(client: AudioClient, entry: CachedBuffer) {
    if (entry.invalidated || entry.clients.has(client)) return;
    entry.clients.add(client);
    client.entries.set(entry, undefined);
  }

  private release(client: AudioClient, entry: CachedBuffer) {
    entry.clients.delete(client);
    client.entries.delete(entry);
    if (entry.clients.size === 0 && entry.dependents.size === 0) this.deleteEntry(entry);
  }

  private touch(client: AudioClient, entry: CachedBuffer) {
    if (entry.invalidated || !entry.clients.has(client)) return;
    client.entries.delete(entry);
    client.entries.set(entry, undefined);
  }

  private enforceBudget(client: AudioClient) {
    let cachedBytes = 0;
    for (const entry of client.entries.keys()) cachedBytes += entry.bytes;

    while (cachedBytes > client.cacheByteBudget) {
      let oldest: CachedBuffer | undefined;
      for (const entry of client.entries.keys()) {
        if (entry.bytes === 0) continue;
        oldest = entry;
        break;
      }
      if (oldest === undefined) return;
      cachedBytes = Math.max(0, cachedBytes - oldest.bytes);
      this.release(client, oldest);
    }
  }

  private deleteEntry(entry: CachedBuffer) {
    if (entry.invalidated) return;
    entry.invalidated = true;
    entry.controller?.abort();
    entry.controller = null;
    for (const client of entry.clients) client.entries.delete(entry);
    entry.clients.clear();
    const dependency = entry.dependency;
    if (dependency !== null) {
      entry.dependency = null;
      dependency.dependents.delete(entry);
    }
    for (const dependent of entry.dependents) dependent.dependency = null;
    entry.dependents.clear();
    const pair = this.sources.get(entry.key);
    if (pair !== undefined) {
      if (pair.forward === entry) delete pair.forward;
      if (pair.reverse === entry) delete pair.reverse;
      if (pair.forward === undefined && pair.reverse === undefined) this.sources.delete(entry.key);
    }
    if (dependency !== null && dependency.clients.size === 0 && dependency.dependents.size === 0) {
      this.deleteEntry(dependency);
    }
  }

  private releaseDependency(entry: CachedBuffer) {
    const dependency = entry.dependency;
    if (dependency === null) return;
    entry.dependency = null;
    dependency.dependents.delete(entry);
    if (dependency.clients.size === 0 && dependency.dependents.size === 0) this.deleteEntry(dependency);
  }
}

export class SoundPlayer {
  private readonly client: AudioClient;
  private engine: SharedAudioEngine | null = null;
  private readonly activeSources = new Map<AudioBufferSourceNode, GainNode>();
  private readonly scheduled = new Set<() => void>();
  private generation = 0;
  private destroyed = false;

  constructor(cacheByteBudget = 8 * 1024 * 1024) {
    this.client = { cacheByteBudget, entries: new Map() };
  }

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
    const engine = this.getEngine();
    const context = engine?.getContext() ?? null;
    if (engine === null || context === null) return null;
    const generation = this.generation;
    const buffer = await engine.load(this.client, options.src, options.reverse === true, context);
    if (this.destroyed || generation !== this.generation) {
      throw new DOMException('Audio preparation was cancelled.', 'AbortError');
    }
    return { type: 'native', options, buffer };
  }

  /** Must run in the original user gesture so a suspended playback context can resume. */
  unlock(definition: SoundDefinition | null, onError: (error: unknown) => void) {
    if (definition === null || typeof definition === 'function') return;
    try {
      const engine = this.getEngine();
      const context = engine?.getContext();
      const contextError = engine?.getContextError() ?? null;
      if (context === null && contextError !== null) onError(contextError);
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
    if (prepared === null || this.destroyed) return noop;
    if (prepared.type === 'custom') return this.playCustom(prepared.factory, soundContext, onError);

    let gain: GainNode | null = null;
    let playback: AudioBufferSourceNode | null = null;
    try {
      const context = this.engine?.currentContext() ?? null;
      if (context === null) return noop;
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
      gain = context.createGain();
      const source = context.createBufferSource();
      playback = source;

      source.buffer = buffer;
      source.playbackRate.value = playbackRate;
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
      source.connect(gain);
      gain.connect(context.destination);
      this.activeSources.set(source, gain);
      source.addEventListener('ended', () => this.releaseSource(source), { once: true });
      source.start(startedAt, offset);
      source.stop(endsAt);
      return () => this.stop(source);
    } catch (error) {
      if (playback !== null && this.activeSources.has(playback)) {
        this.stop(playback);
      } else {
        try {
          playback?.disconnect();
        } catch {
          // Partially connected nodes are best-effort cleanup after setup failure.
        }
        try {
          gain?.disconnect();
        } catch {
          // Partially connected nodes are best-effort cleanup after setup failure.
        }
      }
      onError(error);
      return noop;
    }
  }

  discard(definitions: readonly (SoundDefinition | null)[]) {
    if (this.engine === null) return 0;
    let discarded = 0;
    for (const definition of definitions) {
      if (definition === null || typeof definition === 'function') continue;
      const options = soundOptions(definition);
      discarded += this.engine.discard(this.client, options.src, options.reverse === true);
    }
    return discarded;
  }

  clearPrepared() {
    this.generation += 1;
    for (const cancel of this.scheduled) cancel();
    this.scheduled.clear();
    this.engine?.clear(this.client);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const source of [...this.activeSources.keys()]) this.stop(source);
    this.clearPrepared();
    this.engine?.releaseClient(this.client);
    this.engine = null;
  }

  private playCustom(factory: SoundFactory, context: SoundContext, onError: (error: unknown) => void) {
    let stopped = false;
    let playback: SoundPlayback | void;
    const release = (stopPlayback: boolean) => {
      const current = playback;
      playback = undefined;
      if (current === undefined) return;
      if (stopPlayback) this.runSoundCleanup(() => current.stop?.(), onError);
      this.runSoundCleanup(() => current.dispose?.(), onError);
    };
    const stop = () => {
      if (stopped) return;
      stopped = true;
      release(true);
    };
    const fail = (error: unknown) => {
      if (stopped) return;
      onError(error);
      release(true);
    };
    try {
      void Promise.resolve(factory(context)).then((resolved) => {
        playback = resolved;
        if (stopped) {
          release(true);
          return;
        }
        try {
          if (resolved?.finished !== undefined) {
            void Promise.resolve(resolved.finished).then(() => release(false), fail);
          }
        } catch (error) {
          fail(error);
        }
      }, fail);
    } catch (error) {
      onError(error);
    }
    return stop;
  }

  private getEngine() {
    if (this.engine !== null) return this.engine;
    if (typeof window === 'undefined') return null;
    this.engine = sharedEngines.get(window) ?? new SharedAudioEngine(window);
    if (!sharedEngines.has(window)) sharedEngines.set(window, this.engine);
    this.engine.acquire(this.client);
    return this.engine;
  }

  private runSoundCleanup(cleanup: () => void, onError: (error: unknown) => void) {
    try {
      cleanup();
    } catch (error) {
      onError(error);
    }
  }

  private stop(source: AudioBufferSourceNode) {
    try {
      source.stop();
    } catch {
      // The source can finish between lookup and stop().
    }
    this.releaseSource(source);
  }

  private releaseSource(source: AudioBufferSourceNode) {
    const gain = this.activeSources.get(source);
    if (gain === undefined) return;
    this.activeSources.delete(source);
    try {
      source.disconnect();
    } catch {
      // A browser may already have disconnected a source that just ended.
    }
    try {
      gain.disconnect();
    } catch {
      // A browser may already have disconnected a source that just ended.
    }
  }

  private assertAlive() {
    if (this.destroyed) throw new Error('Audio preparation was destroyed.');
  }
}
