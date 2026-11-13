import assert from "node:assert/strict";
import test from "node:test";
import { buildHudFingerprint, stabilizeTransition } from "./ocr-hud.js";

function hudFrame(level, offset=0) {
  const width=96, height=48;
  const data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const inGlyph = y>=13 && y<24 && x>=offset+16 && x<offset+34;
    const value=Math.min(255, level+(inGlyph?125:0));
    const p=(y*width+x)*4;
    data[p]=data[p+1]=data[p+2]=value;
    data[p+3]=255;
  }
  return {data,width,height};
}

test("changing global HUD brightness does not change text fingerprint", () => {
  const before=buildHudFingerprint(hudFrame(35));
  const lighter=buildHudFingerprint(hudFrame(64));
  assert.deepEqual(before,lighter);
});

test("moving the actual text changes the fingerprint", () => {
  const before=buildHudFingerprint(hudFrame(35));
  const different=buildHudFingerprint(hudFrame(35,25));
  assert.notDeepEqual(before,different);
});

test("transition detector waits for a stable second frame", () => {
  const detector=stabilizeTransition({stableFrames:2});
  const same=(a,b)=>a.length===b.length && a.every((v,i)=>v===b[i]);
  const a=buildHudFingerprint(hudFrame(35)),b=buildHudFingerprint(hudFrame(35,25));
  assert.equal(detector.observe(a,same),false);
  assert.equal(detector.observe(a,same),true);
  assert.equal(detector.observe(b,same),false);
  assert.equal(detector.observe(b,same),true);
  detector.reset();
  assert.equal(detector.observe(b,same),false);
});

test("invalid capture is safely skipped", () => {
  assert.equal(buildHudFingerprint({data:new Uint8ClampedArray(4),width:96,height:48}),null);
});
