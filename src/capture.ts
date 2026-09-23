import {
  snapdom,
  type CaptureContext,
  type CanvasCrop,
  type SnapdomOptions as NativeSnapdomOptions,
  type SnapdomPlugin,
} from '@zumer/snapdom';

import type { SnapshotCapture } from './types';
import { captureCrop, captureSize } from './capture-geometry';

export type { SnapdomOptions } from '@zumer/snapdom';

/** Native SnapDOM options with an independently owned output canvas and a raster pixel budget. */
export type SnapdomCaptureOptions = Omit<NativeSnapdomOptions, 'canvas' | 'engine'> & {
  /** Reduces requested density for large captures. Defaults to 8,000,000 pixels; `false` disables the budget. */
  readonly maxCapturePixels?: number | false;
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

function transformCaptureSvg(
  svg: string,
  dataURL: string,
  crop: CanvasCrop | undefined,
  scaleX: number,
  scaleY: number,
): { dataURL: string; svg: string } | null {
  const separator = dataURL.indexOf(',');
  if (separator < 0 || /(?:^|;)base64(?:;|$)/i.test(dataURL.slice(0, separator))) return null;
  const rootMatch = /<svg\b[^>]*>/.exec(svg);
  const foreignObjectMatch = /<foreignObject\b[^>]*>/.exec(svg);
  const wrapperMatch = /<div\b[^>]*\bxmlns="http:\/\/www\.w3\.org\/1999\/xhtml"[^>]*>/.exec(svg);
  if (rootMatch === null || foreignObjectMatch === null || wrapperMatch === null) return null;
  if (svgAttribute(rootMatch[0], 'data-disintegrate-density') !== undefined) return null;
  const sourceWidth = Number(svgAttribute(rootMatch[0], 'width'));
  const sourceHeight = Number(svgAttribute(rootMatch[0], 'height'));
  if (!(sourceWidth > 0) || !(sourceHeight > 0)) return null;
  const outputWidth = (crop?.width ?? sourceWidth) * scaleX;
  const outputHeight = (crop?.height ?? sourceHeight) * scaleY;

  let root = setSvgAttribute(rootMatch[0], 'width', svgNumber(outputWidth));
  root = setSvgAttribute(root, 'height', svgNumber(outputHeight));
  root = setSvgAttribute(root, 'data-disintegrate-density', `${svgNumber(scaleX)} ${svgNumber(scaleY)}`);
  const viewBox = svgAttribute(root, 'viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (viewBox?.length === 4 && viewBox.every(Number.isFinite)) {
    root = setSvgAttribute(
      root,
      'viewBox',
      (crop
        ? [0, 0, outputWidth, outputHeight]
        : [viewBox[0]! * scaleX, viewBox[1]! * scaleY, viewBox[2]! * scaleX, viewBox[3]! * scaleY]
      )
        .map(svgNumber)
        .join(' '),
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
    if (Number.isFinite(value)) {
      const offset = name === 'x' ? (crop?.x ?? 0) : name === 'y' ? (crop?.y ?? 0) : 0;
      foreignObject = setSvgAttribute(foreignObject, name, svgNumber((value - offset) * factor));
    }
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
    svg: scaledSvg,
  };
}

function createGeometryPlugin(options: SnapdomCaptureOptions, maximum: number | false | undefined): SnapdomPlugin {
  return {
    name: 'vanilla-disintegrate:capture-geometry',
    pure: true,
    beforeRender: ({ clone, nodeMap }) => {
      if (!clone || !(nodeMap instanceof Map)) return;
      // A table's computed height includes its caption, but CSS height sizes the
      // grid alone. Keep the captured row heights and let them size the table.
      const tables = [...clone.querySelectorAll<HTMLTableElement>('table')];
      if (clone.localName === 'table') tables.push(clone as HTMLTableElement);
      for (const table of tables) {
        if (table.caption) table.style.height = 'auto';
      }
      // SnapDOM materializes pseudo-elements as spans. Its property pruning can omit
      // their default transform origin while the snapshot reset sets it to 0 0.
      // Read the original pseudo, including explicit/custom origins, before rasterizing.
      for (const pseudo of clone.querySelectorAll<HTMLElement>('[data-snapdom-pseudo]')) {
        const kind = pseudo.dataset.snapdomPseudo;
        if (kind !== '::before' && kind !== '::after') continue;
        const source = (nodeMap as ReadonlyMap<Element | null, Element>).get(pseudo.parentElement);
        if (!source) continue;
        const style = source.ownerDocument.defaultView?.getComputedStyle(source, kind);
        if (style && [style.transform, style.rotate, style.scale].some((value) => value && value !== 'none')) {
          pseudo.style.transformOrigin = style.transformOrigin;
        }
      }
    },
    afterRender: (context: CaptureContext) => {
      if (context.svgString == null || context.dataURL === undefined || context.meta === undefined) return;
      const crop = captureCrop(context.element as HTMLElement, context.meta, options);
      const bounds = crop ?? { width: context.meta.vbW, height: context.meta.vbH };
      const size = captureSize(bounds, context, maximum);
      const requestedX = (size.width * size.dpr) / bounds.width;
      const requestedY = (size.height * size.dpr) / bounds.height;
      const scale = usesWebKitSvgRasterizer() && (requestedX > 1 || requestedY > 1);
      if (!crop && !scale) return;
      // Moving foreignObject rather than its viewBox also keeps WebKit CSS filters aligned.
      // Safari additionally needs the XHTML rasterized at physical density for sharp webfonts.
      const scaled = transformCaptureSvg(
        context.svgString,
        context.dataURL,
        crop,
        scale ? requestedX : 1,
        scale ? requestedY : 1,
      );
      if (scaled === null) return;
      context.svgString = scaled.svg;
      context.dataURL = scaled.dataURL;
    },
  };
}

/** Reads only the SVG header, without decoding embedded fonts and images. */
function captureDensity(dataURL: string): readonly number[] | null {
  if (!dataURL.startsWith('data:image/svg+xml') || dataURL.slice(0, dataURL.indexOf(',')).includes(';base64'))
    return null;
  const end = dataURL.indexOf('%3E');
  if (end < 0) return null;
  const header = decodeURIComponent(dataURL.slice(dataURL.indexOf(',') + 1, end + 3));
  const density = svgAttribute(header, 'data-disintegrate-density')?.split(' ').map(Number);
  return density?.length === 2 && density.every((value) => Number.isFinite(value) && value > 0) ? density : null;
}

/** Creates an adapter with layout reconciliation and independently owned canvases. */
export function createSnapdomCapture({ maxCapturePixels, ...options }: SnapdomCaptureOptions = {}): SnapshotCapture {
  const geometryPlugin = createGeometryPlugin(options, maxCapturePixels);
  return async (element, context) => {
    if (context.signal.aborted) throw new DOMException('Snapshot capture was aborted.', 'AbortError');
    const restoreRootOpacity = context.restoreRootOpacity;
    const plugins = [...(options.plugins ?? [])];
    if (context.operation === 'restore' && restoreRootOpacity !== undefined) {
      plugins.push({
        name: 'vanilla-disintegrate:restore-root-opacity',
        beforeRender: ({ clone }) => {
          clone?.style.setProperty('opacity', restoreRootOpacity, 'important');
        },
      });
    }
    plugins.push(geometryPlugin);
    const captureOptions: NativeSnapdomOptions = {
      dpr: resolveCaptureDpr(),
      reconcile: true,
      ...options,
      engine: 'svg',
      ...(context.invalidate ? { invalidate: true } : {}),
      ...(plugins.length > 0 ? { plugins } : {}),
    };
    // Preserve canvas ownership even when options come from untyped JavaScript.
    delete captureOptions.canvas;
    const bounds = element.getBoundingClientRect();
    if (bounds.width > 0 && bounds.height > 0) {
      captureOptions.dpr = captureSize(bounds, captureOptions, maxCapturePixels).dpr;
    }
    const result = await snapdom(element, captureOptions);
    const crop = captureCrop(element, result.meta, options);
    const size = captureSize(
      crop ?? { width: result.meta.vbW, height: result.meta.vbH },
      captureOptions,
      maxCapturePixels,
    );
    const density = captureDensity(result.toRaw());
    const canvas = await result.toCanvas({
      width: size.width * (density ? size.dpr : 1),
      height: size.height * (density ? size.dpr : 1),
      dpr: density ? 1 : size.dpr,
      scale: 1,
      ...(!density && crop ? { crop } : {}),
    });
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    return canvas;
  };
}
