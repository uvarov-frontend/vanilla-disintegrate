import type { SoundOptions, SoundSource } from './types';

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
  private buffer: AudioBuffer | null = null;
  private loadPromise: Promise<void> | null = null;
  private activeSource: AudioBufferSourceNode | null = null;

  constructor(
    private readonly options: SoundOptions | false,
    private readonly onError: (error: unknown) => void,
  ) {}

  preload() {
    if (this.options === false || this.buffer !== null || this.loadPromise !== null) return;
    const context = this.getContext();
    if (context === null) return;

    this.loadPromise = this.load(context)
      .catch((error: unknown) => {
        this.loadPromise = null;
        this.onError(error);
      })
      .then(noop);
  }

  unlock() {
    this.preload();
    if (this.context?.state === 'suspended') void this.context.resume().catch(this.onError);
  }

  play(fallbackDurationSeconds: number) {
    if (this.options === false || this.context === null || this.buffer === null) return noop;
    const options = this.options;
    const context = this.context;
    const buffer = this.buffer;
    let playbackSource: AudioBufferSourceNode | null = null;
    let cancelled = false;

    const start = () => {
      if (cancelled) return;
      this.stop();
      const source = context.createBufferSource();
      const gain = context.createGain();
      const startedAt = context.currentTime;
      const duration = Math.max(0, Math.min(options.duration ?? fallbackDurationSeconds, buffer.duration));
      if (duration === 0) return;
      const fadeDuration = Math.max(0, Math.min(options.fadeDuration ?? 0.18, duration));
      const volume = Math.max(0, Math.min(options.gain ?? 0.32, 1));
      const endsAt = startedAt + duration;

      source.buffer = buffer;
      gain.gain.setValueAtTime(volume, startedAt);
      gain.gain.setValueAtTime(volume, endsAt - fadeDuration);
      gain.gain.linearRampToValueAtTime(0, endsAt);
      source.connect(gain);
      gain.connect(context.destination);
      this.activeSource = source;
      playbackSource = source;
      source.addEventListener(
        'ended',
        () => {
          source.disconnect();
          gain.disconnect();
          if (this.activeSource === source) this.activeSource = null;
        },
        { once: true },
      );
      source.start(startedAt);
      source.stop(endsAt);
    };

    if (context.state === 'running') {
      start();
    } else {
      void context.resume().then(start).catch(this.onError);
    }

    return () => {
      cancelled = true;
      if (playbackSource === null || this.activeSource !== playbackSource) return;
      this.stopSource(playbackSource);
    };
  }

  destroy() {
    this.stop();
    if (this.context !== null && this.context.state !== 'closed') void this.context.close().catch(noop);
    this.context = null;
    this.buffer = null;
    this.loadPromise = null;
  }

  private getContext() {
    if (this.context !== null) return this.context;
    const Context = getAudioContextConstructor();
    if (Context === null) return null;
    this.context = new Context();
    return this.context;
  }

  private async load(context: AudioContext) {
    if (this.options === false) return;
    const source = this.options.src;
    if (isAudioBuffer(source)) {
      this.buffer = source;
      return;
    }

    const data =
      source instanceof ArrayBuffer
        ? source.slice(0)
        : await fetch(source instanceof URL ? source.href : source).then((response) => {
            if (!response.ok) throw new Error(`Unable to load disintegration sound: ${response.status}`);
            return response.arrayBuffer();
          });
    this.buffer = await context.decodeAudioData(data);
  }

  private stop() {
    if (this.activeSource === null) return;
    this.stopSource(this.activeSource);
  }

  private stopSource(source: AudioBufferSourceNode) {
    try {
      source.stop();
    } catch {
      // The source may already have ended between the state check and stop().
    }
    if (this.activeSource === source) this.activeSource = null;
  }
}
