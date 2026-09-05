import { createSnapdomCapture, type SnapdomCaptureOptions } from './capture';
import { Disintegrator as BuiltInDisintegrator } from './index';
import type { DisintegratorOptions } from './types';

/** Options for the SnapDOM-enabled entry point. */
export type SnapdomDisintegratorOptions = DisintegratorOptions & {
  /**
   * Forwarded to SnapDOM's `toCanvas()` on top of the library defaults. Capture
   * density follows the display DPR, capped at `2`, unless `dpr` is set, and is
   * reduced for large bitmaps by `maxCapturePixels` unless that budget is disabled.
   */
  readonly snapdom?: SnapdomCaptureOptions;
};

/**
 * The built-in `Disintegrator` preconfigured with the SnapDOM capture adapter. Import
 * from `vanilla-disintegrate` instead when you supply your own `capture`.
 */
export class Disintegrator extends BuiltInDisintegrator {
  /** Creates an instance with SnapDOM as its default capture adapter. */
  constructor(options: SnapdomDisintegratorOptions) {
    if (options === undefined || options === null || typeof options !== 'object') {
      super(options);
      return;
    }
    const { capture, snapdom, ...rest } = options;
    super({ ...rest, capture: capture ?? createSnapdomCapture(snapdom) });
  }
}

export { createSnapdomCapture } from './capture';
export { defineEffect } from './effects';
export { definePreset } from './preset';
export {
  configureParticleContexts,
  createParticleAnimation,
  createParticleRestoreAnimation,
} from './particle-renderer';
export { createParticleEffect, type ParticleEffectOptions } from './particle-effect';
export { builtInPresets } from './built-in-presets';
export { particlePresets } from './presets';
export { builtInSounds } from './sounds';
export type * from './types';
export type { SnapdomOptions, SnapdomCaptureOptions } from './capture';

export default Disintegrator;
