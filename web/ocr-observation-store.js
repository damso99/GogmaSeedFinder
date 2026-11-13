// OCR observations are distinct from the base seed/counter state.
// Save only confirmed/explicitly edited observations so a page reload never
// discards expensive in-game rolls and restores the built-in demo samples.
export const OCR_OBSERVATIONS_KEY = "gogma-ocr-observations-v1";
const MAX_ROWS = 200;
const MODES = ["gogma", "artian", "skill"];

function validRow(mode, row) {
  if (mode === "skill") {
    return row && typeof row === "object" &&
      ["seriesIndex", "groupIndex"].every((key) =>
        row[key] === null ||
        (Number.isInteger(row[key]) && row[key] >= 0 && row[key] <= 100)
      );
  }
  return Array.isArray(row) && row.length === 5 && row.every((value) =>
    value === null || (Number.isInteger(value) && value >= 0 && value <= 32)
  );
}

export function validateOcrSnapshot(mode, value) {
  if (!MODES.includes(mode) || !value || typeof value !== "object") return null;
  if (!Number.isInteger(value.weaponType) || value.weaponType < 0 || value.weaponType > 13 ||
      !Number.isInteger(value.attributeForce) || value.attributeForce < 0 || value.attributeForce > 9 ||
      !Array.isArray(value.rows) || !value.rows.length || value.rows.length > MAX_ROWS ||
      !value.rows.every((row) => validRow(mode, row))) return null;
  return {
    weaponType: value.weaponType,
    attributeForce: value.attributeForce,
    rows: value.rows.map((row) => mode === "skill"
      ? { seriesIndex: row.seriesIndex, groupIndex: row.groupIndex }
      : [...row]),
  };
}

export function loadOcrSnapshots(storage) {
  let raw;
  try {
    raw = JSON.parse(storage?.getItem(OCR_OBSERVATIONS_KEY) ?? "null");
  } catch {
    return {};
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result = {};
  for (const mode of MODES) {
    const validated = validateOcrSnapshot(mode, raw[mode]);
    if (validated) result[mode] = validated;
  }
  return result;
}

export function saveOcrSnapshot(storage, mode, snapshot) {
  const valid = validateOcrSnapshot(mode, snapshot);
  if (!valid) return false;
  const snapshots = loadOcrSnapshots(storage);
  snapshots[mode] = valid;
  try {
    storage?.setItem(OCR_OBSERVATIONS_KEY, JSON.stringify(snapshots));
    return true;
  } catch {
    return false;
  }
}

export function clearOcrSnapshot(storage, mode) {
  if (!MODES.includes(mode)) return false;
  const snapshots = loadOcrSnapshots(storage);
  delete snapshots[mode];
  try {
    storage?.setItem(OCR_OBSERVATIONS_KEY, JSON.stringify(snapshots));
    return true;
  } catch {
    return false;
  }
}

export function lastSavedOcrSignature(mode, snapshot) {
  const validated = validateOcrSnapshot(mode, snapshot);
  if (!validated) return null;
  const finished = validated.rows.filter((row) => mode === "skill"
    ? Number.isInteger(row.seriesIndex) && Number.isInteger(row.groupIndex)
    : row.every((id) => Number.isInteger(id)));
  if (!finished.length) return null;
  const last = finished[finished.length - 1];
  return mode === "skill"
    ? `skill:${last.seriesIndex}:${last.groupIndex}`
    : `${mode}:${last.join(",")}`;
}
