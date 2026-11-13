import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("./screen-capture.js", import.meta.url), "utf8")
  .replace(/^import .*;\n/gm, "")
  .replace(/^export /gm, "");

function setup({ supported = true, denied = false } = {}) {
  class Element {
    constructor() {
      this.listeners = {};
      this.dataset = {};
      this.disabled = false;
      this.open = false;
      this.srcObject = null;
      this.textContent = "";
    }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    click() { this.listeners.click?.(); }
    showModal() { this.open = true; }
    close() { this.open = false; }
    pause() {}
    play() { return Promise.resolve(); }
  }
  const ids = [
    "capture-start", "capture-stop", "capture-guide", "capture-guide-cancel",
    "capture-guide-confirm", "capture-status", "capture-video",
  ];
  const nodes = Object.fromEntries(ids.map((id) => [id, new Element()]));
  nodes["capture-stop"].disabled = true;
  const track = {
    readyState: "live",
    addEventListener(name, fn) { this[name] = fn; },
    getSettings() { return { width: 1920, height: 1080 }; },
    stop() { this.readyState = "ended"; },
  };
  const stream = {
    getVideoTracks() { return [track]; },
    getTracks() { return [track]; },
  };
  let requests = 0;
  const navigator = {
    mediaDevices: supported ? {
      getDisplayMedia() {
        requests++;
        return denied ? Promise.reject({ name: "NotAllowedError" }) : Promise.resolve(stream);
      },
    } : undefined,
  };
  const context = vm.createContext({
    getLocale: () => "ko",
    document: {
      querySelector: (selector) => nodes[selector.slice(1)],
      querySelectorAll: () => [],
      dispatchEvent() {},
    },
    navigator,
    window: { isSecureContext: true, addEventListener() {} },
    CustomEvent: class {},
  });
  vm.runInContext(source, context);
  return { nodes, track, stream, getRequests: () => requests };
}

test("sharing asks for borderless windowed mode before opening the browser picker", () => {
  const { nodes, getRequests } = setup();
  nodes["capture-start"].click();
  assert.equal(nodes["capture-guide"].open, true);
  assert.equal(getRequests(), 0);
  nodes["capture-guide-cancel"].click();
  assert.equal(nodes["capture-guide"].open, false);
  assert.equal(getRequests(), 0);
});

test("sharing starts only after confirmation and releases tracks on stop", async () => {
  const { nodes, stream, track, getRequests } = setup();
  nodes["capture-start"].click();
  nodes["capture-guide-confirm"].click();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(getRequests(), 1);
  assert.equal(nodes["capture-guide"].open, false);
  assert.equal(nodes["capture-video"].srcObject, stream);
  assert.equal(nodes["capture-stop"].disabled, false);
  assert.match(nodes["capture-status"].textContent, /화면 공유 중/);
  nodes["capture-stop"].click();
  assert.equal(track.readyState, "ended");
  assert.equal(nodes["capture-video"].srcObject, null);
  assert.equal(nodes["capture-start"].disabled, false);
});

test("permission denial leaves screen sharing ready for another attempt", async () => {
  const { nodes } = setup({ denied: true });
  nodes["capture-start"].click();
  nodes["capture-guide-confirm"].click();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(nodes["capture-start"].disabled, false);
  assert.match(nodes["capture-status"].textContent, /권한/);
});

test("unsupported browsers show an explanation without opening the guide", () => {
  const { nodes } = setup({ supported: false });
  nodes["capture-start"].click();
  assert.equal(nodes["capture-guide"].open, false);
  assert.match(nodes["capture-status"].textContent, /지원하지 않습니다/);
});
