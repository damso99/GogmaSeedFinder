import test from "node:test";
import assert from "node:assert/strict";
import {
  OCR_OBSERVATIONS_KEY,
  loadOcrSnapshots,
  saveOcrSnapshot,
  clearOcrSnapshot,
} from "./ocr-observation-store.js";

function fakeStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    values,
  };
}

test("OCR observations persist without overwriting existing mode results", () => {
  const storage = fakeStorage();
  const bonuses = { weaponType: 8, attributeForce: 1, rows: [[8, 12, 9, 15, 10], [8, 8, 8, 9, 10]] };
  const skills = { weaponType: 8, attributeForce: 1, rows: [{ seriesIndex: 11, groupIndex: 13 }] };
  assert.equal(saveOcrSnapshot(storage, "gogma", bonuses), true);
  assert.equal(saveOcrSnapshot(storage, "skill", skills), true);
  assert.deepEqual(loadOcrSnapshots(storage), { gogma: bonuses, skill: skills });
  assert.ok(storage.values.get(OCR_OBSERVATIONS_KEY));
});

test("saved snapshot rows are copies and cannot be mutated by callers", () => {
  const storage = fakeStorage();
  const bonuses = { weaponType: 0, attributeForce: 0, rows: [[4, 4, 4, 4, 4]] };
  assert.equal(saveOcrSnapshot(storage, "artian", bonuses), true);
  const loaded = loadOcrSnapshots(storage);
  loaded.artian.rows[0][0] = 8;
  assert.equal(loadOcrSnapshots(storage).artian.rows[0][0], 4);
});

test("invalid observations never replace previous confirmed results", () => {
  const storage = fakeStorage();
  const saved = { weaponType: 8, attributeForce: 0, rows: [[8, 12, 9, 15, 10]] };
  saveOcrSnapshot(storage, "gogma", saved);
  assert.equal(saveOcrSnapshot(storage, "gogma", { weaponType: 8, attributeForce: 0, rows: [] }), false);
  assert.deepEqual(loadOcrSnapshots(storage).gogma, saved);
});

test("malformed and legacy storage contents safely fall back", () => {
  const storage = fakeStorage();
  storage.values.set(OCR_OBSERVATIONS_KEY, "{invalid");
  assert.deepEqual(loadOcrSnapshots(storage), {});
  storage.values.set(OCR_OBSERVATIONS_KEY, '{"gogma":{"weaponType":99,"attributeForce":0,"rows":[[8,12,9,15,10]]}}');
  assert.deepEqual(loadOcrSnapshots(storage), {});
});

test("one mode can be cleared without deleting the others", () => {
  const storage = fakeStorage();
  saveOcrSnapshot(storage, "skill", { weaponType: 0, attributeForce: 0, rows: [{ seriesIndex: 11, groupIndex: 13 }] });
  saveOcrSnapshot(storage, "gogma", { weaponType: 0, attributeForce: 0, rows: [[8, 12, 9, 15, 10]] });
  assert.equal(clearOcrSnapshot(storage, "skill"), true);
  assert.equal(loadOcrSnapshots(storage).skill, undefined);
  assert.ok(loadOcrSnapshots(storage).gogma);
});
