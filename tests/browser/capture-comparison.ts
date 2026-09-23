import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

export type NativeControlRegion = { x: number; y: number; width: number; height: number; checked: boolean };

/** Compare against live DOM pixels, without platform-specific golden images. */
export function compareCapture(
  reference: Buffer,
  snapshot: Buffer,
  dpr: number,
  backdrop: readonly number[],
  controls: readonly NativeControlRegion[] = [],
) {
  const expected = PNG.sync.read(reference);
  const actual = PNG.sync.read(snapshot);
  // Firefox cannot export transparent page screenshots. Compare the snapshot
  // composited over the same contrasting backdrop as the live element.
  for (let offset = 0; offset < actual.data.length; offset += 4) {
    const alpha = actual.data[offset + 3]! / 255;
    for (let channel = 0; channel < 3; channel++) {
      actual.data[offset + channel] = Math.round(
        actual.data[offset + channel]! * alpha + backdrop[channel]! * (1 - alpha),
      );
    }
    actual.data[offset + 3] = 255;
  }
  const dimensionsMatch = expected.width === actual.width && expected.height === actual.height;
  if (!dimensionsMatch) {
    return {
      matches: false,
      dimensions: { expected: [expected.width, expected.height], actual: [actual.width, actual.height] },
      diff: null,
    };
  }
  const { width, height } = expected;
  const controlStates = controls.map((region) => {
    const contrast = (data: Buffer, inset: number) => {
      let minimum = 255;
      let maximum = 0;
      // The central half contains the tick/dot but excludes the native border.
      // SVG painters may use a monochrome native theme instead of accent-color.
      for (
        let y = Math.ceil((region.y + region.height * inset) * dpr);
        y < Math.floor((region.y + region.height * (1 - inset)) * dpr);
        y++
      ) {
        for (
          let x = Math.ceil((region.x + region.width * inset) * dpr);
          x < Math.floor((region.x + region.width * (1 - inset)) * dpr);
          x++
        ) {
          const offset = (y * width + x) * 4;
          const luminance = data[offset]! * 0.2126 + data[offset + 1]! * 0.7152 + data[offset + 2]! * 0.0722;
          minimum = Math.min(minimum, luminance);
          maximum = Math.max(maximum, luminance);
        }
      }
      return maximum - minimum;
    };
    const sourceMarked = contrast(expected.data, 0.25) > 40;
    const capturedMarked = contrast(actual.data, 0.25) > 40;
    // An absent unchecked control also has an empty center. Require its visible
    // outline as well, so masking native appearance cannot hide a missing input.
    const sourcePresent = contrast(expected.data, 0) > 40;
    const capturedPresent = contrast(actual.data, 0) > 40;
    const matches =
      sourcePresent && capturedPresent && sourceMarked === region.checked && capturedMarked === region.checked;
    if (matches) {
      for (let y = Math.round(region.y * dpr); y < Math.round((region.y + region.height) * dpr); y++) {
        const from = (y * width + Math.round(region.x * dpr)) * 4;
        const to = (y * width + Math.round((region.x + region.width) * dpr)) * 4;
        expected.data.copy(actual.data, from, from, to);
      }
    }
    return { checked: region.checked, sourceMarked, capturedMarked, sourcePresent, capturedPresent, matches };
  });
  const diff = new PNG({ width, height });
  const options = { threshold: 0.1, includeAA: false };
  pixelmatch(expected.data, actual.data, diff.data, width, height, {
    ...options,
    diffMask: true,
  });
  // Browser compositing and SVG rasterization can round a glyph or collapsed
  // border to adjacent pixels. Permit at most one CSS pixel in both directions;
  // missing content and larger layout changes still have no matching neighbor.
  const radius = Math.ceil(dpr);
  const nearby = (target: Buffer, source: Buffer, offset: number, x: number, y: number) => {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const other = (ny * width + nx) * 4;
        if ([0, 1, 2].every((channel) => Math.abs(source[offset + channel]! - target[other + channel]!) <= 24))
          return true;
      }
    }
    return false;
  };
  let changedPixels = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      if (!diff.data[offset + 3]) continue;
      if (nearby(actual.data, expected.data, offset, x, y) && nearby(expected.data, actual.data, offset, x, y))
        diff.data[offset + 3] = 0;
      else changedPixels++;
    }
  }
  // A small missing icon must not disappear in the percentage of a large card.
  // Inspect local areas too; allowances scale with physical pixel density.
  const stride = width + 1;
  const sums = new Uint32Array(stride * (height + 1));
  const window = 16 * dpr;
  let localChanges = 0;
  for (let y = 1; y <= height; y++) {
    let row = 0;
    for (let x = 1; x <= width; x++) {
      row += diff.data[((y - 1) * width + x - 1) * 4 + 3] === 255 ? 1 : 0;
      sums[y * stride + x] = sums[(y - 1) * stride + x]! + row;
      const left = Math.max(0, x - window);
      const top = Math.max(0, y - window);
      localChanges = Math.max(
        localChanges,
        sums[y * stride + x]! - sums[y * stride + left]! - sums[top * stride + x]! + sums[top * stride + left]!,
      );
    }
  }
  for (let offset = 0; offset < diff.data.length; offset += 4) {
    if (!diff.data[offset + 3]) {
      for (let channel = 0; channel < 3; channel++)
        diff.data[offset + channel] = Math.round(expected.data[offset + channel]! * 0.25 + 255 * 0.75);
    }
    diff.data[offset + 3] = 255;
  }
  const totalLimit = Math.ceil(width * height * 0.005);
  const localLimit = 20 * dpr * dpr;
  return {
    matches: changedPixels <= totalLimit && localChanges <= localLimit && controlStates.every(({ matches }) => matches),
    controlStates,
    changedPixels,
    totalLimit,
    localChanges,
    localLimit,
    diff: PNG.sync.write(diff),
  };
}
