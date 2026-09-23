import type { CanvasCrop, CaptureMeta, SnapdomOptions } from '@zumer/snapdom';

/** Selects the element's box inside SnapDOM's padded, transformed SVG viewport. */
export function captureCrop(element: HTMLElement, meta: CaptureMeta, options: SnapdomOptions): CanvasCrop | undefined {
  if (options.clip !== undefined || options.outerShadows || options.outerTransforms === false) return;
  const style = getComputedStyle(element);
  const width = meta.w0;
  const height = meta.h0;
  let x = 0;
  let y = 0;
  let cropWidth = width;
  let cropHeight = height;
  if (
    (style.transform && style.transform !== 'none') ||
    (style.rotate && style.rotate !== 'none') ||
    (style.scale && style.scale !== 'none')
  ) {
    const angle = style.rotate?.split(/\s+/).pop() ?? '0';
    const degrees =
      parseFloat(angle) *
      (angle.endsWith('grad') ? 0.9 : angle.endsWith('rad') ? 180 / Math.PI : angle.endsWith('turn') ? 360 : 1);
    const scales = style.scale?.split(/\s+/).map((value) => parseFloat(value) / (value.endsWith('%') ? 100 : 1));
    const matrix = new DOMMatrix()
      .rotate(Number.isFinite(degrees) ? degrees : 0)
      .scale(
        Number.isFinite(scales?.[0]) ? scales[0]! : 1,
        Number.isFinite(scales?.[1]) ? scales[1]! : Number.isFinite(scales?.[0]) ? scales[0]! : 1,
      )
      .multiply(new DOMMatrix(style.transform === 'none' ? undefined : style.transform));
    // SnapDOM normalizes root translation. Rotation/scale are relative to the root's origin.
    const [originX = 0, originY = 0] = style.transformOrigin.split(/\s+/).map(Number.parseFloat);
    const points = [
      [0, 0],
      [width, 0],
      [0, height],
      [width, height],
    ].map(([left, top]) => ({
      x: matrix.a * (left! - originX) + matrix.c * (top! - originY) + originX,
      y: matrix.b * (left! - originX) + matrix.d * (top! - originY) + originY,
    }));
    x = Math.min(...points.map((point) => point.x));
    y = Math.min(...points.map((point) => point.y));
    cropWidth = Math.max(...points.map((point) => point.x)) - x;
    cropHeight = Math.max(...points.map((point) => point.y)) - y;
  }
  return { x: meta.contentX + x, y: meta.contentY + y, width: cropWidth, height: cropHeight };
}

/** Output sizing follows SnapDOM: explicit dimensions take precedence over scale. */
export function captureSize(
  bounds: Pick<DOMRectReadOnly, 'width' | 'height'>,
  options: Pick<SnapdomOptions, 'width' | 'height' | 'scale' | 'dpr'>,
  maximum: number | false | undefined,
) {
  const hasWidth = Number.isFinite(options.width);
  const hasHeight = Number.isFinite(options.height);
  const scale = hasWidth || hasHeight ? 1 : Number(options.scale ?? 1);
  const width = hasWidth
    ? Math.max(1, options.width!)
    : hasHeight
      ? (bounds.width * Math.max(1, options.height!)) / bounds.height
      : bounds.width * scale;
  const height = hasHeight
    ? Math.max(1, options.height!)
    : hasWidth
      ? (bounds.height * width) / bounds.width
      : bounds.height * scale;
  const requestedDpr = Number(options.dpr ?? 1);
  const budget =
    maximum === false
      ? Infinity
      : typeof maximum === 'number' && Number.isFinite(maximum)
        ? Math.max(1, maximum)
        : 8_000_000;
  const dpr = Math.min(requestedDpr, Math.sqrt(budget / (width * height)));
  return { width, height, dpr };
}
