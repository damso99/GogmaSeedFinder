import assert from "node:assert/strict";
import test from "node:test";
import { createRollEventDetector } from "./ocr-roll-event.js";

const sample = (n = 0, length = 100) => new Uint8Array(length).fill(n);

test("first result is readable only after two stable frames", () => {
  const detector = createRollEventDetector();
  assert.equal(detector.observe(sample()).ready, false);
  const ready = detector.observe(sample());
  assert.equal(ready.ready, true);
  assert.equal(ready.eventId, 1);
  assert.equal(detector.observe(sample()).newEvent, false);
  assert.equal(detector.confirm(sample()), true);
  assert.equal(detector.getState().phase, "locked");
});

test("OCR changes and minor illumination jitter never create a new roll", () => {
  const detector = createRollEventDetector();
  detector.observe(sample());
  detector.observe(sample());
  detector.confirm(sample());
  for(let i=0;i<15;i++) {
    assert.equal(detector.observe(sample(1)).ready, false);
    assert.equal(detector.getState().eventId,1);
  }
});

test("confirmed result requires visual departure and resettling for new event", () => {
  const detector = createRollEventDetector();
  detector.observe(sample());
  detector.observe(sample());
  detector.confirm(sample());
  assert.equal(detector.observe(sample(255)).ready,false);
  assert.equal(detector.observe(sample(255)).ready,false);
  assert.equal(detector.getState().phase,"transition");
  const next = detector.observe(sample(255));
  assert.equal(next.ready,true);
  assert.equal(next.newEvent,true);
  assert.equal(next.eventId,2);
});

test("the same exact roll can occur twice after a real interstitial event", () => {
  const detector = createRollEventDetector();
  detector.observe(sample());
  detector.observe(sample());
  detector.confirm(sample());
  detector.observe(sample(255));
  detector.observe(sample(255));
  detector.observe(sample());
  assert.equal(detector.observe(sample()).ready,true);
  assert.equal(detector.getState().eventId,2);
});

test("a strong transition in one frame can enter settling instead of being missed", () => {
  const detector = createRollEventDetector();
  detector.observe(sample());
  detector.observe(sample());
  detector.confirm(sample());
  assert.equal(detector.observe(sample(255)).phase,"transition");
  assert.equal(detector.observe(sample(255)).ready,true);
});

test("reset requires new stable initial frame; invalid observations are ignored", () => {
  const detector = createRollEventDetector();
  detector.observe(sample());
  detector.observe(sample());
  detector.confirm(sample());
  detector.reset();
  assert.equal(detector.observe(null).ready,false);
  assert.equal(detector.observe(sample()).ready,false);
  assert.equal(detector.observe(sample()).eventId,1);
});
