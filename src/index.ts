import { createSnapdomCapture } from './capture';
import { Disintegrator as RuntimeDisintegrator } from './disintegrator';
import type { DisintegratorOptions } from './types';

export class Disintegrator extends RuntimeDisintegrator {
  constructor(options: DisintegratorOptions = {}) {
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
