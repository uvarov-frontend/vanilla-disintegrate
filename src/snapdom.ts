import { createSnapdomCapture, type SnapdomOptions } from './capture';
import { Disintegrator as CoreDisintegrator } from './disintegrator';
import type { DisintegratorOptions } from './types';

export interface SnapdomDisintegratorOptions extends DisintegratorOptions {
  /** Forwarded to SnapDOM's `toCanvas()` on top of the library's capture defaults. */
  readonly snapdom?: SnapdomOptions;
}

/**
 * The core `Disintegrator` preconfigured with the SnapDOM capture adapter. Import
 * from `vanilla-disintegrate` instead when you supply your own `capture`.
 */
export class Disintegrator extends CoreDisintegrator {
  constructor(options: SnapdomDisintegratorOptions = {}) {
    const { capture, snapdom, ...rest } = options;
    super({ ...rest, capture: capture ?? createSnapdomCapture(snapdom) });
  }
}

export { createSnapdomCapture } from './capture';
export { defineEffect } from './effects';
export { createParticleAnimation, createParticleRestoreAnimation } from './particle-renderer';
export { builtInEffects } from './presets';
export type * from './types';
export type { SnapdomOptions } from './capture';

export default Disintegrator;
