// Calibrated from a 1920x1080 Korean Monster Hunter Wilds recording.
// The right panel has five "?????" placeholders before each reroll; during
// a new bonus reveal, green text and green numeric values extend much further
// to the right. Sample this *value column* instead of the moving background.
// Regions are normalized to the captured video. The game must fill a 16:9
// capture with the same two-detail-panel layout for this preset to apply.
export const WILDS_GOGMA_ROI = Object.freeze({
  x: 1550 / 1920, y: 650 / 1080, w: 340 / 1920, h: 164 / 1080,
});

export const WILDS_GOGMA_SIGNAL = Object.freeze({
  x: 1740 / 1920, y: 658 / 1080, w: 140 / 1920, h: 150 / 1080,
});

export function supportsWildsGogmaProfile(width, height) {
  if (!(width >= 960 && height >= 540)) return false;
  return Math.abs(width / height - 16 / 9) < 0.045;
}

// Equivalent to the tested OpenCV H≈68°..188°, S>25%, V>25% filter.
// Unlike grayscale or visual differences, placeholder '?' rows contain
// essentially no such green pixels in the right-side value column.
export function measureWildsResultSignal(imageData) {
  const pixels = imageData?.data;
  if (!pixels || pixels.length < 4) return 0;
  let green = 0;
  const count = Math.floor(pixels.length / 4);
  for (let p = 0; p < count * 4; p += 4) {
    const r = pixels[p] / 255, g = pixels[p+1] / 255, b = pixels[p+2] / 255;
    const high = Math.max(r,g,b), low = Math.min(r,g,b), diff = high-low;
    if (high <= 0.255 || !diff || diff / high <= 0.255) continue;
    let hue;
    if (high === r) hue = 60 * (((g-b)/diff + 6) % 6);
    else if (high === g) hue = 60 * ((b-r)/diff + 2);
    else hue = 60 * ((r-g)/diff + 4);
    if (hue >= 68 && hue <= 188) green++;
  }
  return green / count;
}

// Dedicated preprocessing for the filmed right-side bonus panel: remove
// blue row patterns and yellow/green translucent game scenery, keeping only
// the saturated green result labels and numeric values. Highlighted white
// text is handled by the original/enhanced image fallback.
export function isolateWildsGreenText(imageData) {
  const pixels = imageData?.data;
  if (!pixels?.length) return imageData;
  for(let p = 0; p < pixels.length; p += 4) {
    const r = pixels[p] / 255, g = pixels[p+1] / 255, b = pixels[p+2] / 255;
    const high = Math.max(r,g,b), low = Math.min(r,g,b), diff = high-low;
    let greenText = false;
    if(high >= 0.20 && diff > 0 && diff/high >= 0.20) {
      let hue;
      if(high === r) hue = 60 * (((g-b)/diff + 6) % 6);
      else if(high === g) hue = 60 * ((b-r)/diff + 2);
      else hue = 60 * ((r-g)/diff + 4);
      greenText = hue >= 64 && hue <= 196;
    }
    const output = greenText ? 0 : 255;
    pixels[p] = pixels[p+1] = pixels[p+2] = output;
    pixels[p+3] = 255;
  }
  return imageData;
}

// Mix green and red reinforcement labels into the SAME black-on-white text
// image. The real game video shows both colors in one five-row result. The
// green-only pass silently erased some red bonus rows.
export function isolateWildsColoredText(imageData) {
  const pixels = imageData?.data;
  if (!pixels?.length) return imageData;
  for (let p = 0; p < pixels.length; p += 4) {
    const r = pixels[p] / 255, g = pixels[p+1] / 255, b = pixels[p+2] / 255;
    const high = Math.max(r,g,b), low = Math.min(r,g,b), diff = high-low;
    let ink = false;
    if (high >= 0.20 && diff > 0 && diff/high >= 0.20) {
      let hue;
      if (high === r) hue = 60 * (((g-b)/diff + 6) % 6);
      else if (high === g) hue = 60 * ((b-r)/diff + 2);
      else hue = 60 * ((r-g)/diff + 4);
      ink = (hue >= 64 && hue <= 196) || hue <= 28 || hue >= 338;
    }
    pixels[p] = pixels[p+1] = pixels[p+2] = ink ? 0 : 255;
    pixels[p+3] = 255;
  }
  return imageData;
}

// No OCR is run on transient frames. The UI copies a high-resolution bonus
// image immediately, then can OCR it later even after the result disappears.
export function createWildsResultTracker({
  revealThreshold = 0.018,
  hiddenThreshold = 0.007,
  revealPasses = 3,
  hiddenPasses = 3,
  captureStart = 2,
  captureEvery = 2,
  maxCaptures = 4,
} = {}) {
  let phase = "hidden";
  let revealTicks = 0, hiddenTicks = 0, shownTicks = 0;
  let captures = 0, eventId = 0;
  function observe(score) {
    let newEvent = false;
    let shouldCapture = false;
    const isRevealed = Number.isFinite(score) && score >= revealThreshold;
    const isHidden = Number.isFinite(score) && score <= hiddenThreshold;
    if (isRevealed) {
      hiddenTicks = 0;
      revealTicks++;
      if (phase === "hidden" && revealTicks >= revealPasses) {
        phase = "revealed";
        eventId++;
        shownTicks = 0;
        captures = 0;
        newEvent = true;
      }
      if (phase === "revealed") {
        shownTicks++;
        if (shownTicks >= captureStart && (shownTicks - captureStart) % captureEvery === 0
          && captures < maxCaptures) {
          shouldCapture = true;
          captures++;
        }
      }
    } else if (isHidden) {
      revealTicks = 0;
      hiddenTicks++;
      if (hiddenTicks >= hiddenPasses) {
        phase = "hidden";
        shownTicks = 0;
      }
    }
    return { phase, eventId, newEvent, shouldCapture, captures };
  }
  function reset() {
    phase = "hidden";
    revealTicks = hiddenTicks = shownTicks = 0;
    captures = eventId = 0;
  }
  return { observe, reset, getState: () => ({ phase, eventId, captures }) };
}

// Prefer unclipped static result pixels to bright blue/white reveal effects.
// Used only for sorting already-captured full resolution frames.
export function wildsFrameQuality(imageData) {
  const pixels=imageData?.data;
  if (!pixels?.length) return -Infinity;
  let burned=0, sharp=0, previous=0;
  for(let i=0;i<pixels.length;i+=4) {
    const red=pixels[i],green=pixels[i+1],blue=pixels[i+2];
    const luminance=(red*54+green*183+blue*19)/256;
    if (red>235 && green>235 && blue>235) burned++;
    if(i && Math.abs(luminance-previous)>24) sharp++;
    previous=luminance;
  }
  const total=pixels.length/4;
  return sharp/total - 3*burned/total;
}
