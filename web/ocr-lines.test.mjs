import assert from "node:assert/strict";
import test from "node:test";
import { splitResultRows, recognizeResultRows } from "./ocr-lines.js";

function fakeDocument() {
  return {
    createElement(type) {
      assert.equal(type,"canvas");
      const canvas={ width:0,height:0,croppedAt:null };
      canvas.getContext=()=>({
        fillRect(){},
        drawImage(source, srcX, srcY) { canvas.croppedAt=srcY; },
      });
      return canvas;
    },
  };
}

test("five bonus strips are cropped in order with OCR-friendly white margins", () => {
  const rows=splitResultRows(fakeDocument(),{width:1036,height:536},5);
  assert.equal(rows.length,5);
  for(let i=1;i<rows.length;i++)assert.ok(rows[i].croppedAt>rows[i-1].croppedAt);
  assert.equal(rows[0].width,1036);
});

test("skill mode reads two separate lines and restores Tesseract block setting", async () => {
  const modes=[],doc=fakeDocument();
  const worker={
    async setParameters(parameters){ modes.push(parameters.tessedit_pageseg_mode); },
    async recognize(canvas){
      return {data:{text:canvas.croppedAt<200?"흑식룡의 힘":"주인의 혼",confidence:80}};
    },
  };
  const result=await recognizeResultRows(worker,doc,{width:500,height:560},"skill");
  assert.equal(result.data.text,"흑식룡의 힘\n주인의 혼");
  assert.equal(result.data.confidence,80);
  assert.deepEqual(modes,["7","6"]);
});

test("Tesseract mode is restored even if one strip throws", async () => {
  const modes=[];
  const worker={
    async setParameters(p){modes.push(p.tessedit_pageseg_mode);},
    async recognize(){throw Error("bad OCR")},
  };
  await assert.rejects(recognizeResultRows(worker,fakeDocument(),{width:400,height:500},"gogma"),/bad OCR/);
  assert.deepEqual(modes,["7","6"]);
});
