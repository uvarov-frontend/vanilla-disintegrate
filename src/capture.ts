import { snapdom, type SnapdomOptions, type SnapdomPlugin } from '@zumer/snapdom';

import type { SnapshotCapture } from './types';

const DEFAULT_CAPTURE_OPTIONS: SnapdomOptions = {
  embedFonts: true,
  fast: true,
  filterMode: 'remove',
  outerShadows: false,
  outerTransforms: true,
  reconcile: true,
  scale: 1,
};

function resolveCaptureDpr() {
  const devicePixelRatio = typeof window === 'undefined' ? 1 : window.devicePixelRatio;
  return Math.min(Math.max(devicePixelRatio || 1, 1), 2);
}

/** Creates a SnapDOM `toCanvas()` adapter with the library's capture defaults. */
export function createSnapdomCapture(options: SnapdomOptions = {}): SnapshotCapture {
  const customFilter = options.filter;
  return (element, context) => {
    // SnapDOM exposes no abort signal, so an in-flight capture cannot be stopped.
    // Refusing an already-aborted one avoids producing an unusable result.
    if (context.signal.aborted) throw new DOMException('Snapshot capture was aborted.', 'AbortError');
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
    const rect = element.getBoundingClientRect();
    const ownerWindow = element.ownerDocument.defaultView;
    const defaultClip =
      options.clip === undefined &&
      Number.isFinite(rect.width) &&
      Number.isFinite(rect.height) &&
      rect.width > 0 &&
      rect.height > 0
        ? {
            clip: {
              height: rect.height,
              width: rect.width,
              x: rect.left + (ownerWindow?.scrollX ?? 0),
              y: rect.top + (ownerWindow?.scrollY ?? 0),
            },
          }
        : {};

    return snapdom.toCanvas(element, {
      ...DEFAULT_CAPTURE_OPTIONS,
      dpr: resolveCaptureDpr(),
      ...options,
      ...defaultClip,
      ...(plugins === undefined ? {} : { plugins }),
      filter: (node) => {
        const isReadyImage = !(node instanceof HTMLImageElement) || (node.complete && node.naturalWidth > 0);
        return isReadyImage && (customFilter?.(node) ?? true);
      },
    });
  };
}

export type { SnapdomOptions } from '@zumer/snapdom';
