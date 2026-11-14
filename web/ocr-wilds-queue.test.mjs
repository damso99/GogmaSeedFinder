import assert from "node:assert/strict";
import test from "node:test";
import { createWildsOcrQueue } from "./ocr-wilds-queue.js";

const item = id => ({ id, snapshots: [{frame:id}] });

test("paused capture stays queued, and is not removed by OCR begin", () => {
  const q=createWildsOcrQueue();
  assert.equal(q.enqueue(item(1)),true);
  assert.equal(q.counts().pending,1);
  assert.equal(q.begin().id,1);
  assert.equal(q.counts().processing,1);
  assert.equal(q.begin(),null);
  assert.equal(q.rollback(1),true);
  assert.equal(q.begin().id,1);
  assert.equal(q.finish(1,"done",{recognized:5}),true);
  assert.equal(q.counts().completed,1);
  assert.deepEqual(q.history()[0],{id:1,status:"done",recognized:5,message:""});
});

test("queue retries review-only batches, never committed ones", () => {
  const q=createWildsOcrQueue();
  q.enqueue(item(1));q.enqueue(item(2));
  q.begin();q.finish(1,"review",{recognized:3,message:"OCR 3/5"});
  q.begin();q.finish(2,"done",{recognized:5});
  assert.equal(q.retry(2),false);
  assert.equal(q.retry(1),true);
  assert.equal(q.begin().id,1);
  assert.equal(q.finish(1,"done",{recognized:5}),true);
  assert.equal(q.counts().completed,2);
});

test("queue respects FIFO, never drops an item silently", () => {
  const q=createWildsOcrQueue({maxActive:2});
  assert.equal(q.enqueue(item(1)),true);
  assert.equal(q.enqueue(item(2)),true);
  assert.equal(q.enqueue(item(3)),false);
  assert.equal(q.counts().dropped,1);
  assert.equal(q.begin().id,1);
  q.finish(1,"done");
  assert.equal(q.enqueue(item(3)),true);
  assert.equal(q.begin().id,2);
});

test("unfinished frames are kept; finished frame buffers are freed", () => {
  const q=createWildsOcrQueue();
  q.enqueue(item(1));q.enqueue(item(2));
  q.begin();q.finish(1,"review",{recognized:2});
  assert.equal(q.begin().id,2);
  q.finish(2,"done",{recognized:5});
  assert.equal(q.history()[0].status,"review");
  assert.equal(q.history()[1].status,"done");
  assert.equal(q.counts().review,1);
});

test("queue bounds history and prevents duplicate event IDs", () => {
  const q=createWildsOcrQueue({maxHistory:3});
  for(let id=1;id<=6;id++){assert.equal(q.enqueue(item(id)),true);q.begin();q.finish(id,"done");}
  assert.equal(q.history().length,3);
  assert.deepEqual(q.history().map(x=>x.id),[4,5,6]);
  assert.equal(q.enqueue(item(6)),false);
});
