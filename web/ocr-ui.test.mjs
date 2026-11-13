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
  ui: readFileSync(new URL("./ocr-ui.js", import.meta.url), "utf8")
    .replace(/^import .*;\n/gm, "")
    .replace(/^export /gm, "")
    .replace(/initializeOcrUi\(\);\s*$/, ""),
};

function setup(initialText) {
  let frameLevel = 0;
  class Node {
    constructor(id) {
      this.id = id;
      this.dataset = {};
      this.listeners = new Map();
      this.disabled = false;
      this.hidden = false;
      this.checked = id === "ocr-auto";
      this.value = id === "ocr-mode" ? "gogma" : id === "ocr-preprocess" ? "enhanced" : "";
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
          const data = new Uint8ClampedArray(node.width === 192 ? 128 : 20);
          if (node.width === 192) {
            for (let i = 0; i < data.length; i += 4) {
              data[i] = data[i + 1] = data[i + 2] = frameLevel;
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
    "ocr-reset-area", "ocr-retry", "ocr-toggle-pause", "ocr-apply-once", "ocr-status",
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
          return { data: { text, confidence: 92 } };
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
    getItem: () => JSON.stringify({
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
    setFrame(value) { frameLevel = value; },
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
  assert.equal(s.getRecognitionCount(), 0);
  s.nodes["ocr-toggle-pause"].click();
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
  assert.equal(s.observed.length, 1);
  s.setFrame(160);
  s.setText("오류\n문자\n강화");
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
  s.setFrame(160);
  s.setText("회심률 강화Ⅲ\n기초 공격력 강화Ⅱ\n기초 공격력 강화Ⅱ\n회심률 강화 EX\n예리도 강화");
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
  assert.equal(s.observed.length, 1);
  s.nodes["ocr-retry"].click();
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
  const saved = s.nodes["ocr-recognized"].textContent;
  s.setFrame(170);
  s.setText("회심률 강화Ⅲ\n기초 공격력 강화Ⅱ\n기초 공격력 강화Ⅱ\n회심률 강화 EX\n예리도 강화");
  await s.ui.scan();
  assert.equal(s.nodes["ocr-recognized"].textContent, saved);
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
  assert.equal(s.observed.length, 1);
  assert.deepEqual([...s.observed[0].ids], [8, 12, 9, 15, 10]);
  s.ui.stop();
});
