import { defineEffect } from './effects';
import { isSoundPair } from './sound-selection';
import type { PresetDefinition, PresetSelection, SoundDefinition, SoundSelection } from './types';

function freezeSoundDefinition(definition: SoundDefinition | false | undefined) {
  if (definition === undefined || definition === false || typeof definition !== 'object' || !('src' in definition)) {
    return definition;
  }
  return Object.freeze({ ...definition });
}

function freezeSoundSelection(selection: SoundSelection) {
  return Object.freeze({
    ...('remove' in selection ? { remove: freezeSoundDefinition(selection.remove) } : {}),
    ...('restore' in selection ? { restore: freezeSoundDefinition(selection.restore) } : {}),
  });
}

function isConfiguredSound(selection: unknown): selection is SoundSelection {
  if (!isSoundPair(selection)) return false;
  const remove = 'remove' in selection ? selection.remove : undefined;
  const restore = 'restore' in selection ? selection.restore : undefined;
  return (remove !== undefined && remove !== false) || (restore !== undefined && restore !== false);
}

function validatePreset(selection: unknown): PresetDefinition {
  if (typeof selection !== 'object' || selection === null || !('effect' in selection) || !('sound' in selection)) {
    throw new TypeError('A disintegration preset requires both effect and sound.');
  }
  if (!isConfiguredSound(selection.sound)) {
    throw new TypeError('A disintegration preset requires configured audio for at least one operation.');
  }
  return selection as PresetDefinition;
}

/** Freezes a reusable visual-and-audio preset while preserving its narrow TypeScript type. */
export function definePreset<const T extends PresetDefinition>(preset: T): Readonly<T> {
  const effect =
    Object.isFrozen(preset.effect) && Object.isFrozen(preset.effect.remove) && Object.isFrozen(preset.effect.restore)
      ? preset.effect
      : defineEffect(preset.effect);
  return Object.freeze({
    ...preset,
    effect,
    sound: freezeSoundSelection(preset.sound),
  });
}

/** Resolves a named or inline preset without coupling it to either renderer or audio backend. */
export function resolvePreset(
  selection: PresetSelection | undefined,
  presets: Readonly<Record<string, PresetDefinition>>,
): PresetDefinition | undefined {
  if (selection === undefined) return undefined;
  if (typeof selection === 'object' && selection !== null) return validatePreset(selection);
  const preset = presets[selection];
  if (preset === undefined) throw new TypeError(`Unknown disintegration preset: ${selection}`);
  return validatePreset(preset);
}
