// Approximate UI/text edge mask, invariant to global brightness changes.
// The original frame tracker compared raw luminance: HDR/ambient light shifts
// could advance a static result or exhaust scans before the roll settled.
export function buildHudFingerprint(image) {
  const { data, width, height } = image ?? {};
  if (!(width > 2 && height > 2) || !data || data.length < width * height * 4) return null;
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    const p = i * 4;
    gray[i] = Math.round(data[p] * 0.2126 + data[p + 1] * 0.7152 + data[p + 2] * 0.0722);
  }
  const mask = new Uint8Array(gray.length);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const horizontal = Math.abs(gray[i - 1] - gray[i + 1]);
      const vertical = Math.abs(gray[i - width] - gray[i + width]);
      mask[i] = horizontal + vertical >= 35 ? 255 : 0;
    }
  }
  return mask;
}

export function stabilizeTransition({ stableFrames = 2 } = {}) {
  let previous = null;
  let count = 0;
  return {
    observe(signature, same) {
      if (!signature) { previous = null; count = 0; return false; }
      if (previous && same(previous, signature)) count++;
      else { previous = signature.slice(); count = 1; }
      if (count < stableFrames) return false;
      previous = signature.slice();
      return true;
    },
    reset() { previous = null; count = 0; },
  };
}
