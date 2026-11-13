// Compare pixels in the user's selected game-result region, independently of
// noisy OCR text. A small brightness jitter is not a new restoration roll.
export function frameDifference(previous, current) {
  if (!previous || !current || !previous.length || previous.length !== current.length) {
    return { changedRatio: 1, meanDifference: 255, same: false };
  }
  let total = 0;
  let changed = 0;
  for (let i = 0; i < current.length; i++) {
    const diff = Math.abs(previous[i] - current[i]);
    total += diff;
    if (diff >= 20) changed++;
  }
  const changedRatio = changed / current.length;
  const meanDifference = total / current.length;
  // Requiring both criteria suppresses capture flicker and video compression
  // noise while still detecting a changed line in a five-line result.
  return {
    changedRatio,
    meanDifference,
    same: changedRatio < 0.008 && meanDifference < 2.5,
  };
}

export function createFrameThrottle({ maxScansPerView = 2 } = {}) {
  let lastView = null;
  let scansOfView = 0;
  let appliedView = null;

  return {
    shouldScan(frame) {
      if (!frame?.length) return true;
      // The previously saved result should not be OCR'd or entered again
      // merely because recognition fluctuates between scans.
      if (appliedView && frameDifference(appliedView, frame).same) return false;
      if (!lastView || !frameDifference(lastView, frame).same) {
        lastView = frame.slice();
        scansOfView = 0;
      }
      if (scansOfView >= maxScansPerView) return false;
      scansOfView++;
      return true;
    },
    applied(frame) {
      appliedView = frame?.slice() ?? null;
    },
    reset() {
      lastView = null;
      scansOfView = 0;
      appliedView = null;
    },
  };
}
