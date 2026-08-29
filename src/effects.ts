import type { EffectDefinition } from './types';

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
