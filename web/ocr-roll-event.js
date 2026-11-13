// Experimental optical event detector. It deliberately does NOT infer that
// a restoration happened merely because OCR text changed. Instead, it needs
// a meaningful departure from the last confirmed HUD, followed by a stable
// new visual state. This is a foundation pending real game video calibration.
function ratioChanged(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 1;
  let changed = 0;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > 32) changed++;
  }
  return changed / a.length;
}

export function createRollEventDetector({
  settleFrames = 2,
  departureFrames = 2,
  jitterRatio = 0.025,
  departureRatio = 0.12,
  strongDepartureRatio = 0.3,
} = {}) {
  let phase = "initial";
  let baseline = null;
  let previous = null;
  let stableCount = 0;
  let departureCount = 0;
  let eventId = 0;

  function observe(frame) {
    if (!frame?.length) return { phase, eventId, ready: phase === "ready", newEvent: false };
    if (phase === "locked") {
      const difference = ratioChanged(baseline, frame);
      departureCount = difference >= departureRatio ? departureCount + 1 : 0;
      if (departureCount >= departureFrames || difference >= strongDepartureRatio) {
        phase = "transition";
        previous = frame.slice();
        // A transition frame is not a stable result frame. The next two
        // frames must agree before we accept the new OCR window.
        stableCount = 0;
      }
    } else if (phase === "initial" || phase === "transition" || phase === "ready") {
      const similarity = previous ? ratioChanged(previous, frame) : 1;
      if (phase === "ready" && similarity > jitterRatio) {
        // The previous "ready" frame may have been an animation pause;
        // do not OCR it again until the new image settles.
        phase = "transition";
        stableCount = 1;
      } else {
        stableCount = similarity <= jitterRatio ? stableCount + 1 : 1;
      }
      previous = frame.slice();
      if (phase !== "ready" && stableCount >= settleFrames) {
        phase = "ready";
        eventId++;
        return { phase, eventId, ready: true, newEvent: true };
      }
    }
    return { phase, eventId, ready: phase === "ready", newEvent: false };
  }

  function confirm(frame) {
    if (phase !== "ready" || !frame?.length) return false;
    baseline = frame.slice();
    previous = baseline;
    departureCount = 0;
    stableCount = 0;
    phase = "locked";
    return true;
  }

  function reset() {
    phase = "initial";
    baseline = null;
    previous = null;
    stableCount = 0;
    departureCount = 0;
    eventId = 0;
  }

  return {
    observe, confirm, reset,
    getState: () => ({ phase, eventId, ready: phase === "ready" }),
  };
}
