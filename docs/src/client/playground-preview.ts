interface PreviewOptions {
  isBusy(): boolean;
  run(): Promise<void>;
  onChange(): void;
  onError(error: unknown): void;
}

/** Owns the debounce, queued work and preset lock as one cancellable action. */
export class PlaygroundPreview {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending = false;
  private running = false;
  private disposed = false;
  private queuedPreset = false;

  constructor(private readonly options: PreviewOptions) {}

  get presetPending() {
    return this.queuedPreset;
  }

  schedule(fromPreset = false) {
    if (this.disposed) return;
    this.clearTimer();
    this.pending = true;
    this.queuedPreset = fromPreset;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.resume();
    }, 240);
    this.options.onChange();
  }

  /** Called after a manual operation finishes; active previews finish reinserting their card first. */
  resume() {
    if (this.disposed || !this.pending || this.timer !== null || this.running || this.options.isBusy()) return;
    this.pending = false;
    this.queuedPreset = false;
    this.running = true;
    void (async () => {
      try {
        await this.options.run();
      } catch (error) {
        if (!this.disposed) this.options.onError(error);
      } finally {
        this.running = false;
        if (!this.disposed) {
          this.options.onChange();
          this.resume();
        }
      }
    })();
  }

  cancel() {
    this.clearTimer();
    this.pending = false;
    this.queuedPreset = false;
    this.options.onChange();
  }

  dispose() {
    this.disposed = true;
    this.cancel();
  }

  private clearTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
