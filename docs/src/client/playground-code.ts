import type { ParticleOptions, SoundOptions, BuiltInPreset } from '../../../src/snapdom';
import {
  findCustomSound,
  customSoundId,
  usesDefaultPresetSound,
  matchingConfigurationPreset,
  matchingParticlePreset,
  type PlaygroundState,
  type PlaygroundSoundSource,
  type PlaygroundCustomSounds,
  type PlaygroundOperation,
  type PlaygroundConfiguration,
} from './playground-state';

export type OptionSource<Property extends string = string> = readonly [Property, string];

export type ParticleOptionSource = OptionSource<keyof ParticleOptions>;

export function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

export function particleOptionSources(state: PlaygroundState): readonly ParticleOptionSource[] {
  return [
    ['particleSize', state.particleSize === 0 ? `'auto'` : formatNumber(state.particleSize)],
    ['alphaThreshold', formatNumber(state.alphaThreshold)],
    ['curve', `'${state.curve}'`],
    ['release', `'${state.release}'`],
    ['releaseRandomness', formatNumber(state.releaseRandomness)],
    ['duration', formatNumber(state.duration)],
    ['stagger', formatNumber(state.stagger)],
    ['fadeStart', formatNumber(state.fadeStart)],
    ['layoutRelease', formatNumber(state.layoutRelease)],
    ['horizontalDrift', formatNumber(state.horizontalDrift)],
    ['horizontalTravel', `[${formatNumber(state.horizontalMin)}, ${formatNumber(state.horizontalMax)}]`],
    ['verticalTravel', `[${formatNumber(state.verticalMin)}, ${formatNumber(state.verticalMax)}]`],
    ['convergence', formatNumber(state.convergence)],
    ['swirl', formatNumber(state.swirl)],
    ['waveTurns', formatNumber(state.waveTurns)],
    ['endScale', formatNumber(state.endScale)],
    ['rotation', `[${formatNumber(state.rotationMin)}, ${formatNumber(state.rotationMax)}]`],
  ];
}

export function splitSharedOptions<Property extends string>(
  removeOptions: readonly OptionSource<Property>[],
  restoreOptions: readonly OptionSource<Property>[],
) {
  const restoreValues = new Map<Property, string>(restoreOptions);
  const shared = removeOptions.filter(([property, value]) => restoreValues.get(property) === value);
  const sharedProperties = new Set(shared.map(([property]) => property));
  return {
    shared,
    remove: removeOptions.filter(([property]) => !sharedProperties.has(property)),
    restore: restoreOptions.filter(([property]) => !sharedProperties.has(property)),
  };
}

export function optionsSource(options: readonly OptionSource[], spread?: string, depth = 1) {
  const indentation = '  '.repeat(depth);
  const closingIndentation = '  '.repeat(depth - 1);
  const lines = [
    ...(spread === undefined ? [] : [`${indentation}...${spread},`]),
    ...options.map(([property, value]) => `${indentation}${property}: ${value},`),
  ];
  return `{
${lines.join('\n')}
${closingIndentation}}`;
}

export function playbackOptionSources(
  source: string,
  state: PlaygroundState,
): readonly OptionSource<keyof SoundOptions>[] {
  return [
    ['src', source],
    ['reverse', String(state.soundReverse)],
    ['volume', formatNumber(state.soundVolume)],
    ['playbackRate', formatNumber(state.soundPlaybackRate)],
    ['delay', formatNumber(state.soundDelay)],
    ['fadeDuration', formatNumber(state.soundFadeDuration)],
  ];
}

export function playbackSource(options: readonly OptionSource[], spread?: string) {
  const lines = [
    ...(spread === undefined ? [] : [`      ...${spread},`]),
    ...options.map(([property, value]) => `      ${property}: ${value},`),
  ];
  return `{
${lines.join('\n')}
    }`;
}

export function customSoundFileName(source: PlaygroundSoundSource, customSounds: PlaygroundCustomSounds) {
  const sound = findCustomSound(source, customSounds);
  if (sound === null || sound.name.trim() === '') return 'custom-sound.mp3';
  // Two stored files may carry the same name. Without the id the two phases would emit
  // an identical `src`, which the shared-option split then hoists into one constant —
  // silently giving both phases the same recording.
  const collides = customSounds.some((other) => other.id !== sound.id && other.name === sound.name);
  if (!collides) return sound.name;
  const extension = sound.name.lastIndexOf('.');
  return extension <= 0
    ? `${sound.name}-${sound.id}`
    : `${sound.name.slice(0, extension)}-${sound.id}${sound.name.slice(extension)}`;
}

export function soundSourceExpression(state: PlaygroundState, customSounds: PlaygroundCustomSounds) {
  if (customSoundId(state.soundSource) === null) return `'${state.soundSource}'`;
  // A file name is one path segment, and spaces or a `#` in it would truncate the URL.
  const path = `./${encodeURIComponent(customSoundFileName(state.soundSource, customSounds))}`;
  return `new URL(${JSON.stringify(path)}, import.meta.url)`;
}

export function soundCodeSource(
  operations: readonly PlaygroundOperation[],
  configuration: PlaygroundConfiguration,
  customSounds: PlaygroundCustomSounds,
) {
  let operationOptions = operations.map((operation) => ({
    operation,
    options: playbackOptionSources(
      soundSourceExpression(configuration[operation], customSounds),
      configuration[operation],
    ),
  }));
  let declaration = '';
  let spread: string | undefined;
  if (operationOptions.length === 2) {
    const shared = splitSharedOptions(operationOptions[0]!.options, operationOptions[1]!.options);
    if (shared.shared.length > 0) {
      declaration = `const sharedSoundOptions = ${optionsSource(shared.shared)};\n\n`;
      spread = 'sharedSoundOptions';
      operationOptions = [
        { operation: operationOptions[0]!.operation, options: shared.remove },
        { operation: operationOptions[1]!.operation, options: shared.restore },
      ];
    }
  }
  return {
    declaration,
    entries: operationOptions
      .map(({ operation, options }) =>
        // Both phases fully shared: point them at the constant instead of wrapping it
        // in an object whose only member is the spread.
        spread !== undefined && options.length === 0
          ? `    ${operation}: ${spread},`
          : `    ${operation}: ${playbackSource(options, spread)},`,
      )
      .join('\n'),
  };
}

export function presetSource(
  preset: BuiltInPreset,
  configuration: PlaygroundConfiguration,
  customSounds: PlaygroundCustomSounds,
) {
  const enabledOperations = (['remove', 'restore'] as const).filter(
    (operation) => configuration[operation].soundEnabled,
  );
  if (enabledOperations.length === 0) {
    return `import Disintegrator from 'vanilla-disintegrate/snapdom';

export const disintegrator = new Disintegrator({
  preset: '${preset}',
  sound: false,
});`;
  }
  if (
    enabledOperations.length === 2 &&
    enabledOperations.every((operation) => usesDefaultPresetSound(configuration[operation], operation, preset))
  ) {
    return `import Disintegrator from 'vanilla-disintegrate/snapdom';

export const disintegrator = new Disintegrator({
  preset: '${preset}',
});`;
  }

  const soundSource = soundCodeSource(enabledOperations, configuration, customSounds);
  return `import Disintegrator, { builtInPresets, definePreset } from 'vanilla-disintegrate/snapdom';

${soundSource.declaration}export const preset = definePreset({
  effect: builtInPresets.${preset}.effect,
  sound: {
${soundSource.entries}
  },
});

export const disintegrator = new Disintegrator({ preset });`;
}

export function effectSource(configuration: PlaygroundConfiguration, customSounds: PlaygroundCustomSounds) {
  const preset = matchingConfigurationPreset(configuration);
  if (preset !== null) return presetSource(preset, configuration, customSounds);

  // A phase that matches a built-in preset exactly is named rather than spelled
  // out. Each direction is checked on its own, so a vapor removal paired with a
  // scatter restoration reads as two presets instead of two option literals.
  const removePresetName = matchingParticlePreset(configuration.remove);
  const restorePresetName = matchingParticlePreset(configuration.restore);
  const removeOptionSources = particleOptionSources(configuration.remove);
  const restoreOptionSources = particleOptionSources(configuration.restore);
  // Only phases that still spell their options out can share a constant; a named
  // preset carries its own values and has nothing to hoist.
  const splitOptions =
    removePresetName === null && restorePresetName === null
      ? splitSharedOptions(removeOptionSources, restoreOptionSources)
      : { shared: [], remove: removeOptionSources, restore: restoreOptionSources };
  const identicalParticleOptions = splitOptions.remove.length === 0 && splitOptions.restore.length === 0;
  const sharedOptionsName = splitOptions.shared.length > 0 ? 'sharedParticleOptions' : undefined;
  const sharedParticleOptionsDeclaration =
    sharedOptionsName === undefined
      ? ''
      : `const ${sharedOptionsName}: ParticleOptions = ${optionsSource(splitOptions.shared)};\n\n`;
  const phaseSource = (
    presetName: BuiltInPreset | null,
    options: readonly OptionSource[],
    // Matching phases still need both keys: the shared constant is what they point
    // at, otherwise the copied snippet animates removal and leaves restore undefined.
  ) =>
    presetName !== null
      ? `particlePresets.${presetName}`
      : identicalParticleOptions && sharedOptionsName !== undefined
        ? sharedOptionsName
        : optionsSource(options, sharedOptionsName, 3);
  const particleEffectOptions = `    remove: ${phaseSource(removePresetName, splitOptions.remove)},
    restore: ${phaseSource(restorePresetName, splitOptions.restore)},`;
  const enabledOperations = (['remove', 'restore'] as const).filter(
    (operation) => configuration[operation].soundEnabled,
  );
  const soundSource = soundCodeSource(enabledOperations, configuration, customSounds);
  const presetsImport = removePresetName !== null || restorePresetName !== null ? ', particlePresets' : '';
  const particleOptionsImport = sharedOptionsName === undefined ? '' : ', type ParticleOptions';
  const importSource = `import Disintegrator, { createParticleEffect${presetsImport}${particleOptionsImport} } from 'vanilla-disintegrate/snapdom';`;
  return `${importSource}

${sharedParticleOptionsDeclaration}${soundSource.declaration}export const disintegrator = new Disintegrator({
  effect: createParticleEffect({
${particleEffectOptions}
  }),${enabledOperations.length > 0 ? `\n  sound: {\n${soundSource.entries}\n  },` : ''}
});`;
}

export function highlightedEffectSource(configuration: PlaygroundConfiguration, customSounds: PlaygroundCustomSounds) {
  const source = effectSource(configuration, customSounds);
  const pattern =
    /(["'][^"'\n]*["'])|\b(import|from|export|const|new|true|false|type)\b|(-?\d+(?:\.\d+)?)|(\b[a-zA-Z]\w*)(?=:)|\b(builtInPresets|createParticleEffect|definePreset|Disintegrator|ParticleOptions|URL)\b/g;
  const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let highlighted = '';
  let previousIndex = 0;
  for (const match of source.matchAll(pattern)) {
    const index = match.index;
    highlighted += escape(source.slice(previousIndex, index));
    const className = match[1]
      ? 'playground-syntax-string'
      : match[2]
        ? 'playground-syntax-keyword'
        : match[3]
          ? 'playground-syntax-number'
          : match[4]
            ? 'playground-syntax-property'
            : 'playground-syntax-function';
    highlighted += `<span class="${className}">${escape(match[0])}</span>`;
    previousIndex = index + match[0].length;
  }
  return highlighted + escape(source.slice(previousIndex));
}
