import assert from "node:assert/strict";
import test from "node:test";
import {
  WILDS_GOGMA_ROI, supportsWildsGogmaProfile, measureWildsResultSignal,
  createWildsResultTracker, wildsFrameQuality, isolateWildsGreenText,
} from "./ocr-wilds-profile.js";

test("preset addresses the Korean 16:9 right-hand restoration bonus panel", () => {
  assert.equal(supportsWildsGogmaProfile(1920,1080),true);
  assert.equal(supportsWildsGogmaProfile(2560,1440),true);
  assert.equal(supportsWildsGogmaProfile(3440,1440),false);
  assert.equal(supportsWildsGogmaProfile(800,450),false);
  assert.ok(WILDS_GOGMA_ROI.x>0.8 && WILDS_GOGMA_ROI.y>0.55);
});

test("5 blank question marks differ from full green bonuses at the value column", () => {
  const blank={data:new Uint8ClampedArray(140*150*4)};
  for(let i=0;i<blank.data.length;i+=4) {
    blank.data[i]=35; blank.data[i+1]=37; blank.data[i+2]=30; blank.data[i+3]=255;
  }
  assert.equal(measureWildsResultSignal(blank),0);
  const full={data:blank.data.slice()};
  for(let i=0;i<1000;i++){
    const p=i*4;
    full.data[p]=66; full.data[p+1]=205; full.data[p+2]=67;
  }
  assert.ok(measureWildsResultSignal(full)>0.045);
});

test("brief glow followed by placeholders does not start a restoration event", () => {
  const tracker=createWildsResultTracker();
  [0,0,.04,.04,0,0,0].forEach(value=>tracker.observe(value));
  assert.equal(tracker.getState().eventId,0);
});

test("one preview gives one event and four frozen snapshots", () => {
  const tracker=createWildsResultTracker();
  const events=[],samples=[];
  for(let i=0;i<15;i++){
    const t=tracker.observe(.04);
    if(t.newEvent) events.push(t.eventId);
    if(t.shouldCapture) samples.push(t.eventId);
  }
  assert.deepEqual(events,[1]);
  assert.deepEqual(samples,[1,1,1,1]);
  assert.equal(tracker.getState().phase,"revealed");
});

test("five real rerolls are captured without duplicated events", () => {
  const tracker=createWildsResultTracker(),events=[];
  for(let i=0;i<5;i++){
    for(let n=0;n<25;n++){
      const state=tracker.observe(.04);
      if(state.newEvent)events.push(state.eventId);
    }
    for(let n=0;n<8;n++)tracker.observe(0);
  }
  assert.deepEqual(events,[1,2,3,4,5]);
});

test("intermittent animation noise does not rearm the same event", () => {
  const tracker=createWildsResultTracker();
  for(let i=0;i<10;i++)tracker.observe(.04);
  tracker.observe(0);
  tracker.observe(0);
  for(let i=0;i<8;i++)tracker.observe(.04);
  assert.equal(tracker.getState().eventId,1);
});

test("white glare is penalized compared with unclipped lettering", () => {
  const clear={data:new Uint8ClampedArray([15,90,30,255,30,190,60,255,15,90,30,255,30,190,60,255])};
  const glare={data:new Uint8ClampedArray([255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255])};
  assert.ok(wildsFrameQuality(clear)>wildsFrameQuality(glare));
});

test("game green text isolation removes blue patterns and yellow translucent background", () => {
  const data=new Uint8ClampedArray([
    66,205,67,255,  // actual green letter
    35,60,165,255,  // blue HUD texture
    195,185,37,255, // gold background
    255,255,255,255 // temporary white highlight uses fallback
  ]);
  const image={data};
  assert.equal(isolateWildsGreenText(image),image);
  assert.deepEqual([...image.data],[
    0,0,0,255,
    255,255,255,255,
    255,255,255,255,
    255,255,255,255,
  ]);
});
