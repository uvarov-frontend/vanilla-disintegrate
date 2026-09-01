import type { EffectDefinition } from './types';

/**
 * Freezes a custom paired effect and preserves its narrow TypeScript type.
 * Use it for inline effects and reusable custom animation modules.
 */
export function defineEffect<const T extends EffectDefinition>(effect: T): Readonly<T> {
  return Object.freeze({
    ...effect,
    remove: Object.freeze({ ...effect.remove }),
    restore: Object.freeze({ ...effect.restore }),
  });
}

export function resolveEffect(selection: EffectDefinition | undefined) {
  if (selection === undefined) {
    throw new TypeError('No effect is configured. Pass either a complete preset or a custom effect object.');
  }
  if (
    typeof selection !== 'object' ||
    selection === null ||
    typeof selection.remove?.animate !== 'function' ||
    typeof selection.restore?.animate !== 'function'
  ) {
    throw new TypeError('A disintegration effect requires remove and restore animation phases.');
  }
  return selection;
}
