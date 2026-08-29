import { resolvePreparation } from './defaults';
import { OperationRunner } from './operation-runner';
import { SnapshotPreparation } from './preparation';
import { resolveEffect } from './presets';
import { RetainedElements } from './retained-elements';
import type {
  EffectContext,
  EffectTarget,
  EffectTargets,
  DisintegratorOptions,
  RemovalId,
  RemoveOptions,
  RestoreOptions,
} from './types';

export class Disintegrator {
  private readonly retained = new RetainedElements();
  private readonly preparation: SnapshotPreparation;
  private readonly runner: OperationRunner;
  private destroyed = false;

  constructor(private readonly options: DisintegratorOptions = {}) {
    this.preparation = new SnapshotPreparation(
      options.capture,
      resolvePreparation(options.preparation),
      (error, element) => this.reportBackgroundError(error, element),
    );
    this.runner = new OperationRunner(options, this.preparation, this.retained);
  }

  remove(target: EffectTarget, options: RemoveOptions = {}) {
    this.assertAlive();
    const element = this.resolveElement(target);
    const effect = resolveEffect(options.effect ?? this.options.effect, this.options.effects);
    const removalId = options.retain === true ? this.retained.createId() : null;
    return this.runner.run({ kind: 'remove', element, effect, removalId, overrides: options });
  }

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

  register(targets: EffectTargets) {
    this.assertAlive();
    return this.preparation.register(this.resolveElements(targets));
  }

  prepare(targets: EffectTargets) {
    this.assertAlive();
    return this.preparation.prepare(this.resolveElements(targets));
  }

  invalidate(targets: EffectTargets) {
    this.assertAlive();
    this.preparation.invalidate(this.resolveElements(targets));
  }

  clearPrepared() {
    this.assertAlive();
    this.preparation.clear();
  }

  take(id: RemovalId) {
    this.assertAlive();
    return this.retained.take(id);
  }

  discard(id: RemovalId) {
    this.assertAlive();
    return this.retained.discard(id);
  }

  discardAll() {
    this.assertAlive();
    return this.retained.discardAll();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.runner.destroy();
    this.preparation.destroy();
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

  private assertAlive() {
    if (this.destroyed) throw new Error('This Disintegrator instance has been destroyed.');
  }
}
