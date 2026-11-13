import assert from "node:assert/strict";
import test from "node:test";
import { createOcrConsensus } from "./ocr-consensus.js";

function read(ids, mode="gogma") {
  const recognized = ids.filter(Number.isInteger).length;
  return {
    mode, slotIds: ids,
    ids: recognized === 5 ? ids : [],
    recognized, complete: recognized===5,
    signature: recognized===5 ? `${mode}:${ids.join(",")}` : null,
  };
}

test("partial OCR results from multiple independent frames recover five slots", () => {
  const consensus = createOcrConsensus({minVotes:2});
  const a=read([8,12,null,15,10]), b=read([8,12,9,15,null]), c=read([8,12,9,15,10]);
  assert.equal(consensus.observe(a,70),null);
  assert.equal(consensus.observe(b,77),null);
  const result=consensus.observe(c,82);
  assert.deepEqual(result.result.ids,[8,12,9,15,10]);
  assert.equal(result.result.signature,"gogma:8,12,9,15,10");
  assert.equal(result.support,2);
});

test("unresolved competing tiers cannot silently auto-commit", () => {
  const consensus=createOcrConsensus();
  consensus.observe(read([8,12,9,15,10]),90);
  assert.equal(consensus.observe(read([8,13,9,15,10]),93),null);
  assert.deepEqual(consensus.observe(read([8,12,9,15,10]),88).result.ids,[8,12,9,15,10]);
});

test("missing a middle option never shifts later slots", () => {
  const consensus=createOcrConsensus();
  consensus.observe(read([8,12,null,15,10]),72);
  consensus.observe(read([8,12,null,15,10]),90);
  assert.equal(consensus.observe(read([8,12,null,15,10]),91),null);
});

test("invalid confidence OCR samples cannot supply votes", () => {
  const consensus=createOcrConsensus();
  assert.equal(consensus.observe(read([8,12,9,15,10]),14),null);
  assert.equal(consensus.observe(read([8,12,9,15,10]),91),null);
  assert.ok(consensus.observe(read([8,12,9,15,10]),95));
});

test("skill consensus requires same recognized skill pair", () => {
  const s=createOcrConsensus({minVotes:2});
  const skill=(seriesIndex,groupIndex)=>({
    mode:"skill",complete:true,recognized:2,seriesIndex,groupIndex,
    signature:`skill:${seriesIndex}:${groupIndex}`,labels:[String(seriesIndex),String(groupIndex)]
  });
  s.observe(skill(11,13),83);
  assert.equal(s.observe(skill(9,13),92),null);
  const result=s.observe(skill(11,13),75);
  assert.equal(result.result.seriesIndex,11);
  assert.equal(result.support,2);
});

test("new game event resets old OCR votes", () => {
  const s=createOcrConsensus();
  s.observe(read([8,12,9,15,10]),80);
  s.reset();
  assert.equal(s.observe(read([8,12,9,15,10]),80),null);
});
