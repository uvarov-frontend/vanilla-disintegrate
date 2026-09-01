import dustSoundUrl from './sounds/dust.mp3?url&no-inline';
import scatterSoundUrl from './sounds/scatter.mp3?url&no-inline';
import vaporSoundUrl from './sounds/vapor.mp3?url&no-inline';
import windSoundUrl from './sounds/wind.mp3?url&no-inline';

import type { BuiltInSound } from './types';

/** Bundled source URLs keyed by the same stable identifiers accepted by `SoundOptions.src`. */
export const builtInSounds: Readonly<Record<BuiltInSound, string>> = Object.freeze({
  dust: dustSoundUrl,
  scatter: scatterSoundUrl,
  vapor: vaporSoundUrl,
  wind: windSoundUrl,
});

export type {
  BuiltInSound,
  SoundContext,
  SoundDefinition,
  SoundFactory,
  SoundOptions,
  SoundPair,
  SoundPlayback,
  SoundPreparationSelection,
  SoundSelection,
  SoundSource,
} from './types';
