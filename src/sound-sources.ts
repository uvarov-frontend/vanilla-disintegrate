import type { DisintegratorOptions, SoundSource } from './types';

type SoundSourceRegistry = Readonly<Record<string, SoundSource>>;

const registries = new WeakMap<object, SoundSourceRegistry>();

/** Associates private entry-point assets without adding infrastructure keys to the public options type. */
export function bindSoundSources(options: DisintegratorOptions, sources: SoundSourceRegistry) {
  registries.set(options, sources);
  return options;
}

/** Built-in identifiers resolve once; every other string remains an ordinary URL. */
export function soundSourceResolver(options: DisintegratorOptions) {
  const sources = registries.get(options);
  return (source: SoundSource): SoundSource => {
    if (typeof source !== 'string' || sources === undefined) return source;
    return Object.prototype.hasOwnProperty.call(sources, source) ? sources[source]! : source;
  };
}
