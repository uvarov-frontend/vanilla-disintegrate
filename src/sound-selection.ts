import type {
  EffectOperationKind,
  SoundDefinition,
  SoundPair,
  SoundPreparationSelection,
  SoundSelection,
} from './types';

/** Distinguishes an operation pair from one explicitly prepared sound definition. */
export function isSoundPair(selection: unknown): selection is SoundPair {
  return typeof selection === 'object' && selection !== null && ('remove' in selection || 'restore' in selection);
}

/** Resolves one phase without coupling it to the selected visual effect. */
export function soundForOperation(
  selection: false | SoundSelection | undefined,
  operation: EffectOperationKind,
): SoundDefinition | null {
  if (selection === undefined || selection === false) return null;
  const definition = selection[operation];
  return definition === undefined || definition === false ? null : definition;
}

/** Flattens public sound input for preparation and cache ownership. */
export function soundDefinitions(
  selection: false | SoundPreparationSelection | null | undefined,
): readonly (SoundDefinition | null)[] {
  if (selection === undefined || selection === null || selection === false) return [];
  if (Array.isArray(selection)) {
    const selections = selection as readonly (false | SoundDefinition | SoundSelection)[];
    return selections.flatMap((sound) => soundDefinitions(sound));
  }
  if (isSoundPair(selection)) {
    const pair = selection;
    return [
      pair.remove === false ? null : (pair.remove ?? null),
      pair.restore === false ? null : (pair.restore ?? null),
    ];
  }
  if (typeof selection === 'function') return [selection];
  if (typeof selection === 'object' && selection !== null && 'src' in selection) return [selection];
  throw new TypeError('Audio preparation requires sound options with src or a custom sound factory.');
}
