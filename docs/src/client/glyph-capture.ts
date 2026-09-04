import type { SnapshotCapture } from '../../../src/types';

interface GlyphSurface {
  readonly height: number;
  readonly left: number;
  readonly ratio: number;
  readonly top: number;
  readonly width: number;
}

export interface ResidentGlyph {
  readonly canvas: HTMLCanvasElement;
  /** Redraws the resident bitmap, or returns false while it is detached for animation. */
  redraw(): boolean;
  dispose(): void;
}

function abortError() {
  return new DOMException('Glyph capture was cancelled.', 'AbortError');
}

function displayRatio() {
  const ratio = window.devicePixelRatio || 1;
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
}

function surfaceFor(bounds: DOMRectReadOnly): GlyphSurface {
  const ratio = displayRatio();
  const left = Math.floor(bounds.left * ratio) / ratio;
  const top = Math.floor(bounds.top * ratio) / ratio;
  const right = Math.ceil(bounds.right * ratio) / ratio;
  const bottom = Math.ceil(bounds.bottom * ratio) / ratio;
  return {
    height: Math.max(1, Math.round((bottom - top) * ratio)),
    left,
    ratio,
    top,
    width: Math.max(1, Math.round((right - left) * ratio)),
  };
}

function textNode(element: HTMLElement) {
  const node = [...element.childNodes].find((candidate) => candidate.nodeType === Node.TEXT_NODE);
  if (node === undefined) throw new Error('The resident glyph needs a text node.');
  return node;
}

function configureText(context: CanvasRenderingContext2D, style: CSSStyleDeclaration) {
  if (!('letterSpacing' in context) && Number.parseFloat(style.letterSpacing) !== 0) {
    throw new Error('This browser cannot reproduce the heading letter spacing on Canvas.');
  }
  const fallbackFont = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  context.font = style.font.trim() || fallbackFont;
  context.fillStyle = style.color;
  context.direction = style.direction as CanvasDirection;
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';

  if ('fontKerning' in context) context.fontKerning = style.fontKerning as CanvasFontKerning;
  if ('fontStretch' in context) context.fontStretch = style.getPropertyValue('font-stretch') as CanvasFontStretch;
  if ('fontVariantCaps' in context) context.fontVariantCaps = style.fontVariantCaps as CanvasFontVariantCaps;
  if ('letterSpacing' in context) context.letterSpacing = style.letterSpacing;
  if ('wordSpacing' in context) context.wordSpacing = style.wordSpacing;
  if ('textRendering' in context) context.textRendering = style.textRendering as CanvasTextRendering;
}

function signature(text: string, bounds: DOMRectReadOnly, surface: GlyphSurface, style: CSSStyleDeclaration) {
  return [
    text,
    bounds.left,
    bounds.top,
    bounds.width,
    bounds.height,
    surface.ratio,
    style.color,
    style.direction,
    style.font,
    style.fontStyle,
    style.fontVariant,
    style.fontWeight,
    style.getPropertyValue('font-stretch'),
    style.fontSize,
    style.fontFamily,
    style.fontKerning,
    style.fontVariantCaps,
    style.letterSpacing,
    style.wordSpacing,
    style.textRendering,
  ].join('|');
}

/** Replaces a text run's paint with a physical-pixel-aligned resident canvas. */
export function mountResidentGlyph(element: HTMLElement): ResidentGlyph {
  const glyph = textNode(element);
  const originalColor = element.style.getPropertyValue('color');
  const originalColorPriority = element.style.getPropertyPriority('color');
  const canvas = document.createElement('canvas');
  canvas.dataset.residentGlyph = '';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    display: 'block',
    pointerEvents: 'none',
    position: 'absolute',
  });
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('The resident glyph could not acquire a 2D context.');

  let renderedSignature = '';
  let disposed = false;

  const revealSource = () => {
    if (originalColor === '') element.style.removeProperty('color');
    else element.style.setProperty('color', originalColor, originalColorPriority);
  };
  const concealSource = () => element.style.setProperty('color', 'transparent', 'important');

  const redraw = () => {
    if (
      disposed ||
      !element.isConnected ||
      (renderedSignature !== '' && !canvas.isConnected) ||
      (canvas.isConnected && canvas.parentElement !== element)
    )
      return false;
    revealSource();
    try {
      const text = glyph.textContent ?? '';
      const bounds = element.getBoundingClientRect();
      const surface = surfaceFor(bounds);
      const style = window.getComputedStyle(element);
      const nextSignature = signature(text, bounds, surface, style);
      if (nextSignature === renderedSignature) return true;

      const width = surface.width;
      const height = surface.height;
      canvas.width = width;
      canvas.height = height;
      Object.assign(canvas.style, {
        height: `${height / surface.ratio}px`,
        left: `${surface.left - bounds.left}px`,
        top: `${surface.top - bounds.top}px`,
        width: `${width / surface.ratio}px`,
      });

      context.setTransform(surface.ratio, 0, 0, surface.ratio, 0, 0);
      configureText(context, style);

      const range = document.createRange();
      range.selectNode(glyph);
      const ink = range.getBoundingClientRect();
      range.detach();

      const metrics = context.measureText(text);
      const ascent = metrics.fontBoundingBoxAscent;
      const descent = metrics.fontBoundingBoxDescent;
      const baseline =
        Number.isFinite(ascent) && Number.isFinite(descent) && ascent + descent > 0
          ? (ink.height * ascent) / (ascent + descent)
          : ink.height * 0.8;
      context.fillText(text, ink.left - surface.left, ink.top - surface.top + baseline);
      renderedSignature = nextSignature;
      if (!canvas.isConnected) element.append(canvas);
      return true;
    } finally {
      if (canvas.isConnected) concealSource();
      else revealSource();
    }
  };

  if (!redraw()) throw new Error('The resident glyph must be mounted on a connected element.');

  return {
    canvas,
    redraw,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      canvas.remove();
      canvas.width = 0;
      canvas.height = 0;
      revealSource();
    },
  };
}

/** Copies a resident canvas without rerasterizing its text. */
export function createResidentGlyphCapture(): SnapshotCapture {
  return (element, { signal }) => {
    if (signal.aborted) throw abortError();
    if (!(element instanceof HTMLCanvasElement) || element.dataset.residentGlyph === undefined) {
      throw new TypeError('Resident glyph capture requires its mounted canvas.');
    }
    const snapshot = document.createElement('canvas');
    snapshot.width = element.width;
    snapshot.height = element.height;
    const context = snapshot.getContext('2d');
    if (context === null) {
      snapshot.width = 0;
      snapshot.height = 0;
      throw new Error('The resident glyph snapshot could not acquire a 2D context.');
    }
    context.globalCompositeOperation = 'copy';
    context.drawImage(element, 0, 0);
    if (signal.aborted) {
      snapshot.width = 0;
      snapshot.height = 0;
      throw abortError();
    }
    return snapshot;
  };
}
