import { snapdom, type SnapdomOptions } from '@zumer/snapdom';

import type { SnapshotCapture } from './types';

const DEFAULT_CAPTURE_OPTIONS: SnapdomOptions = {
  dpr: 1,
  embedFonts: true,
  fast: true,
  filterMode: 'remove',
  outerShadows: false,
  outerTransforms: false,
  reconcile: true,
  scale: 1,
};

export function createSnapdomCapture(options: SnapdomOptions = {}): SnapshotCapture {
  const customFilter = options.filter;
  return (element) =>
    snapdom.toCanvas(element, {
      ...DEFAULT_CAPTURE_OPTIONS,
      ...options,
      filter: (node) => {
        const isReadyImage = !(node instanceof HTMLImageElement) || (node.complete && node.naturalWidth > 0);
        return isReadyImage && (customFilter?.(node) ?? true);
      },
    });
}

export type { SnapdomOptions } from '@zumer/snapdom';
