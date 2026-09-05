interface PreviewOptions {
  isBusy(): boolean;
  interrupt(): void;
  run(): Promise<void>;
  onChange(): void;
  onError(error: unknown): void;
}

/** Debounces replacement previews while letting cancelled work finish its cleanup. */
export class PlaygroundPreview {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending = false;
  private running = false;
  private disposed = false;

  constructor(private readonly options: PreviewOptions) {}

  schedule() {
    if (this.disposed) return;
    this.clearTimer();
    this.pending = true;
    this.options.interrupt();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.resume();
    }, 240);
    this.options.onChange();
  }

  /** Replacements may start once the previous operation and preview cleanup have settled. */
  resume() {
    if (this.disposed || !this.pending || this.timer !== null || this.running || this.options.isBusy()) return;
    this.pending = false;
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
    this.options.interrupt();
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
