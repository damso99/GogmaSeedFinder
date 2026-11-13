// Optional accurate OCR fallback for five restoration lines (two skill lines).
// Unlike a full-screen pass, each recognition is anchored to one fixed row.
// This is intentionally on-demand because five worker passes cost more CPU.
export function splitResultRows(doc, sourceCanvas, rowCount, padding = 18) {
  if (!sourceCanvas?.width || !sourceCanvas?.height || !(rowCount > 0)) return [];
  const margin = Math.min(padding, sourceCanvas.height / 10, sourceCanvas.width / 10);
  const contentWidth = sourceCanvas.width - margin * 2;
  const contentHeight = sourceCanvas.height - margin * 2;
  if (contentWidth <= 0 || contentHeight <= 0) return [];
  const results = [];
  for (let i = 0; i < rowCount; i++) {
    const top = margin + contentHeight * i / rowCount;
    const bottom = margin + contentHeight * (i + 1) / rowCount;
    const rowHeight = bottom - top;
    const row = doc.createElement("canvas");
    // A small white band prevents letter descenders or roman numerals
    // from touching the OCR segmentation border.
    row.width = Math.ceil(contentWidth + padding * 2);
    row.height = Math.ceil(rowHeight + padding * 2);
    const ctx = row.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, row.width, row.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(sourceCanvas, margin, top, contentWidth, rowHeight,
      padding, padding, contentWidth, rowHeight);
    results.push(row);
  }
  return results;
}

export async function recognizeResultRows(worker, doc, canvas, mode) {
  const count = mode === "skill" ? 2 : 5;
  const rows = splitResultRows(doc, canvas, count);
  if (rows.length !== count) return null;
  const texts = [];
  let confidenceSum = 0;
  try {
    await worker.setParameters?.({ tessedit_pageseg_mode: "7" });
    for (const row of rows) {
      const result = await worker.recognize(row);
      texts.push(String(result?.data?.text ?? "").trim().replace(/\r?\n/g, " "));
      confidenceSum += Math.max(0, Number(result?.data?.confidence) || 0);
    }
  } finally {
    await worker.setParameters?.({ tessedit_pageseg_mode: "6" });
  }
  return { data: { text: texts.join("\n"), confidence: confidenceSum / count } };
}
