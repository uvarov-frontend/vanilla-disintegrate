import type { EffectDefinition, FallbackEffectDefinition } from './types';

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
    typeof selection.restore?.animate !== 'function' ||
    (selection.remove.requires !== undefined && selection.remove.requires !== 'webgl2') ||
    (selection.restore.requires !== undefined && selection.restore.requires !== 'webgl2')
  ) {
    throw new TypeError('A disintegration effect requires remove and restore animation phases.');
  }
  return selection;
}

/** Validates a paired fallback while rejecting recursive WebGL2 requirements from JavaScript callers. */
export function resolveFallback(selection: FallbackEffectDefinition | undefined) {
  if (selection === undefined) return undefined;
  if (
    typeof selection !== 'object' ||
    selection === null ||
    typeof selection.remove?.animate !== 'function' ||
    typeof selection.restore?.animate !== 'function' ||
    selection.remove.requires !== undefined ||
    selection.restore.requires !== undefined
  ) {
    throw new TypeError('A fallback requires remove and restore phases that do not require WebGL2.');
  }
  return selection;
}
