import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const context = vm.createContext({});
const korean = readFileSync(new URL("./ko-locale.js", import.meta.url), "utf8")
  .replace(/^export /gm, "");
const parser = readFileSync(new URL("./ocr-parser.js", import.meta.url), "utf8")
  .replace(/^import .*;\n/gm, "")
  .replace(/^export /gm, "");
vm.runInContext(korean, context);
vm.runInContext(parser, context);

function recognize(mode, text) {
  const serialized = vm.runInContext(
    `JSON.stringify(parseOcrResult(${JSON.stringify(mode)}, ${JSON.stringify(text)}))`, context,
  );
  return JSON.parse(serialized);
}

test("Gogma Korean reinforcement grades preserve numeric IDs and slot order", () => {
  const result = recognize("gogma", [
    "기초 공격력 강화Ⅱ +5",
    "기초 공격력 강화Ⅲ +5",
    "회심률 강화Ⅱ",
    "기초 공격력 강화 EX",
    "예리도 강화 EX",
  ].join("\n"));
  assert.equal(result.complete, true);
  assert.deepEqual(result.ids, [8, 12, 9, 15, 10]);
  assert.equal(result.signature, "gogma:8,12,9,15,10");
});

test("Gogma accepts bowgun ammo and Unicode/ASCII tiers", () => {
  const result = recognize("gogma", [
    "장전 수 강화 +1", "회심률 강화III",
    "속성 강화EX", "기초 공격력 강화2", "회심률 강화ＥＸ",
  ].join("\n"));
  assert.deepEqual(result.ids, [6, 13, 14, 8, 16]);
});

test("base Artian recognizes plain bonuses without Gogma grades", () => {
  const result = recognize("artian", [
    "기초 공격력 강화", "속성 강화", "예리도 강화",
    "회심률 강화", "기초 공격력 강화",
  ].join("\n"));
  assert.equal(result.complete, true);
  assert.deepEqual(result.ids, [4, 6, 7, 8, 4]);
  assert.equal(recognize("artian", "기초 공격력 강화 EX").complete, false);
});

test("skill pair maps Korean in-game labels to source array positions", () => {
  const match = recognize("skill", "발동 스킬\n흑식룡의 힘\n주인의 혼");
  assert.equal(match.complete, true);
  assert.equal(match.seriesIndex, 11);
  assert.equal(match.groupIndex, 13);
  assert.equal(recognize("skill", "흑식룡의 힘\n화룡의 힘\n주인의 혼").complete, false);
});

test("never accept incomplete or extra bonus lines", () => {
  const text = "기초 공격력 강화Ⅱ\n회심률 강화Ⅱ\n기초 공격력 강화Ⅲ\n속성 강화 EX";
  assert.equal(recognize("gogma", text).complete, false);
  assert.equal(recognize("gogma", text + "\n예리도 강화\n회심률 강화 EX").complete, false);
});

test("incomplete OCR cannot rearm already recorded results; different confirmed rolls still work", () => {
  const create = vm.runInContext("createOcrSequencer", context);
  const sequencer = create();
  const first = recognize("artian", "기초 공격력 강화\n회심률 강화\n예리도 강화\n기초 공격력 강화\n회심률 강화");
  const next = recognize("artian", "회심률 강화\n기초 공격력 강화\n예리도 강화\n기초 공격력 강화\n회심률 강화");
  assert.equal(sequencer.observe(first), false);
  assert.equal(sequencer.observe(first), true);
  sequencer.applied(first);
  assert.equal(sequencer.observe(first), false);
  assert.equal(sequencer.observe(next), false);
  assert.equal(sequencer.observe(next), true);
  sequencer.applied(next);
  for (let index = 0; index < 6; index++) {
    assert.equal(sequencer.observe({ complete: false }), false);
    assert.equal(sequencer.observe(next), false);
  }
  assert.equal(sequencer.observe(next), false);
  assert.equal(sequencer.alreadyApplied(next.signature), true);
  sequencer.clearPending();
  assert.equal(sequencer.alreadyApplied(next.signature), true);
  assert.equal(sequencer.observe(first), false);
  assert.equal(sequencer.observe(first), true);
});

test("a missing middle bonus keeps its original slot for temporal OCR consensus", () => {
  const partial = recognize("gogma", [
    "기초 공격력 강화Ⅱ",
    "기초 공격력 강화Ⅲ",
    "보이지 않는 화면 효과",
    "기초 공격력 강화 EX",
    "예리도 강화 EX",
  ].join("\n"));
  assert.equal(partial.complete, false);
  assert.deepEqual(partial.slotIds, [8, 12, null, 15, 10]);
  assert.deepEqual(partial.ids, []);
  assert.deepEqual(recognize("gogma", "기초 공격력 강화Ⅱ\n회심률 강화Ⅱ").slotIds, []);
});
