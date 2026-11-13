// Canvas preprocessing for small Korean text in Monster Hunter Wilds.
// The browser cannot recover details never present in the captured pixels,
// but enlarging with high-quality interpolation can improve OCR segmentation.

const DEFAULT_MAX_PIXELS = 2_400_000;
const DEFAULT_PADDING = 18;

export function ocrRenderSize(width, height, {
  preferredScale = 3,
  maxPixels = DEFAULT_MAX_PIXELS,
  maxWidth = 2800,
  maxHeight = 1800,
  padding = DEFAULT_PADDING,
} = {}) {
  if (!(width > 0 && height > 0)) return null;
  const scale = Math.min(
    preferredScale,
    maxWidth / width,
    maxHeight / height,
    Math.sqrt(maxPixels / (width * height)),
  );
  const renderedWidth = Math.max(1, Math.round(width * scale));
  const renderedHeight = Math.max(1, Math.round(height * scale));
  return {
    scale,
    padding,
    renderedWidth,
    renderedHeight,
    width: renderedWidth + padding * 2,
    height: renderedHeight + padding * 2,
  };
}

function clamp(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/**
 * Returns the SAME ImageData instance after enhancement.
 * Input image excludes canvas border so that percentile statistics are not
 * skewed by the added white padding.
 *
 * A gentle contrast stretch and unsharp mask retain anti-aliased Korean
 * strokes better than the previous hard 0/255 thresholding.
 */
export function enhanceOcrImageData(image) {
  const { width, height, data } = image;
  const length = width * height;
  if (!length || !data || data.length < length * 4) return image;

  const gray = new Uint8Array(length);
  const histogram = new Uint32Array(256);
  for (let i = 0; i < length; i++) {
    const p = i * 4;
    const value = clamp(data[p] * 0.2126 + data[p + 1] * 0.7152 + data[p + 2] * 0.0722);
    gray[i] = value;
    histogram[value]++;
  }

  function percentile(percentage) {
    const target = Math.max(1, Math.floor(length * percentage));
    let count = 0;
    for (let i = 0; i < 256; i++) {
      count += histogram[i];
      if (count >= target) return i;
    }
    return 255;
  }

  const low = percentile(0.03);
  const high = percentile(0.97);
  const median = percentile(0.5);
  const invert = median < 128; // white lettering against a dark game HUD
  // Avoid magnifying noise on low-contrast screens.
  const range = high - low >= 35 ? high - low : 255;
  const offset = high - low >= 35 ? low : 0;

  const normalized = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    const value = clamp((gray[i] - offset) * 255 / range);
    normalized[i] = invert ? 255 - value : value;
  }

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const i = row + x;
      const center = normalized[i];
      let value = center;
      // Small unsharp mask: strong enough to clarify II/III/EX glyph edges
      // without erasing thin Hangul strokes.
      if (x > 0 && x < width - 1 && y > 0 && y < height - 1) {
        const neighboring = (normalized[i - 1] + normalized[i + 1]
          + normalized[i - width] + normalized[i + width]) / 4;
        value = center + 0.38 * (center - neighboring);
      }
      const p = i * 4;
      const output = clamp(value);
      data[p] = output;
      data[p + 1] = output;
      data[p + 2] = output;
      data[p + 3] = 255;
    }
  }
  return image;
}

export function bestOcrCandidate(left, right) {
  const score = ({ result, confidence = 0 }) =>
    (result.complete ? 1000 : 0) + result.recognized * 120
    + Math.min(100, Math.max(0, Number(confidence) || 0));
  return score(right) > score(left) ? right : left;
}
