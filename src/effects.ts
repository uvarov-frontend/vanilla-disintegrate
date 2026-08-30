import type { EffectDefinition, EffectSelection } from './types';

/**
 * Freezes a custom paired effect and preserves its narrow TypeScript type.
 * Use it for inline effects or entries in `DisintegratorOptions.effects`.
 */
export function defineEffect<const T extends EffectDefinition>(effect: T): Readonly<T> {
  return Object.freeze({
    ...effect,
    remove: Object.freeze({ ...effect.remove }),
    restore: Object.freeze({ ...effect.restore }),
  });
}

export function resolveEffect(
  selection: EffectSelection | undefined,
  effects: Readonly<Record<string, EffectDefinition>>,
) {
  if (typeof selection === 'object') return selection;
  if (selection === undefined) {
    throw new TypeError('No effect is configured. Pass an effect or use the package default entry.');
  }
  const effect = effects[selection];
  if (effect === undefined) throw new TypeError(`Unknown disintegration effect: ${selection}`);
  return effect;
}
