import { SoundPlayer } from './audio';
import { resolveAudioPreparation, resolvePreparation } from './defaults';
import { OperationRunner } from './operation-runner';
import { SnapshotPreparation } from './preparation';
import { resolveEffect } from './presets';
import { RetainedElements } from './retained-elements';
import type {
  EffectContext,
  EffectTarget,
  EffectTargets,
  DisintegratorOptions,
  EffectSelection,
  RemovalId,
  RemoveOptions,
  RestoreOptions,
} from './types';

/**
 * Coordinates DOM removal/restoration, paired effects, sound and optional
 * snapshot preparation. It never decides where restored content is inserted.
 */
export class Disintegrator {
  private readonly retained = new RetainedElements();
  private readonly preparation: SnapshotPreparation;
  private readonly sound: SoundPlayer;
  private readonly runner: OperationRunner;
  private destroyed = false;

  /** Creates an independent animation instance. Call `destroy()` when its UI is disposed. */
  constructor(private readonly options: DisintegratorOptions = {}) {
    const audioPreparation = resolveAudioPreparation(options.audioPreparation);
    this.preparation = new SnapshotPreparation(
      options.capture,
      resolvePreparation(options.preparation),
      (error, element) => this.reportBackgroundError(error, element),
    );
    this.sound = new SoundPlayer(audioPreparation.cacheByteBudget);
    this.runner = new OperationRunner(options, this.preparation, this.retained, this.sound);
    if (audioPreparation.enabled && options.sound !== undefined && options.sound !== false) {
      this.sound.schedule(
        this.resolveSoundDefinitions(audioPreparation.effects ?? options.effect),
        audioPreparation.strategy,
      );
    }
  }

  /**
   * Animates removal, then detaches the element (or invokes `detach`). With
   * `retain: true`, returns a `removalId` that can later be passed to `take()`.
   */
  remove(target: EffectTarget, options: RemoveOptions = {}) {
    this.assertAlive();
    const element = this.resolveElement(target);
    const effect = resolveEffect(options.effect ?? this.options.effect, this.options.effects);
    const removalId = options.retain === true ? this.retained.createId() : null;
    return this.runner.run({ kind: 'remove', element, effect, removalId, overrides: options });
  }

  /**
   * Animates an already connected, measurable element into its current final
   * position. The application inserts the element before calling this method.
   */
  restore(target: EffectTarget, options: RestoreOptions = {}) {
    this.assertAlive();
    const element = this.resolveElement(target);
    const bounds = element.getBoundingClientRect();
    if (!element.isConnected || bounds.width <= 0 || bounds.height <= 0) {
      throw new TypeError('restore() requires a connected element with measurable geometry.');
    }
    const effect =
      options.effect === undefined
        ? (this.retained.effectFor(element) ?? resolveEffect(this.options.effect, this.options.effects))
        : resolveEffect(options.effect, this.options.effects);
    this.retained.associate(element, effect);
    return this.runner.run({ kind: 'restore', element, effect, removalId: null, overrides: options });
  }

  /**
   * Registers elements as candidates for optional background preparation.
   * Returns an idempotent function that unregisters exactly these elements.
   */
  register(targets: EffectTargets) {
    this.assertAlive();
    return this.preparation.register(this.resolveElements(targets));
  }

  /** Immediately captures elements into the bounded cache, regardless of background strategy. */
  prepare(targets: EffectTargets) {
    this.assertAlive();
    return this.preparation.prepare(this.resolveElements(targets));
  }

  /** Drops stale snapshots; registered eligible elements are scheduled for a fresh background capture. */
  invalidate(targets: EffectTargets) {
    this.assertAlive();
    this.preparation.invalidate(this.resolveElements(targets));
  }

  /** Releases every cached snapshot while keeping registered elements registered. */
  clearPrepared() {
    this.assertAlive();
    this.preparation.clear();
  }

  /** Immediately fetches and decodes the selected effects' native audio. */
  prepareAudio(effects: EffectSelection | readonly EffectSelection[] = this.options.effect ?? 'dust') {
    this.assertAlive();
    return this.sound.prepareAll(this.resolveSoundDefinitions(effects));
  }

  /** Releases decoded audio belonging to the selected effects without stopping active playback. */
  discardPreparedAudio(effects: EffectSelection | readonly EffectSelection[] = this.options.effect ?? 'dust') {
    this.assertAlive();
    return this.sound.discard(this.resolveSoundDefinitions(effects));
  }

  /** Releases every decoded audio buffer while leaving sound configuration unchanged. */
  clearPreparedAudio() {
    this.assertAlive();
    this.sound.clearPrepared();
  }

  /** Returns a retained node and consumes its `RemovalId`; returns `null` when it was already released. */
  take(id: RemovalId) {
    this.assertAlive();
    return this.retained.take(id);
  }

  /** Permanently releases one retained node and any cached snapshot associated with it. */
  discard(id: RemovalId) {
    this.assertAlive();
    const element = this.retained.elementFor(id);
    const discarded = this.retained.discard(id);
    if (element !== null) this.preparation.invalidate([element]);
    return discarded;
  }

  /** Permanently releases all retained nodes and their associated snapshots. */
  discardAll() {
    this.assertAlive();
    const elements = this.retained.elements();
    const count = this.retained.discardAll();
    this.preparation.invalidate(elements);
    return count;
  }

  /** Cancels active visuals and releases retained nodes, snapshots, observers and audio resources. */
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.runner.destroy();
    this.preparation.destroy();
    this.sound.destroy();
    this.retained.discardAll();
  }

  private resolveElement(target: EffectTarget) {
    if (target instanceof HTMLElement) return target;
    const element = document.querySelector<HTMLElement>(target);
    if (element === null) throw new TypeError(`No HTMLElement matches selector: ${target}`);
    return element;
  }

  private resolveElements(targets: EffectTargets) {
    if (targets instanceof HTMLElement) return [targets];
    if (typeof targets === 'string') return Array.from(document.querySelectorAll<HTMLElement>(targets));
    return Array.from(targets).filter((element): element is HTMLElement => element instanceof HTMLElement);
  }

  private reportBackgroundError(error: unknown, element: HTMLElement) {
    const context: EffectContext = { operation: 'remove', element, overlay: null, removalId: null };
    try {
      this.options.onError?.(error, context);
    } catch {
      // Background preparation remains isolated from application callbacks.
    }
  }

  private resolveSoundDefinitions(selections: EffectSelection | readonly EffectSelection[] | undefined) {
    const configuredSound = this.options.sound;
    if (configuredSound !== undefined && typeof configuredSound !== 'boolean') return [configuredSound];
    const effects: readonly EffectSelection[] =
      selections === undefined
        ? ['dust']
        : Array.isArray(selections)
          ? (selections as readonly EffectSelection[])
          : [selections as EffectSelection];
    return effects.flatMap((selection) => {
      const effect = resolveEffect(selection, this.options.effects);
      return [effect.remove.sound ?? null, effect.restore.sound ?? null];
    });
  }

  private assertAlive() {
    if (this.destroyed) throw new Error('This Disintegrator instance has been destroyed.');
  }
}
