// The game's result lasts only a few seconds, so capture events are queued
// independently of the slower Korean OCR worker. In-flight work is NOT removed
// until committed or explicitly marked as needing review.
export function createWildsOcrQueue({ maxActive = 8, maxHistory = 20 } = {}) {
  let entries = [];
  let completed = 0;
  let dropped = 0;

  function activeCount() {
    return entries.filter(x => x.status === "pending" || x.status === "processing" || x.status === "review").length;
  }
  function enqueue(batch) {
    if (!Number.isInteger(batch?.id) || !Array.isArray(batch.snapshots) || !batch.snapshots.length) return false;
    if (entries.some(x => x.id === batch.id)) return false;
    if (activeCount() >= maxActive) { dropped++; return false; }
    entries.push({ id: batch.id, snapshots: batch.snapshots, status: "pending", recognized: 0, message: "" });
    compact();
    return true;
  }
  function compact() {
    while (entries.length > maxHistory) {
      const i = entries.findIndex(x => x.status === "done");
      if (i < 0) break;
      entries.splice(i, 1);
    }
  }
  function begin() {
    if (entries.some(x => x.status === "processing")) return null;
    const batch = entries.find(x => x.status === "pending");
    if (!batch) return null;
    batch.status = "processing";
    return batch;
  }
  function rollback(id) {
    // Passing the in-flight object guards against stale workers from an old
    // screen-share session changing a new event with a reused numeric ID.
    const batch = entries.find(x => typeof id === "object" ? x === id : x.id === id);
    if (!batch || batch.status !== "processing") return false;
    batch.status = "pending";
    return true;
  }
  function finish(id, status, { recognized = 0, message = "" } = {}) {
    const batch = entries.find(x => x.id === id);
    if (!batch || batch.status !== "processing" || !["done", "review"].includes(status)) return false;
    batch.status = status;
    batch.recognized = Math.max(0, Math.min(5, Math.floor(Number(recognized) || 0)));
    batch.message = String(message).slice(0, 150);
    if (status === "done") {
      completed++;
      batch.snapshots = []; // release pixel buffers after confirmed input
    }
    compact();
    return true;
  }
  function retry(id) {
    const batch = entries.find(x => x.id === id);
    if (!batch || batch.status !== "review" || !batch.snapshots?.length) return false;
    batch.status = "pending";
    batch.message = "";
    return true;
  }
  function confirmReview(id) {
    const batch = entries.find(x => x.id === id);
    if (!batch || batch.status !== "review") return false;
    batch.status = "done";
    batch.recognized = 5;
    batch.snapshots = [];
    completed++;
    compact();
    return true;
  }
  function clear() { entries = []; completed = 0; dropped = 0; }
  function counts() {
    return {
      pending: entries.filter(x => x.status === "pending").length,
      processing: entries.filter(x => x.status === "processing").length,
      review: entries.filter(x => x.status === "review").length,
      completed, dropped,
    };
  }
  function history() {
    return entries.map(x => ({ id: x.id, status: x.status, recognized: x.recognized, message: x.message }));
  }
  return { enqueue, begin, rollback, finish, confirmReview, retry, clear, counts, history };
}
