import {
  snapdom,
  type CanvasExportOptions,
  type CaptureContext,
  type SnapdomOptions,
  type SnapdomPlugin,
} from '@zumer/snapdom';

import type { SnapshotCapture } from './types';

/** SnapDOM settings plus a pixel budget applied before bitmap rasterization. */
export type SnapdomCaptureOptions = SnapdomOptions & {
  /** Reduces requested density for large captures. Defaults to 8,000,000 pixels; `false` disables the budget. */
  readonly maxCapturePixels?: number | false;
};

function budgetCaptureDensity(options: SnapdomOptions, bounds: DOMRect, maximum: number | false | undefined) {
  if (maximum === false) return;
  const budget = typeof maximum === 'number' && Number.isFinite(maximum) ? Math.max(1, maximum) : 8_000_000;
  const width = options.width ?? bounds.width;
  const height =
    options.height ?? (options.width === undefined ? bounds.height : (bounds.height * width) / bounds.width);
  const logicalWidth =
    options.width === undefined && options.height !== undefined ? (bounds.width * height) / bounds.height : width;
  const scale = Number(options.scale ?? 1);
  const dpr = Number(options.dpr ?? 1);
  const pixels = logicalWidth * height * scale * scale * dpr * dpr;
  if (Number.isFinite(pixels) && pixels > budget && scale > 0 && dpr > 0) {
    options.dpr = dpr * Math.sqrt(budget / pixels);
  }
}

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

function usesWebKitSvgRasterizer() {
  if (typeof navigator === 'undefined') return false;
  const userAgent = navigator.userAgent;
  if (!/AppleWebKit/i.test(userAgent)) return false;
  const ios = /iPad|iPhone|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1);
  return ios || !/Chrome|Chromium|Edg|OPR|Firefox|jsdom/i.test(userAgent);
}

function svgAttribute(tag: string, name: string) {
  return new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
}

function setSvgAttribute(tag: string, name: string, value: string) {
  const pattern = new RegExp(`(\\b${name}=")[^"]*"`);
  return pattern.test(tag) ? tag.replace(pattern, `$1${value}"`) : tag.replace(/>$/, ` ${name}="${value}">`);
}

function svgNumber(value: number) {
  return String(Number(value.toFixed(6)));
}

interface SafariCaptureSize {
  readonly height: number;
  readonly width: number;
}

function replaceInOrder(source: string, replacements: readonly (readonly [string, string])[], start = 0) {
  let result = source.slice(0, start);
  for (const [original, replacement] of replacements) {
    const index = source.indexOf(original, start);
    if (index < 0) return null;
    result += source.slice(start, index) + replacement;
    start = index + original.length;
  }
  return result + source.slice(start);
}

function scaleSafariSvg(
  svg: string,
  dataURL: string,
  options: SnapdomOptions,
): { dataURL: string; size: SafariCaptureSize; svg: string } | null {
  const separator = dataURL.indexOf(',');
  if (separator < 0 || /(?:^|;)base64(?:;|$)/i.test(dataURL.slice(0, separator))) return null;
  const rootMatch = /<svg\b[^>]*>/.exec(svg);
  const foreignObjectMatch = /<foreignObject\b[^>]*>/.exec(svg);
  const wrapperMatch = /<div\b[^>]*\bxmlns="http:\/\/www\.w3\.org\/1999\/xhtml"[^>]*>/.exec(svg);
  if (rootMatch === null || foreignObjectMatch === null || wrapperMatch === null) return null;
  const sourceWidth = Number(svgAttribute(rootMatch[0], 'width'));
  const sourceHeight = Number(svgAttribute(rootMatch[0], 'height'));
  if (!(sourceWidth > 0) || !(sourceHeight > 0)) return null;

  const requestedWidth = typeof options.width === 'number' ? options.width : Number.NaN;
  const requestedHeight = typeof options.height === 'number' ? options.height : Number.NaN;
  const hasWidth = Number.isFinite(requestedWidth);
  const hasHeight = Number.isFinite(requestedHeight);
  let logicalWidth = sourceWidth;
  let logicalHeight = sourceHeight;
  if (hasWidth && hasHeight) {
    logicalWidth = Math.max(1, requestedWidth);
    logicalHeight = Math.max(1, requestedHeight);
  } else if (hasWidth) {
    logicalWidth = Math.max(1, requestedWidth);
    logicalHeight = sourceHeight * (logicalWidth / sourceWidth);
  } else if (hasHeight) {
    logicalHeight = Math.max(1, requestedHeight);
    logicalWidth = sourceWidth * (logicalHeight / sourceHeight);
  }
  const scale = Number(options.scale ?? 1);
  const dpr = Number(options.dpr ?? 1);
  logicalWidth *= scale;
  logicalHeight *= scale;
  const outputWidth = logicalWidth * dpr;
  const outputHeight = logicalHeight * dpr;
  if (!(outputWidth > 0) || !(outputHeight > 0)) return null;
  const scaleX = outputWidth / sourceWidth;
  const scaleY = outputHeight / sourceHeight;

  let root = setSvgAttribute(rootMatch[0], 'width', svgNumber(outputWidth));
  root = setSvgAttribute(root, 'height', svgNumber(outputHeight));
  const viewBox = svgAttribute(root, 'viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (viewBox?.length === 4 && viewBox.every(Number.isFinite)) {
    root = setSvgAttribute(
      root,
      'viewBox',
      [viewBox[0]! * scaleX, viewBox[1]! * scaleY, viewBox[2]! * scaleX, viewBox[3]! * scaleY].map(svgNumber).join(' '),
    );
  }

  let foreignObject = foreignObjectMatch[0];
  for (const [name, factor] of [
    ['x', scaleX],
    ['width', scaleX],
    ['y', scaleY],
    ['height', scaleY],
  ] as const) {
    const value = Number(svgAttribute(foreignObject, name));
    if (Number.isFinite(value)) foreignObject = setSvgAttribute(foreignObject, name, svgNumber(value * factor));
  }
  const transform = `transform:scale(${svgNumber(scaleX)},${svgNumber(scaleY)});transform-origin:0 0`;
  const style = svgAttribute(wrapperMatch[0], 'style');
  const wrapper =
    style === undefined
      ? wrapperMatch[0].replace(/>$/, ` style="${transform}">`)
      : setSvgAttribute(wrapperMatch[0], 'style', `${style};${transform}`);
  const replacements = [
    [rootMatch[0], root],
    [foreignObjectMatch[0], foreignObject],
    [wrapperMatch[0], wrapper],
  ] as const;
  const scaledSvg = replaceInOrder(svg, replacements);
  if (scaledSvg === null) return null;
  // SnapDOM has already encoded the complete SVG, which can include megabytes of embedded fonts.
  // Patch only the three changed tags and reserve a full re-encode for non-canonical data URLs.
  const scaledDataURL = replaceInOrder(
    dataURL,
    replacements.map(([original, replacement]) => [encodeURIComponent(original), encodeURIComponent(replacement)]),
    separator + 1,
  );
  return {
    dataURL: scaledDataURL ?? `${dataURL.slice(0, separator + 1)}${encodeURIComponent(scaledSvg)}`,
    size: { height: logicalHeight, width: logicalWidth },
    svg: scaledSvg,
  };
}

function createSafariDensityPlugin(options: SnapdomOptions, onScale: (size: SafariCaptureSize) => void): SnapdomPlugin {
  return {
    name: 'vanilla-disintegrate:safari-density',
    afterRender: (context: CaptureContext) => {
      if (context.svgString === undefined || context.dataURL === undefined) return;
      const scaled = scaleSafariSvg(context.svgString, context.dataURL, options);
      if (scaled === null) return;
      context.svgString = scaled.svg;
      context.dataURL = scaled.dataURL;
      onScale(scaled.size);
    },
  };
}

/** Creates a SnapDOM `toCanvas()` adapter with the library's capture defaults. */
export function createSnapdomCapture({ maxCapturePixels, ...options }: SnapdomCaptureOptions = {}): SnapshotCapture {
  const customFilter = options.filter;
  return async (element, context) => {
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
    const operationPlugins =
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

    const captureOptions: SnapdomOptions = {
      ...DEFAULT_CAPTURE_OPTIONS,
      dpr: resolveCaptureDpr(),
      ...options,
      ...defaultClip,
      filter: (node) => {
        const isReadyImage = !(node instanceof HTMLImageElement) || (node.complete && node.naturalWidth > 0);
        return isReadyImage && (customFilter?.(node) ?? true);
      },
    };
    budgetCaptureDensity(captureOptions, rect, maxCapturePixels);
    const outputDensity = Number(captureOptions.dpr ?? 1) * Number(captureOptions.scale ?? 1);
    if (!usesWebKitSvgRasterizer() || !(outputDensity > 1)) {
      return snapdom.toCanvas(element, {
        ...captureOptions,
        ...(operationPlugins === undefined ? {} : { plugins: operationPlugins }),
      });
    }

    // Safari rasterizes foreignObject at the SVG's logical size before toCanvas() applies DPR,
    // so increasing the canvas alone only enlarges a soft image. Scale the serialized XHTML
    // before Image decoding, then export it 1:1 into the already high-density canvas.
    const scaledCapture: { size: SafariCaptureSize | null } = { size: null };
    const densityPlugin = createSafariDensityPlugin(captureOptions, (size) => {
      scaledCapture.size = size;
    });
    const result = await snapdom(element, {
      ...captureOptions,
      plugins: [...(operationPlugins ?? []), densityPlugin],
    });
    if (scaledCapture.size === null) return result.toCanvas();
    const exportOptions = {
      dpr: 1,
      height: undefined,
      scale: 1,
      width: undefined,
    } as unknown as CanvasExportOptions;
    const canvas = await result.toCanvas(exportOptions);
    canvas.style.width = `${scaledCapture.size.width}px`;
    canvas.style.height = `${scaledCapture.size.height}px`;
    return canvas;
  };
}

export type { SnapdomOptions } from '@zumer/snapdom';
