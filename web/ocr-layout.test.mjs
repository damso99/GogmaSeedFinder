import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const section = source.match(/<section id="ocr-panel"[\s\S]*?<section class="save-state-panel"/)?.[0] ?? "";

test("primary OCR screen shows only core controls and recognized result", () => {
  const firstDisclosure = section.indexOf('<details class="ocr-simple-details"');
  assert.ok(firstDisclosure > 0);
  const primary = section.slice(0, firstDisclosure);
  for (const id of ["ocr-mode", "ocr-wilds-profile", "ocr-toggle-pause", "ocr-status", "ocr-recognized", "ocr-apply-once"]) {
    assert.ok(primary.includes('id="' + id + '"'), id + " should be in the main view");
  }
  for (const id of ["ocr-preprocess", "ocr-precision", "ocr-event-mode", "ocr-preview-zoom", "ocr-retry"]) {
    assert.ok(!primary.includes('id="' + id + '"'), id + " should stay in advanced settings");
  }
});

test("all previously wired OCR controls remain in the DOM, exactly once", () => {
  const ids = [...section.matchAll(/\bid="(ocr-[^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ["ocr-panel", "ocr-preview", "ocr-mode", "ocr-preprocess",
    "ocr-auto", "ocr-event-mode", "ocr-wilds-profile", "ocr-precision",
    "ocr-preview-zoom", "ocr-enhanced-preview", "ocr-reset-area",
    "ocr-retry", "ocr-toggle-pause", "ocr-apply-once",
    "ocr-wilds-status", "ocr-wilds-progress", "ocr-wilds-history",
    "ocr-event-state", "ocr-status", "ocr-recognized"]) {
    assert.ok(ids.includes(id), id + " must remain accessible");
  }
});

test("recognition preview and technical controls are independent, closed-by-default disclosures", () => {
  assert.ok(section.includes('<details class="ocr-simple-details" id="ocr-view-details">'));
  assert.ok(section.includes('<details class="ocr-simple-details" id="ocr-advanced-details">'));
  assert.ok(section.indexOf('id="ocr-preview"') > section.indexOf('id="ocr-view-details"'));
  assert.ok(section.indexOf('id="ocr-preprocess"') > section.indexOf('id="ocr-advanced-details"'));
  assert.ok(!section.includes('id="ocr-view-details" open'));
  assert.ok(!section.includes('id="ocr-advanced-details" open'));
});
