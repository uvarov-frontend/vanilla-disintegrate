import {
  curves,
  releases,
  customSoundId,
  builtInSoundKeys,
  stateFromPreset,
  type NumericKey,
  type PlaygroundConfiguration,
  type PlaygroundOperation,
  type PlaygroundCardWidth,
  type PlaygroundState,
  type PlaygroundSoundSource,
} from './playground-state';
import { ranges } from './playground-copy';
import { particlePresets, type BuiltInSound } from '../../../src/snapdom';

export const COMPACT_HASH_PREFIX = '#p=';

export const COMPACT_HASH_VERSION = 2;

export type CompactInteger = 'i16' | 'u8' | 'u16';

export interface CompactNumberDefinition {
  readonly key: NumericKey;
  readonly scale: number;
  readonly type: CompactInteger;
}

// The order is the compact-link wire format.
export const compactNumbers: readonly CompactNumberDefinition[] = [
  { key: 'particleSize', scale: 4, type: 'u8' },
  { key: 'alphaThreshold', scale: 100, type: 'u8' },
  { key: 'releaseRandomness', scale: 100, type: 'u8' },
  { key: 'duration', scale: 1, type: 'u16' },
  { key: 'stagger', scale: 1, type: 'u16' },
  { key: 'fadeStart', scale: 100, type: 'u8' },
  { key: 'layoutRelease', scale: 100, type: 'u8' },
  { key: 'horizontalDrift', scale: 1, type: 'u8' },
  { key: 'horizontalMin', scale: 1, type: 'i16' },
  { key: 'horizontalMax', scale: 1, type: 'i16' },
  { key: 'verticalMin', scale: 1, type: 'i16' },
  { key: 'verticalMax', scale: 1, type: 'i16' },
  { key: 'convergence', scale: 100, type: 'u8' },
  { key: 'swirl', scale: 1, type: 'u8' },
  { key: 'waveTurns', scale: 20, type: 'u8' },
  { key: 'endScale', scale: 100, type: 'u8' },
  { key: 'rotationMin', scale: 1, type: 'i16' },
  { key: 'rotationMax', scale: 1, type: 'i16' },
  { key: 'soundVolume', scale: 100, type: 'u8' },
  { key: 'soundPlaybackRate', scale: 100, type: 'u8' },
  { key: 'soundDelay', scale: 1, type: 'u16' },
  { key: 'soundFadeDuration', scale: 100, type: 'u8' },
];

export class CompactWriter {
  readonly bytes: number[] = [];

  u8(value: number) {
    if (!Number.isInteger(value) || value < 0 || value > 0xff) throw new RangeError('Invalid compact uint8.');
    this.bytes.push(value);
  }

  u16(value: number) {
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new RangeError('Invalid compact uint16.');
    this.bytes.push(value >>> 8, value & 0xff);
  }

  i16(value: number) {
    if (!Number.isInteger(value) || value < -0x8000 || value > 0x7fff) throw new RangeError('Invalid compact int16.');
    this.u16(value & 0xffff);
  }

  text(value: string) {
    const encoded = new TextEncoder().encode(value);
    this.u8(encoded.length);
    this.bytes.push(...encoded);
  }
}

export class CompactReader {
  private offset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  get done() {
    return this.offset === this.bytes.length;
  }

  u8() {
    const value = this.bytes[this.offset];
    if (value === undefined) throw new RangeError('Truncated compact link.');
    this.offset += 1;
    return value;
  }

  u16() {
    return (this.u8() << 8) | this.u8();
  }

  i16() {
    const value = this.u16();
    return value >= 0x8000 ? value - 0x1_0000 : value;
  }

  text() {
    const length = this.u8();
    const end = this.offset + length;
    if (end > this.bytes.length) throw new RangeError('Truncated compact text.');
    const value = new TextDecoder('utf-8', { fatal: true }).decode(this.bytes.subarray(this.offset, end));
    this.offset = end;
    return value;
  }
}

export interface PlaygroundHashState {
  readonly configuration: PlaygroundConfiguration;
  readonly operation: PlaygroundOperation;
  readonly cardWidth: PlaygroundCardWidth;
}

export function writeCompactNumber(writer: CompactWriter, definition: CompactNumberDefinition, value: number) {
  const compactValue = Math.round(value * definition.scale);
  writer[definition.type](compactValue);
}

export function readCompactNumber(reader: CompactReader, definition: CompactNumberDefinition) {
  const value = reader[definition.type]() / definition.scale;
  const range = ranges.find((candidate) => candidate.key === definition.key);
  if (range === undefined || value < range.min || value > range.max)
    throw new RangeError('Compact playground value is out of range.');
  return value;
}

export function writeCompactState(writer: CompactWriter, state: PlaygroundState) {
  const curve = curves.indexOf(state.curve);
  const release = releases.indexOf(state.release);
  writer.u8(curve | (release << 2) | (state.soundEnabled ? 1 << 5 : 0) | (state.soundReverse ? 1 << 6 : 0));

  const customId = customSoundId(state.soundSource);
  if (customId === null) writer.u8(builtInSoundKeys.indexOf(state.soundSource as BuiltInSound));
  else {
    writer.u8(0xff);
    writer.text(customId);
  }
  for (const definition of compactNumbers) writeCompactNumber(writer, definition, state[definition.key]);
}

export function readCompactState(reader: CompactReader): PlaygroundState {
  const metadata = reader.u8();
  if ((metadata & 0x80) !== 0) throw new RangeError('Unsupported compact playground flags.');
  const curve = curves[metadata & 0b11];
  const release = releases[(metadata >>> 2) & 0b111];
  if (curve === undefined || release === undefined) throw new RangeError('Invalid compact playground options.');

  const soundCode = reader.u8();
  let soundSource: PlaygroundSoundSource;
  if (soundCode === 0xff) {
    const customId = reader.text();
    if (customId === '') throw new RangeError('Invalid compact custom sound.');
    soundSource = `custom:${customId}`;
  } else {
    const builtInSound = builtInSoundKeys[soundCode];
    if (builtInSound === undefined) throw new RangeError('Invalid compact sound.');
    soundSource = builtInSound;
  }

  const state = stateFromPreset(particlePresets.dust, 'remove');
  state.curve = curve;
  state.release = release;
  state.soundEnabled = (metadata & (1 << 5)) !== 0;
  state.soundReverse = (metadata & (1 << 6)) !== 0;
  state.soundSource = soundSource;
  for (const definition of compactNumbers) state[definition.key] = readCompactNumber(reader, definition);
  if (
    state.horizontalMin > state.horizontalMax ||
    state.verticalMin > state.verticalMax ||
    state.rotationMin > state.rotationMax
  )
    throw new RangeError('Invalid compact playground range.');
  return state;
}

export function base64UrlFromBytes(bytes: readonly number[]) {
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function bytesFromBase64Url(value: string) {
  if (!/^[\w-]+$/.test(value)) throw new TypeError('Invalid compact playground encoding.');
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function compactHash(
  configuration: PlaygroundConfiguration,
  operation: PlaygroundOperation,
  cardWidth: PlaygroundCardWidth,
) {
  const writer = new CompactWriter();
  writer.u8(COMPACT_HASH_VERSION);
  writer.u8((operation === 'restore' ? 1 : 0) | (cardWidth === 'narrow' ? 1 << 1 : 0));
  writeCompactState(writer, configuration.remove);
  writeCompactState(writer, configuration.restore);
  return `${COMPACT_HASH_PREFIX}${base64UrlFromBytes(writer.bytes)}`;
}

export function playgroundStateFromHash(): PlaygroundHashState | null {
  if (!window.location.hash.startsWith(COMPACT_HASH_PREFIX)) return null;
  try {
    const reader = new CompactReader(bytesFromBase64Url(window.location.hash.slice(COMPACT_HASH_PREFIX.length)));
    if (reader.u8() !== COMPACT_HASH_VERSION) return null;
    const flags = reader.u8();
    if ((flags & 0xfc) !== 0) return null;
    const configuration = {
      remove: readCompactState(reader),
      restore: readCompactState(reader),
    };
    if (!reader.done) return null;
    return {
      configuration,
      operation: (flags & 1) === 0 ? 'remove' : 'restore',
      cardWidth: (flags & (1 << 1)) === 0 ? 'wide' : 'narrow',
    };
  } catch {
    return null;
  }
}

export function writeHash(
  configuration: PlaygroundConfiguration,
  operation: PlaygroundOperation,
  cardWidth: PlaygroundCardWidth,
) {
  const url = `${window.location.pathname}${window.location.search}${compactHash(configuration, operation, cardWidth)}`;
  window.history.replaceState(window.history.state, '', url);
}
