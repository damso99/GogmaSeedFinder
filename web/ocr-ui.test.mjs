import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const files = {
  korean: readFileSync(new URL("./ko-locale.js", import.meta.url), "utf8")
    .replace(/^export /gm, ""),
  parser: readFileSync(new URL("./ocr-parser.js", import.meta.url), "utf8")
    .replace(/^import .*;\n/gm, "")
    .replace(/^export /gm, ""),
  frame: readFileSync(new URL("./ocr-frame.js", import.meta.url), "utf8")
    .replace(/^export /gm, ""),
  image: readFileSync(new URL("./ocr-image.js", import.meta.url), "utf8")
    .replace(/^export /gm, ""),
  geometry: readFileSync(new URL("./ocr-geometry.js", import.meta.url), "utf8")
    .replace(/^export /gm, ""),
  hud: readFileSync(new URL("./ocr-hud.js", import.meta.url), "utf8")
    .replace(/^export /gm, ""),
  lines: readFileSync(new URL("./ocr-lines.js", import.meta.url), "utf8")
    .replace(/^export /gm, ""),
  store: readFileSync(new URL("./ocr-observation-store.js", import.meta.url), "utf8")
    .replace(/^export /gm, ""),
  event: readFileSync(new URL("./ocr-roll-event.js", import.meta.url), "utf8")
    .replace(/^export /gm, ""),
  consensus: readFileSync(new URL("./ocr-consensus.js", import.meta.url), "utf8")
    .replace(/^export /gm, ""),
  wilds: readFileSync(new URL("./ocr-wilds-profile.js", import.meta.url), "utf8")
    .replace(/^export /gm, ""),
  queue: readFileSync(new URL("./ocr-wilds-queue.js", import.meta.url), "utf8")
    .replace(/^export /gm, ""),
  ui: readFileSync(new URL("./ocr-ui.js", import.meta.url), "utf8")
    .replace(/^import .*;\n/gm, "")
    .replace(/^export /gm, "")
    .replace(/initializeOcrUi\(\);\s*$/, ""),
};

function setup(initialText, { savedSnapshots = null } = {}) {
  let frameLevel = 0;
  let minorFlicker = false;
  let wildsVisible = false;
  let onRecognize = null;
  class Node {
    constructor(id) {
      this.id = id;
      this.dataset = {};
      this.style = {};
      this.listeners = new Map();
      this.disabled = false;
      this.hidden = false;
      this.checked = id === "ocr-auto";
      this.value = id === "ocr-mode" ? "gogma" : id === "ocr-preprocess" ? "enhanced" : id === "ocr-preview-zoom" ? "1" : "";
      this.textContent = "";
      this.width = 960;
      this.height = 540;
    }
    addEventListener(type, fn, options) {
      const listeners = this.listeners.get(type) ?? [];
      listeners.push({ fn, once: Boolean(options?.once) });
      this.listeners.set(type, listeners);
    }
    removeEventListener(type, fn) {
      this.listeners.set(type, (this.listeners.get(type) ?? []).filter((listener) => listener.fn !== fn));
    }
    dispatchEvent(event) {
      for (const listener of [...(this.listeners.get(event.type) ?? [])]) {
        listener.fn(event);
        if (listener.once) this.removeEventListener(event.type, listener.fn);
      }
    }
    click() { this.dispatchEvent({ type: "click" }); }
    getBoundingClientRect() { return { left: 0, top: 0, width: 960, height: 540 }; }
    setPointerCapture() {}
    getContext() {
      const node = this;
      return {
        drawImage() {}, fillRect() {}, strokeRect() {}, putImageData() {},
        getImageData() {
          const data = new Uint8ClampedArray(node.width === 192 ? 128
            : node.width === 140 ? 140 * 150 * 4 : 20);
          if (node.width === 140 && wildsVisible) {
            for (let i = 0; i < 1100 * 4; i += 4) {
              data[i] = 66; data[i + 1] = 205; data[i + 2] = 67; data[i + 3] = 255;
            }
          }
          if (node.width === 192) {
            for (let i = 0; i < data.length; i += 4) {
              const pixel = minorFlicker && i === 0 ? frameLevel + 40 : frameLevel;
              data[i] = data[i + 1] = data[i + 2] = pixel;
              data[i + 3] = 255;
            }
          }
          return { data };
        },
      };
    }
  }
  const names = [
    "ocr-panel", "ocr-preview", "ocr-mode", "ocr-preprocess", "ocr-auto",
    "ocr-preview-zoom", "ocr-precision", "ocr-event-mode", "ocr-event-state", "ocr-wilds-profile", "ocr-wilds-status", "ocr-wilds-progress", "ocr-wilds-history", "ocr-reset-area", "ocr-retry", "ocr-toggle-pause", "ocr-apply-once", "ocr-status",
    "ocr-recognized", "weapon-type", "attribute-force", "artian-search-weapon-type",
    "artian-search-attribute-force",
  ];
  const nodes = Object.fromEntries(names.map((name) => [name, new Node(name)]));
  const doc = new Node("document");
  doc.querySelector = (selector) => nodes[selector.slice(1)];
  doc.querySelectorAll = () => [];
  doc.createElement = (name) => new Node(name);
  doc.head = { append() {} };

  let text = initialText;
  let nextReadings = [];
  let recognitionCount = 0;
  let workersTerminated = 0;
  const library = {
    PSM: { SINGLE_BLOCK: "6" },
    createWorker: async (langs) => {
      assert.deepEqual([...langs], ["kor", "eng"]);
      return {
        setParameters: async () => {},
        recognize: async () => {
          recognitionCount++;
          if (onRecognize) {
            const hook = onRecognize;
            onRecognize = null;
            hook();
          }
          const reading = nextReadings.length
            ? nextReadings.shift()
            : { text, confidence: 92 };
          return { data: { text: reading.text, confidence: reading.confidence ?? 92 } };
        },
        terminate: async () => { workersTerminated++; },
      };
    },
  };
  const handlers = new Map();
  let timerIndex = 0;
  const window = {
    Tesseract: library,
    setInterval: (fn) => { handlers.set(++timerIndex, fn); return timerIndex; },
    clearInterval: (id) => handlers.delete(id),
  };
  const storage = {
    getItem: (key) => key === "gogma-ocr-observations-v1"
      ? JSON.stringify(savedSnapshots)
      : JSON.stringify({
        gogma: { x: 0.1, y: 0.1, w: 0.6, h: 0.6 },
        artian: { x: 0.1, y: 0.1, w: 0.6, h: 0.6 },
        skill: { x: 0.1, y: 0.1, w: 0.6, h: 0.6 },
      }),
    setItem() {},
  };
  class CustomEvent {
    constructor(type, options) { this.type = type; this.detail = options?.detail; }
  }
  const context = vm.createContext({
    document: doc, window, localStorage: storage, CustomEvent,
    getLocale: () => "ko",
    Uint8ClampedArray,
  });
  vm.runInContext(files.korean, context);
  vm.runInContext(files.parser, context);
  vm.runInContext(files.frame, context);
  vm.runInContext(files.image, context);
  vm.runInContext(files.geometry, context);
  vm.runInContext(files.hud, context);
  vm.runInContext(files.lines, context);
  vm.runInContext(files.store, context);
  vm.runInContext(files.event, context);
  vm.runInContext(files.consensus, context);
  vm.runInContext(files.wilds, context);
  vm.runInContext(files.queue, context);
  vm.runInContext(files.ui, context);
  const ui = vm.runInContext("initializeOcrUi(document)", context);
  const observed = [];
  doc.addEventListener("gogma:ocr-observation", (event) => {
    observed.push(event.detail);
    doc.dispatchEvent(new CustomEvent("gogma:ocr-ack", {
      detail: { success: true, message: "자동 입력 완료", rowNumber: observed.length },
    }));
  });
  const video = { videoWidth: 800, videoHeight: 450, readyState: 3 };
  doc.dispatchEvent(new CustomEvent("gogma:screen-share-started", { detail: { video } }));
  return {
    nodes, doc, ui, observed, video, CustomEvent,
    setText(value) { text = value; },
    setReadings(value) { nextReadings = [...value]; },
    setFrame(value) { frameLevel = value; },
    setMinorFlicker(value) { minorFlicker = value; },
    setWildsVisible(value) { wildsVisible = value; },
    onRecognize(fn) { onRecognize = fn; },
    getRecognitionCount: () => recognitionCount,
    getWorkersTerminated: () => workersTerminated,
  };
}

test("stable Korean result auto-fills the existing Gogma observation event once", async () => {
  const s = setup([
    "기초 공격력 강화Ⅱ", "기초 공격력 강화Ⅲ", "회심률 강화Ⅱ",
    "기초 공격력 강화 EX", "예리도 강화 EX",
  ].join("\n"));
  await s.ui.scan();
  assert.equal(s.observed.length, 0);
  await s.ui.scan();
  assert.equal(s.observed.length, 0);
  await s.ui.scan();
  assert.equal(s.observed.length, 1);
  assert.deepEqual([...s.observed[0].ids], [8, 12, 9, 15, 10]);
  await s.ui.scan();
  assert.equal(s.observed.length, 1);
  assert.equal(s.nodes["ocr-apply-once"].disabled, false);
  s.nodes["ocr-apply-once"].click();
  assert.equal(s.observed.length, 2);
  s.ui.stop();
  assert.equal(s.nodes["ocr-panel"].hidden, true);
});

test("OCR can switch to a base Artian result without overriding Gogma observations", async () => {
  const s = setup("기초 공격력 강화Ⅱ\n기초 공격력 강화Ⅲ\n회심률 강화Ⅱ\n기초 공격력 강화 EX\n예리도 강화 EX");
  s.nodes["ocr-mode"].value = "artian";
  s.nodes["ocr-mode"].dispatchEvent({ type: "change" });
  s.setText("기초 공격력 강화\n속성 강화\n예리도 강화\n회심률 강화\n기초 공격력 강화");
  await s.ui.scan();
  await s.ui.scan();
  await s.ui.scan();
  assert.equal(s.observed.length, 1);
  assert.equal(s.observed[0].mode, "artian");
  assert.deepEqual([...s.observed[0].ids], [4, 6, 7, 8, 4]);
  s.ui.stop();
});

test("pausing recognition prevents automatic input", async () => {
  const s = setup("기초 공격력 강화Ⅱ\n기초 공격력 강화Ⅲ\n회심률 강화Ⅱ\n기초 공격력 강화 EX\n예리도 강화 EX");
  s.nodes["ocr-toggle-pause"].click();
  await s.ui.scan();
  await s.ui.scan();
  await s.ui.scan();
  assert.equal(s.getRecognitionCount(), 0);
  s.nodes["ocr-toggle-pause"].click();
  await s.ui.scan();
  await s.ui.scan();
  await s.ui.scan();
  assert.equal(s.observed.length, 1);
  s.ui.stop();
});

test("the same physical screen does not keep refreshing OCR output", async () => {
  const text = "기초 공격력 강화Ⅱ\n기초 공격력 강화Ⅲ\n회심률 강화Ⅱ\n기초 공격력 강화 EX\n예리도 강화 EX";
  const s = setup(text);
  await s.ui.scan();
  await s.ui.scan();
  await s.ui.scan();
  const savedOutput = s.nodes["ocr-recognized"].textContent;
  const savedStatus = s.nodes["ocr-status"].textContent;
  const count = s.getRecognitionCount();
  s.setText("부정확한 문자\n여러번 잘못 인식됨");
  for (let i = 0; i < 12; i++) await s.ui.scan();
  assert.equal(s.getRecognitionCount(), count);
  assert.equal(s.observed.length, 1);
  assert.equal(s.nodes["ocr-recognized"].textContent, savedOutput);
  assert.equal(s.nodes["ocr-status"].textContent, savedStatus);
  s.ui.stop();
});

test("an unstable OCR pass cannot append the previous roll after a changed frame", async () => {
  const text = "기초 공격력 강화Ⅱ\n기초 공격력 강화Ⅲ\n회심률 강화Ⅱ\n기초 공격력 강화 EX\n예리도 강화 EX";
  const s = setup(text);
  await s.ui.scan();
  await s.ui.scan();
  await s.ui.scan();
  assert.equal(s.observed.length, 1);
  s.setFrame(160);
  s.setText("오류\n문자\n강화");
  await s.ui.scan();
  await s.ui.scan();
  await s.ui.scan();
  s.setFrame(0);
  s.setText(text);
  for (let i = 0; i < 8; i++) await s.ui.scan();
  assert.equal(s.observed.length, 1);
  s.ui.stop();
});

test("a genuinely changed result automatically enters the next observation row", async () => {
  const s = setup("기초 공격력 강화Ⅱ\n기초 공격력 강화Ⅲ\n회심률 강화Ⅱ\n기초 공격력 강화 EX\n예리도 강화 EX");
  await s.ui.scan();
  await s.ui.scan();
  await s.ui.scan();
  s.setFrame(160);
  s.setText("회심률 강화Ⅲ\n기초 공격력 강화Ⅱ\n기초 공격력 강화Ⅱ\n회심률 강화 EX\n예리도 강화");
  await s.ui.scan();
  await s.ui.scan();
  await s.ui.scan();
  assert.equal(s.observed.length, 2);
  assert.deepEqual([...s.observed[1].ids], [13, 8, 8, 16, 6]);
  for (let i = 0; i < 8; i++) await s.ui.scan();
  assert.equal(s.observed.length, 2);
  s.ui.stop();
});

test("retry on an unchanged frame cannot automatically insert an identical roll", async () => {
  const text = "기초 공격력 강화Ⅱ\n기초 공격력 강화Ⅲ\n회심률 강화Ⅱ\n기초 공격력 강화 EX\n예리도 강화 EX";
  const s = setup(text);
  await s.ui.scan();
  await s.ui.scan();
  await s.ui.scan();
  assert.equal(s.observed.length, 1);
  s.nodes["ocr-retry"].click();
  await s.ui.scan();
  await s.ui.scan();
  await s.ui.scan();
  assert.equal(s.observed.length, 1);
  s.ui.stop();
});

test("the last saved text stays visible during an unconfirmed new OCR reading", async () => {
  const text = "기초 공격력 강화Ⅱ\n기초 공격력 강화Ⅲ\n회심률 강화Ⅱ\n기초 공격력 강화 EX\n예리도 강화 EX";
  const s = setup(text);
  await s.ui.scan();
  await s.ui.scan();
  await s.ui.scan();
  const saved = s.nodes["ocr-recognized"].textContent;
  s.setFrame(170);
  s.setText("회심률 강화Ⅲ\n기초 공격력 강화Ⅱ\n기초 공격력 강화Ⅱ\n회심률 강화 EX\n예리도 강화");
  await s.ui.scan();
  assert.equal(s.nodes["ocr-recognized"].textContent, saved);
  await s.ui.scan();
  await s.ui.scan();
  assert.notEqual(s.nodes["ocr-recognized"].textContent, saved);
  assert.equal(s.observed.length, 2);
  s.ui.stop();
});

test("enhanced crop is selected by default and still records a complete Korean result", async () => {
  const s = setup("기초 공격력 강화Ⅱ\n기초 공격력 강화Ⅲ\n회심률 강화Ⅱ\n기초 공격력 강화 EX\n예리도 강화 EX");
  assert.equal(s.nodes["ocr-preprocess"].value, "enhanced");
  await s.ui.scan();
  await s.ui.scan();
  await s.ui.scan();
  assert.equal(s.observed.length, 1);
  assert.deepEqual([...s.observed[0].ids], [8, 12, 9, 15, 10]);
  s.ui.stop();
});

test("preview zoom preserves the selected crop and avoids object-fit offset", () => {
  const s = setup("기초 공격력 강화Ⅱ");
  s.nodes["ocr-preview-zoom"].value = "2";
  s.nodes["ocr-preview-zoom"].dispatchEvent({type:"change"});
  assert.equal(s.nodes["ocr-preview"].style.width,"200%");
  s.nodes["ocr-preview"].dispatchEvent({type:"pointerdown",button:0,clientX:200,clientY:100,pointerId:1});
  s.nodes["ocr-preview"].dispatchEvent({type:"pointermove",clientX:500,clientY:320,pointerId:1});
  s.nodes["ocr-preview"].dispatchEvent({type:"pointerup",clientX:500,clientY:320,pointerId:1});
  assert.equal(s.nodes["ocr-status"].dataset.state,"info");
  s.ui.stop();
});

test("adaptive background pass can rescue otherwise unreadable bonus rows", async () => {
  const valid = "기초 공격력 강화Ⅱ\n기초 공격력 강화Ⅲ\n회심률 강화Ⅱ\n기초 공격력 강화 EX\n예리도 강화 EX";
  const bad = "노이즈\n복원 정보 누락";
  const s = setup(bad);
  s.setReadings([
    { text: bad, confidence: 12 }, { text: bad, confidence: 18 }, { text: valid, confidence: 84 },
    { text: bad, confidence: 12 }, { text: bad, confidence: 18 }, { text: valid, confidence: 84 },
  ]);
  await s.ui.scan();
  await s.ui.scan();
  await s.ui.scan();
  assert.equal(s.observed.length, 1);
  assert.deepEqual([...s.observed[0].ids], [8, 12, 9, 15, 10]);
  assert.equal(s.getRecognitionCount(), 6);
  s.ui.stop();
});

test("OCR result remains visible after retry and preprocessing changes", async () => {
  const text = "기초 공격력 강화Ⅱ\n기초 공격력 강화Ⅲ\n회심률 강화Ⅱ\n기초 공격력 강화 EX\n예리도 강화 EX";
  const s = setup(text);
  await s.ui.scan();
  await s.ui.scan();
  await s.ui.scan();
  assert.equal(s.observed.length, 1);
  const savedOutput = s.nodes["ocr-recognized"].textContent;
  const savedStatus = s.nodes["ocr-status"].textContent;
  for (const id of ["ocr-retry", "ocr-preprocess", "ocr-precision"]) {
    if (id === "ocr-retry") s.nodes[id].click();
    else s.nodes[id].dispatchEvent({ type: "change" });
    assert.equal(s.nodes["ocr-recognized"].textContent, savedOutput, "OCR text should not reset for " + id);
    assert.equal(s.nodes["ocr-status"].textContent, savedStatus, "saved status should remain for " + id);
    await s.ui.scan();
    await s.ui.scan();
  }
  assert.equal(s.observed.length, 1);
  s.ui.stop();
});

test("minor image flicker with a different OCR guess never clears the saved result", async () => {
  const text = "기초 공격력 강화Ⅱ\n기초 공격력 강화Ⅲ\n회심률 강화Ⅱ\n기초 공격력 강화 EX\n예리도 강화 EX";
  const s = setup(text);
  await s.ui.scan();
  await s.ui.scan();
  await s.ui.scan();
  const before = s.nodes["ocr-recognized"].textContent;
  const status = s.nodes["ocr-status"].textContent;
  const count = s.getRecognitionCount();
  s.setMinorFlicker(true);
  s.setText("회심률 강화Ⅲ\n회심률 강화Ⅲ\n기초 공격력 강화Ⅱ\n예리도 강화 EX\n예리도 강화 EX");
  for (let i = 0; i < 9; i++) await s.ui.scan();
  assert.equal(s.nodes["ocr-recognized"].textContent, before);
  assert.equal(s.nodes["ocr-status"].textContent, status);
  assert.equal(s.observed.length, 1);
  assert.equal(s.getRecognitionCount(), count);
  s.ui.stop();
});

test("a capture reconnect keeps the latest confirmed result", async () => {
  const text = "기초 공격력 강화Ⅱ\n기초 공격력 강화Ⅲ\n회심률 강화Ⅱ\n기초 공격력 강화 EX\n예리도 강화 EX";
  const s = setup(text);
  await s.ui.scan();
  await s.ui.scan();
  await s.ui.scan();
  const before = s.nodes["ocr-recognized"].textContent;
  s.ui.stop();
  s.doc.dispatchEvent(new s.CustomEvent("gogma:screen-share-started", { detail: { video: s.video } }));
  assert.equal(s.nodes["ocr-recognized"].textContent, before);
  assert.equal(s.observed.length, 1);
  s.ui.stop();
});

test("reloading during the same game roll cannot append the already saved result again", async () => {
  const existing = "기초 공격력 강화Ⅱ\n기초 공격력 강화Ⅲ\n회심률 강화Ⅱ\n기초 공격력 강화 EX\n예리도 강화 EX";
  const s = setup(existing, {
    savedSnapshots: { gogma: { weaponType: 8, attributeForce: 1, rows: [[8, 12, 9, 15, 10]] } },
  });
  await s.ui.scan();
  await s.ui.scan();
  await s.ui.scan();
  assert.equal(s.observed.length, 0);
  s.setFrame(160);
  s.setText("회심률 강화Ⅲ\n기초 공격력 강화Ⅱ\n기초 공격력 강화Ⅱ\n회심률 강화 EX\n예리도 강화");
  await s.ui.scan();
  await s.ui.scan();
  await s.ui.scan();
  assert.equal(s.observed.length, 1);
  assert.deepEqual([...s.observed[0].ids], [13, 8, 8, 16, 6]);
  s.ui.stop();
});

test("experimental event mode records once and waits for a real screen transition", async () => {
  const initial = "기초 공격력 강화Ⅱ\n기초 공격력 강화Ⅲ\n회심률 강화Ⅱ\n기초 공격력 강화 EX\n예리도 강화 EX";
  const s=setup(initial);
  s.nodes["ocr-event-mode"].checked=true;
  s.nodes["ocr-event-mode"].dispatchEvent({type:"change"});
  for(let i=0;i<6;i++) await s.ui.scan();
  assert.equal(s.observed.length,1);
  const savedText=s.nodes["ocr-recognized"].textContent;
  for(let i=0;i<7;i++) await s.ui.scan();
  assert.equal(s.observed.length,1);
  assert.equal(s.nodes["ocr-recognized"].textContent,savedText);
  s.ui.stop();
});

test("experimental event mode records genuinely identical consecutive results after visual departure", async () => {
  const initial = "기초 공격력 강화Ⅱ\n기초 공격력 강화Ⅲ\n회심률 강화Ⅱ\n기초 공격력 강화 EX\n예리도 강화 EX";
  const s=setup(initial);
  s.nodes["ocr-event-mode"].checked=true;
  s.nodes["ocr-event-mode"].dispatchEvent({type:"change"});
  for(let i=0;i<6;i++) await s.ui.scan();
  assert.equal(s.observed.length,1);
  s.setFrame(160);
  for(let i=0;i<6;i++) await s.ui.scan();
  assert.equal(s.observed.length,2);
  assert.deepEqual([...s.observed[1].ids],[8,12,9,15,10]);
  s.ui.stop();
});

test("experimental mode does not auto-fill a single OCR pass", async () => {
  const s=setup("기초 공격력 강화Ⅱ\n기초 공격력 강화Ⅲ\n회심률 강화Ⅱ\n기초 공격력 강화 EX\n예리도 강화 EX");
  s.nodes["ocr-event-mode"].checked=true;
  s.nodes["ocr-event-mode"].dispatchEvent({type:"change"});
  await s.ui.scan();
  await s.ui.scan();
  assert.equal(s.observed.length,0);
  await s.ui.scan();
  assert.equal(s.observed.length,1);
  s.ui.stop();
});

test("recorded-game profile uses five question-mark states then captures immutable result frames", async () => {
  const options = "기초 공격력 강화Ⅱ\n기초 공격력 강화Ⅲ\n회심률 강화Ⅱ\n기초 공격력 강화 EX\n예리도 강화 EX";
  const s = setup(options);
  s.video.videoWidth=1920;
  s.video.videoHeight=1080;
  s.nodes["ocr-wilds-profile"].checked = true;
  s.nodes["ocr-wilds-profile"].dispatchEvent({ type:"change" });
  assert.equal(s.nodes["ocr-event-mode"].checked,false);
  for(let i=0;i<6;i++) s.ui.preview();
  await s.ui.scan();
  assert.equal(s.observed.length,0);
  s.setWildsVisible(true);
  for(let i=0;i<13;i++) s.ui.preview();
  await s.ui.scan();
  assert.equal(s.observed.length,1);
  assert.deepEqual([...s.observed[0].ids],[8,12,9,15,10]);
  for(let i=0;i<12;i++) s.ui.preview();
  await s.ui.scan();
  assert.equal(s.observed.length,1);
  s.ui.stop();
});

test("recorded-game profile captures identical results as two different rerolls", async () => {
  const options="기초 공격력 강화Ⅱ\n기초 공격력 강화Ⅲ\n회심률 강화Ⅱ\n기초 공격력 강화 EX\n예리도 강화 EX";
  const s=setup(options);
  s.video.videoWidth=1920; s.video.videoHeight=1080;
  s.nodes["ocr-wilds-profile"].checked=true;
  s.nodes["ocr-wilds-profile"].dispatchEvent({type:"change"});
  for(let event=0;event<2;event++) {
    s.setWildsVisible(false);
    for(let i=0;i<5;i++)s.ui.preview();
    s.setWildsVisible(true);
    for(let i=0;i<13;i++)s.ui.preview();
    await s.ui.scan();
  }
  assert.equal(s.observed.length,2);
  assert.deepEqual([...s.observed[1].ids],[8,12,9,15,10]);
  s.ui.stop();
});

test("recorded-game profile does not insert results with inconsistent OCR votes", async () => {
  const options="기초 공격력 강화Ⅱ\n기초 공격력 강화Ⅲ\n회심률 강화Ⅱ\n기초 공격력 강화 EX\n예리도 강화 EX";
  const alternative="회심률 강화Ⅲ\n기초 공격력 강화Ⅱ\n기초 공격력 강화Ⅱ\n회심률 강화 EX\n예리도 강화";
  const s=setup(options);
  s.video.videoWidth=1920; s.video.videoHeight=1080;
  s.nodes["ocr-wilds-profile"].checked=true;
  s.nodes["ocr-wilds-profile"].dispatchEvent({type:"change"});
  // Each snapshot gets a different text; no slot reaches two votes.
  s.setReadings([
    {text:options,confidence:90},
    {text:alternative,confidence:90},
    {text:"알 수 없는 글자",confidence:90},{text:alternative,confidence:90},
    {text:"알 수 없는 글자",confidence:90},{text:options,confidence:90},
    {text:"알 수 없는 글자",confidence:90},
  ]);
  s.setWildsVisible(true);
  for(let i=0;i<13;i++)s.ui.preview();
  await s.ui.scan();
  assert.ok(s.observed.length<=1);
  s.ui.stop();
});

test("retry after a recorded Wilds result does not create another row", async () => {
  const options = "기초 공격력 강화Ⅱ\n기초 공격력 강화Ⅲ\n회심률 강화Ⅱ\n기초 공격력 강화 EX\n예리도 강화 EX";
  const s = setup(options);
  s.video.videoWidth=1920; s.video.videoHeight=1080;
  s.nodes["ocr-wilds-profile"].checked=true;
  s.nodes["ocr-wilds-profile"].dispatchEvent({type:"change"});
  s.setWildsVisible(true);
  for(let i=0;i<13;i++)s.ui.preview();
  await s.ui.scan();
  assert.equal(s.observed.length,1);
  s.nodes["ocr-retry"].click();
  await s.ui.scan();
  assert.equal(s.observed.length,1);
  s.ui.stop();
});


test("paused Wilds capture remains queued and resumes without missing a roll", async () => {
  const options="기초 공격력 강화Ⅱ\n기초 공격력 강화Ⅲ\n회심률 강화Ⅱ\n기초 공격력 강화 EX\n예리도 강화 EX";
  const s=setup(options);
  s.video.videoWidth=1920; s.video.videoHeight=1080;
  s.nodes["ocr-wilds-profile"].checked=true;
  s.nodes["ocr-wilds-profile"].dispatchEvent({type:"change"});
  s.nodes["ocr-toggle-pause"].click();
  s.setWildsVisible(true);
  for(let i=0;i<13;i++)s.ui.preview();
  await s.ui.scan();
  assert.equal(s.observed.length,0);
  assert.ok(s.nodes["ocr-wilds-progress"].textContent.includes("대기 1"));
  assert.ok(s.nodes["ocr-wilds-status"].textContent.includes("일시정지"));
  s.nodes["ocr-toggle-pause"].click();
  await s.ui.scan();
  assert.equal(s.observed.length,1);
  assert.ok(s.nodes["ocr-wilds-progress"].textContent.includes("완료 1"));
  assert.ok(s.nodes["ocr-wilds-history"].textContent.includes("입력 완료"));
  s.ui.stop();
});

test("OCR interrupted by pause restores its original frozen image batch", async () => {
  const options="기초 공격력 강화Ⅱ\n기초 공격력 강화Ⅲ\n회심률 강화Ⅱ\n기초 공격력 강화 EX\n예리도 강화 EX";
  const s=setup(options);
  s.video.videoWidth=1920; s.video.videoHeight=1080;
  s.nodes["ocr-wilds-profile"].checked=true;
  s.nodes["ocr-wilds-profile"].dispatchEvent({type:"change"});
  s.setWildsVisible(true);
  for(let i=0;i<13;i++)s.ui.preview();
  s.onRecognize(()=>s.nodes["ocr-toggle-pause"].click());
  await s.ui.scan();
  assert.equal(s.observed.length,0);
  assert.ok(s.nodes["ocr-wilds-progress"].textContent.includes("대기 1"));
  s.nodes["ocr-toggle-pause"].click();
  await s.ui.scan();
  assert.equal(s.observed.length,1);
  assert.equal(s.nodes["ocr-wilds-status"].textContent.includes("일시정지"),false);
  s.ui.stop();
});

test("failed Wilds OCR is retained for review and can retry the same captured images", async () => {
  const options="기초 공격력 강화Ⅱ\n기초 공격력 강화Ⅲ\n회심률 강화Ⅱ\n기초 공격력 강화 EX\n예리도 강화 EX";
  const s=setup("알 수 없는 옵션");
  s.video.videoWidth=1920; s.video.videoHeight=1080;
  s.nodes["ocr-wilds-profile"].checked=true;
  s.nodes["ocr-wilds-profile"].dispatchEvent({type:"change"});
  s.setWildsVisible(true);
  for(let i=0;i<13;i++)s.ui.preview();
  await s.ui.scan();
  assert.equal(s.observed.length,0);
  assert.ok(s.nodes["ocr-wilds-history"].textContent.includes("확인 필요"));
  s.setText(options);
  s.nodes["ocr-retry"].click();
  await s.ui.scan();
  assert.equal(s.observed.length,1);
  assert.equal(s.nodes["ocr-wilds-history"].textContent.includes("입력 완료"),true);
  s.nodes["ocr-retry"].click();
  await s.ui.scan();
  assert.equal(s.observed.length,1);
  s.ui.stop();
});


test("two restoration results captured during pause are processed FIFO after resume", async () => {
  const text = "기초 공격력 강화Ⅱ\n기초 공격력 강화Ⅲ\n회심률 강화Ⅱ\n기초 공격력 강화 EX\n예리도 강화 EX";
  const s=setup(text);
  s.video.videoWidth=1920;s.video.videoHeight=1080;
  s.nodes["ocr-wilds-profile"].checked=true;
  s.nodes["ocr-wilds-profile"].dispatchEvent({type:"change"});
  s.nodes["ocr-toggle-pause"].click();
  for(let event=0;event<2;event++) {
    s.setWildsVisible(false);
    for(let n=0;n<5;n++)s.ui.preview();
    s.setWildsVisible(true);
    for(let n=0;n<13;n++)s.ui.preview();
  }
  assert.ok(s.nodes["ocr-wilds-progress"].textContent.includes("대기 2"));
  await s.ui.scan();
  assert.equal(s.observed.length,0);
  s.nodes["ocr-toggle-pause"].click();
  await s.ui.scan();
  await s.ui.scan();
  assert.equal(s.observed.length,2);
  assert.ok(s.nodes["ocr-wilds-progress"].textContent.includes("완료 2"));
  s.ui.stop();
});

test("manual confirmation marks the recognized review item as done", async () => {
  const text = "기초 공격력 강화Ⅱ\n기초 공격력 강화Ⅲ\n회심률 강화Ⅱ\n기초 공격력 강화 EX\n예리도 강화 EX";
  const s=setup(text);
  s.video.videoWidth=1920;s.video.videoHeight=1080;
  s.nodes["ocr-wilds-profile"].checked=true;
  s.nodes["ocr-wilds-profile"].dispatchEvent({type:"change"});
  s.nodes["ocr-auto"].checked=false;
  s.setWildsVisible(true);
  for(let n=0;n<13;n++)s.ui.preview();
  await s.ui.scan();
  assert.equal(s.observed.length,0);
  assert.ok(s.nodes["ocr-wilds-progress"].textContent.includes("확인 필요 1"));
  s.nodes["ocr-apply-once"].click();
  assert.equal(s.observed.length,1);
  assert.ok(s.nodes["ocr-wilds-progress"].textContent.includes("완료 1"));
  s.nodes["ocr-retry"].click();
  await s.ui.scan();
  assert.equal(s.observed.length,1);
  s.ui.stop();
});
