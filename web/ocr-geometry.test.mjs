import assert from "node:assert/strict";
import test from "node:test";
import { canvasContentRect, pointerToCanvasImage } from "./ocr-geometry.js";

test("16:9 preview uses exact normalized image points", () => {
  const rect = { left: 50, top: 100, width: 960, height: 540 };
  assert.deepEqual(pointerToCanvasImage({clientX:530,clientY:370},rect,1920,1080),{x:0.5,y:0.5});
  assert.deepEqual(pointerToCanvasImage({clientX:50,clientY:100},rect,1920,1080),{x:0,y:0});
});

test("object-fit contain letterboxing cannot shift the crop", () => {
  const rect = { left: 100, top: 200, width: 960, height: 540 };
  const content=canvasContentRect(rect,2560,1080);
  assert.equal(content.height,405);
  assert.equal(content.top,267.5);
  assert.equal(pointerToCanvasImage({clientX:580,clientY:200},rect,2560,1080),null);
  assert.deepEqual(pointerToCanvasImage({clientX:580,clientY:470},rect,2560,1080),{x:0.5,y:0.5});
  assert.deepEqual(pointerToCanvasImage({clientX:580,clientY:200},rect,2560,1080,{clamp:true}),{x:0.5,y:0});
});

test("4:3 game source pillarboxing is excluded from valid selection", () => {
  const rect={left:0,top:0,width:1200,height:600};
  assert.equal(pointerToCanvasImage({clientX:100,clientY:300},rect,1600,1200),null);
  assert.deepEqual(pointerToCanvasImage({clientX:600,clientY:300},rect,1600,1200),{x:0.5,y:0.5});
});

test("invalid canvas geometry never creates an ROI", () => {
  assert.equal(pointerToCanvasImage({clientX:10,clientY:10},{left:0,top:0,width:0,height:400},1920,1080),null);
});
