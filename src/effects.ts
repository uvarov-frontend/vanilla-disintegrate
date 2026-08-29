import type { EffectDefinition } from './types';

export function defineEffect<const T extends EffectDefinition>(effect: T): Readonly<T> {
  return Object.freeze({
    ...effect,
    remove: Object.freeze({ ...effect.remove }),
    restore: Object.freeze({ ...effect.restore }),
  });
}
