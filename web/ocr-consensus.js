// Per-option votes across successive stable video captures.
// Every vote must come from a separate OCR pass; alternative preprocessings
// of the SAME image are selected upstream and must not be counted twice.
export function createOcrConsensus({ windowSize = 5, minVotes = 2, minimumConfidence = 35 } = {}) {
  let votes = [];
  let mode = null;
  function reset(nextMode = null) { votes = []; mode = nextMode; }
  function observe(result, confidence = 0) {
    if (!result?.mode || !["gogma","artian","skill"].includes(result.mode)) return null;
    if (result.mode !== mode) reset(result.mode);
    const numericConfidence = Math.min(100, Math.max(0, Number(confidence) || 0));
    if (numericConfidence >= minimumConfidence) {
      const sample = { result, confidence: numericConfidence };
      votes.push(sample);
      if (votes.length > windowSize) votes.shift();
    }
    if (result.mode === "skill") {
      const valid = votes.filter(s => s.result.complete && s.result.signature);
      const signatures = new Map();
      for (const sample of valid) {
        const key = sample.result.signature;
        const list = signatures.get(key) ?? [];
        list.push(sample);
        signatures.set(key, list);
      }
      const candidates = [...signatures.values()].sort((a,b)=>b.length-a.length ||
        b.reduce((s,x)=>s+x.confidence,0)-a.reduce((s,x)=>s+x.confidence,0));
      const best = candidates[0];
      if (!best || best.length < minVotes || (candidates[1]?.length ?? 0) >= best.length) return null;
      return { result: best[0].result, confidence: best.reduce((s,x)=>s+x.confidence,0)/best.length, support: best.length };
    }

    const positional = votes.map(sample => {
      const row = sample.result.slotIds?.length === 5 ? sample.result.slotIds
        : sample.result.complete && sample.result.ids?.length === 5 ? sample.result.ids : null;
      return row ? { row, confidence: sample.confidence } : null;
    }).filter(Boolean);
    const ids = [];
    const support = [];
    const confidences = [];
    for (let i = 0; i < 5; i++) {
      const counts = new Map();
      for (const sample of positional) {
        const id = sample.row[i];
        if (!Number.isInteger(id)) continue;
        const entry = counts.get(id) ?? { count: 0, totalConfidence: 0 };
        entry.count++;
        entry.totalConfidence += sample.confidence;
        counts.set(id, entry);
      }
      const choices = [...counts.entries()].sort((a,b)=>b[1].count-a[1].count ||
        b[1].totalConfidence-a[1].totalConfidence);
      const [selected, entry] = choices[0] ?? [];
      if (!entry || entry.count < minVotes ||
          (choices[1] && choices[1][1].count === entry.count)) return null;
      ids.push(selected);
      support.push(entry.count);
      confidences.push(entry.totalConfidence / entry.count);
    }
    return {
      result: {
        mode: result.mode, ids, complete: true, recognized: 5,
        labels: ids.map(String), lines: [],
        signature: `${result.mode}:${ids.join(",")}`,
      },
      confidence: Math.min(...confidences),
      support: Math.min(...support),
    };
  }
  return { observe, reset, count: () => votes.length };
}
