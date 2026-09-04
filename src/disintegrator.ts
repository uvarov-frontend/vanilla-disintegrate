import { SoundPlayer } from './audio';
import { resolveAudioPreparation, resolvePreparation } from './defaults';
import { resolveEffect, resolveFallback } from './effects';
import { OperationRunner } from './operation-runner';
import { SnapshotPreparation } from './preparation';
import { resolvePreset } from './preset';
import { RetainedElements } from './retained-elements';
import { soundDefinitions } from './sound-selection';
import { soundSourceResolver } from './sound-sources';
import type {
  DisintegratorOptions,
  EffectDefinition,
  EffectErrorContext,
  EffectOperationKind,
  EffectTarget,
  EffectTargets,
  FallbackEffectDefinition,
  OperationOptions,
  PresetDefinition,
  RemoveOptions,
  RemovalId,
  RestoreOptions,
  SoundPreparationSelection,
  SoundSelection,
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
  private readonly presets: Readonly<Record<string, PresetDefinition>>;
  private readonly defaultEffect: EffectDefinition;
  private readonly defaultSound: false | SoundSelection;
  private readonly fallback: FallbackEffectDefinition | undefined;
  private destroyed = false;

  /** Creates an independent animation instance. Call `destroy()` when its UI is disposed. */
  constructor(private readonly options: DisintegratorOptions) {
    if (
      options === undefined ||
      options === null ||
      typeof options !== 'object' ||
      (options.preset === undefined) === (options.effect === undefined) ||
      (options.preset !== undefined && options.sound !== undefined && options.sound !== false)
    ) {
      throw new TypeError('Configure exactly one of preset or effect. A preset may only be muted with sound: false.');
    }
    this.presets = options.presets ?? {};
    const preset = resolvePreset(options.preset, this.presets);
    this.defaultEffect = resolveEffect(options.effect ?? preset?.effect);
    this.defaultSound =
      preset === undefined ? (options.sound ?? false) : options.sound === false ? false : preset.sound;
    this.fallback = resolveFallback(options.fallback);
    const audioPreparation = resolveAudioPreparation(options.audioPreparation);
    this.preparation = new SnapshotPreparation(
      options.capture,
      resolvePreparation(options.preparation),
      (error, element) => this.reportBackgroundError(error, element),
    );
    this.sound = new SoundPlayer(audioPreparation.cacheByteBudget, soundSourceResolver(options));
    this.runner = new OperationRunner(options, this.preparation, this.retained, this.sound, this.fallback);
    const sounds = audioPreparation.sounds ?? this.defaultSound;
    if (audioPreparation.enabled && sounds !== undefined && sounds !== false) {
      this.sound.schedule(soundDefinitions(sounds), audioPreparation.strategy);
    }
  }

  /**
   * Animates removal, then detaches the element (or invokes `detach`). With
   * `retain: true`, returns a `removalId` that can later be passed to `take()`.
   */
  remove(target: EffectTarget, options: RemoveOptions = {}) {
    this.assertAlive();
    const element = this.resolveElement(target);
    const rejected = this.runner.rejectIfBusy('remove', element);
    if (rejected !== null) return rejected;
    const { effect, sound } = this.resolveOperation('remove', options, this.defaultEffect, this.defaultSound);
    return this.runner.run({ kind: 'remove', element, effect, sound, overrides: options });
  }

  /**
   * Animates an already connected, measurable element into its current final
   * position. The application inserts the element before calling this method.
   */
  restore(target: EffectTarget, options: RestoreOptions = {}) {
    this.assertAlive();
    const element = this.resolveElement(target);
    const rejected = this.runner.rejectIfBusy('restore', element);
    if (rejected !== null) return rejected;
    const bounds = element.getBoundingClientRect();
    if (!element.isConnected || bounds.width <= 0 || bounds.height <= 0) {
      throw new TypeError('restore() requires a connected element with measurable geometry.');
    }
    const retained = this.retained.presentationFor(element);
    const { effect, sound } = this.resolveOperation(
      'restore',
      options,
      retained?.effect ?? this.defaultEffect,
      retained?.sound ?? this.defaultSound,
    );
    const operation = this.runner.run({ kind: 'restore', element, effect, sound, overrides: options });
    this.retained.associate(element, { effect, sound });
    return operation;
  }

  /**
   * Registers elements as candidates for optional background preparation.
   * Registrations are reference-counted. The returned idempotent function
   * releases only this registration.
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

  /** Immediately loads and decodes native audio without coupling it to a visual effect. */
  prepareAudio(sounds: false | SoundPreparationSelection | undefined = this.defaultSound) {
    this.assertAlive();
    return this.sound.prepareAll(soundDefinitions(sounds));
  }

  /** Releases decoded audio ownership without stopping active playback. */
  discardPreparedAudio(sounds: false | SoundPreparationSelection | undefined = this.defaultSound) {
    this.assertAlive();
    return this.sound.discard(soundDefinitions(sounds));
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
    const context: EffectErrorContext = { operation: 'prepare', element, overlay: null, removalId: null };
    try {
      this.options.onError?.(error, context);
    } catch {
      // Background preparation remains isolated from application callbacks.
    }
  }

  private resolveOperation(
    operation: EffectOperationKind,
    options: OperationOptions,
    fallbackEffect: EffectDefinition,
    fallbackSound: false | SoundSelection,
  ) {
    if (options.preset !== undefined && options.effect !== undefined) {
      throw new TypeError('An operation cannot combine preset and effect.');
    }
    if (options.preset !== undefined) {
      if (options.sound !== undefined && options.sound !== false) {
        throw new TypeError('A preset operation may only be muted with sound: false.');
      }
      const preset = resolvePreset(options.preset, this.presets)!;
      return { effect: resolveEffect(preset.effect), sound: preset.sound };
    }
    if (options.effect !== undefined) {
      const selectedSound = options.sound;
      const sound: false | SoundSelection =
        selectedSound === undefined || selectedSound === false
          ? false
          : operation === 'remove'
            ? { remove: selectedSound }
            : { restore: selectedSound };
      return { effect: resolveEffect(options.effect), sound };
    }
    return { effect: fallbackEffect, sound: fallbackSound };
  }

  private assertAlive() {
    if (this.destroyed) throw new Error('This Disintegrator instance has been destroyed.');
  }
}
