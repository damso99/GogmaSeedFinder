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
  let allowOneRetry = false;

  return {
    shouldScan(frame) {
      if (!frame?.length) return true;
      // The previously saved result should not be OCR'd or entered again
      // merely because recognition fluctuates between scans.
      if (appliedView && frameDifference(appliedView, frame).same && !allowOneRetry) return false;
      if (!lastView || !frameDifference(lastView, frame).same) {
        lastView = frame.slice();
        scansOfView = 0;
      }
      if (scansOfView >= maxScansPerView && !allowOneRetry) return false;
      scansOfView++;
      allowOneRetry = false;
      return true;
    },
    // Require meaningful optical change before another DIFFERENT OCR value
    // can create a row. Small capture jitter must not advance the counter.
    canAdvance(frame) {
      if (!appliedView || !frame?.length) return true;
      const difference = frameDifference(appliedView, frame);
      return difference.changedRatio >= 0.015 && difference.meanDifference >= 2.6;
    },
    applied(frame) {
      appliedView = frame?.slice() ?? null;
      allowOneRetry = false;
    },
    retry() {
      // Explicit re-read keeps the last applied image so the same roll still
      // cannot be inserted twice, even after OCR preprocessing changes.
      lastView = null;
      scansOfView = 0;
      allowOneRetry = true;
    },
    reset() {
      lastView = null;
      scansOfView = 0;
      appliedView = null;
      allowOneRetry = false;
    },
  };
}
