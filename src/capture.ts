import { snapdom, type SnapdomOptions, type SnapdomPlugin } from '@zumer/snapdom';

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
  return (element, context) => {
    const restoreRootOpacity = context.restoreRootOpacity;
    const restoreOpacityPlugin: SnapdomPlugin | null =
      context.operation === 'restore' && restoreRootOpacity !== undefined
        ? {
            name: 'vanilla-disintegrate:restore-root-opacity',
            beforeRender: ({ clone }) => {
              clone?.style.setProperty('opacity', restoreRootOpacity, 'important');
            },
          }
        : null;
    const plugins =
      restoreOpacityPlugin === null ? options.plugins : [...(options.plugins ?? []), restoreOpacityPlugin];

    return snapdom.toCanvas(element, {
      ...DEFAULT_CAPTURE_OPTIONS,
      ...options,
      ...(plugins === undefined ? {} : { plugins }),
      filter: (node) => {
        const isReadyImage = !(node instanceof HTMLImageElement) || (node.complete && node.naturalWidth > 0);
        return isReadyImage && (customFilter?.(node) ?? true);
      },
    });
  };
}

export type { SnapdomOptions } from '@zumer/snapdom';
