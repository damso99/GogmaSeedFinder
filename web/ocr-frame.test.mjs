import assert from "node:assert/strict";
import test from "node:test";
import { createFrameThrottle, frameDifference } from "./ocr-frame.js";

function frame(level, length = 200) {
  return new Uint8Array(length).fill(level);
}

test("tiny frame brightness fluctuations are not a new screen", () => {
  const a = frame(90), b = frame(91);
  assert.equal(frameDifference(a, b).same, true);
  assert.equal(frameDifference(a, frame(145)).same, false);
});

test("same visual frame is OCR-scanned at most three times", () => {
  const gate = createFrameThrottle({ maxScansPerView: 3 });
  const image = frame(100);
  assert.equal(gate.shouldScan(image), true);
  assert.equal(gate.shouldScan(image), true);
  assert.equal(gate.shouldScan(image), true);
  for (let i = 0; i < 12; i++) {
    assert.equal(gate.shouldScan(frame(101)), false);
  }
});

test("an applied frame cannot be repeatedly scanned due to bad OCR", () => {
  const gate = createFrameThrottle({ maxScansPerView: 3 });
  const a = frame(80);
  assert.equal(gate.shouldScan(a), true);
  gate.applied(a);
  for (let i = 0; i < 30; i++) {
    assert.equal(gate.shouldScan(frame(81)), false);
  }
  const b = frame(180);
  assert.equal(gate.shouldScan(b), true);
  assert.equal(gate.shouldScan(b), true);
  assert.equal(gate.shouldScan(b), true);
  assert.equal(gate.shouldScan(b), false);
});

test("manually reselecting the crop resets only the frame cache", () => {
  const gate = createFrameThrottle({ maxScansPerView: 2 });
  const a = frame(50);
  gate.shouldScan(a);
  gate.shouldScan(a);
  assert.equal(gate.shouldScan(a), false);
  gate.reset();
  assert.equal(gate.shouldScan(a), true);
});

test("new OCR text without optical change is not automatically advanced", () => {
  const gate = createFrameThrottle();
  const saved = frame(82);
  gate.applied(saved);
  assert.equal(gate.canAdvance(frame(83)), false);
  assert.equal(gate.canAdvance(frame(92)), false);
  assert.equal(gate.canAdvance(frame(160)), true);
});
