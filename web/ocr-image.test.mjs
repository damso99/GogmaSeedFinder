import assert from "node:assert/strict";
import test from "node:test";
import { ocrRenderSize, enhanceOcrImageData, bestOcrCandidate } from "./ocr-image.js";

test("small OCR crop gets up to 3x enlargement and a white margin", () => {
  const size = ocrRenderSize(320, 180);
  assert.equal(size.scale, 3);
  assert.equal(size.renderedWidth, 960);
  assert.equal(size.renderedHeight, 540);
  assert.equal(size.padding, 18);
  assert.equal(size.width, 996);
  assert.equal(size.height, 576);
});

test("large captured areas stay within the pixel budget", () => {
  const size = ocrRenderSize(3840, 2160);
  assert.ok(size.renderedWidth * size.renderedHeight <= 2_400_000);
  assert.ok(size.renderedWidth <= 2800);
  assert.ok(size.renderedHeight <= 1800);
  assert.equal(ocrRenderSize(0, 100), null);
});

function syntheticImage(width, height, background, text, textAt) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const brightness = textAt(i) ? text : background;
    const p = 4 * i;
    data[p] = data[p + 1] = data[p + 2] = brightness;
    data[p + 3] = 255;
  }
  return { width, height, data };
}

test("dark game HUD is inverted to black text on a white background", () => {
  const img = syntheticImage(20, 10, 34, 218, i => i >= 62 && i <= 88);
  enhanceOcrImageData(img);
  assert.ok(img.data[0] > 190, "dark background should be white");
  assert.ok(img.data[75 * 4] < 65, "bright lettering should become dark");
});

test("light game HUD preserves dark lettering", () => {
  const img = syntheticImage(20, 10, 223, 50, i => i >= 62 && i <= 88);
  enhanceOcrImageData(img);
  assert.ok(img.data[0] > 190);
  assert.ok(img.data[75 * 4] < 65);
});

test("a complete valid reading beats an incomplete but high-confidence reading", () => {
  const incomplete = { result: { complete: false, recognized: 4 }, confidence: 96 };
  const complete = { result: { complete: true, recognized: 5 }, confidence: 48 };
  assert.equal(bestOcrCandidate(incomplete, complete), complete);
  assert.equal(bestOcrCandidate(complete, incomplete), complete);
});

test("between two complete readings prefer higher confidence", () => {
  const left = { result: { complete: true, recognized: 5 }, confidence: 57 };
  const right = { result: { complete: true, recognized: 5 }, confidence: 81 };
  assert.equal(bestOcrCandidate(left, right), right);
});
