import { KO_TEXT } from "./ko-locale.js";

// The numeric IDs must match app.js and artian-base-rng.js. Never derive IDs
// from translated select labels: users can switch the site language.
export const GOGMA_IDS = Object.freeze({
  attack: Object.freeze({ II: 8, III: 12, EX: 15 }),
  affinity: Object.freeze({ II: 9, III: 13, EX: 16 }),
  element: Object.freeze({ II: 11, EX: 14 }),
  sharpness: Object.freeze({ I: 6, EX: 10 }),
});
export const ARTIAN_IDS = Object.freeze({
  attack: 4, element: 6, sharpness: 7, affinity: 8,
});
const SERIES_JP = [
  "闢獣の力", "火竜の力", "暗器蛸の力", "鎧竜の守護", "雪獅子の闘志",
  "兇爪竜の力", "雷顎竜の闘志", "波衣竜の守護", "煌雷竜の力",
  "獄焔蛸の反逆", "凍峰竜の反逆", "黒蝕竜の力", "鎖刃竜の飢餓",
  "護鎖刃竜の命脈", "泡狐竜の力", "白熾龍の脈動", "海竜の渦雷",
  "千刃竜の闘志", "巨戟龍の黙示録", "暗黒騎士の証", "オメガレゾナンス",
];
const GROUP_JP = [
  "甲虫の知らせ", "甲虫の擬態", "革細工の柔性", "革細工の滑性",
  "鱗張りの技法", "鱗重ねの工夫", "毛皮の昂揚", "毛皮の誘惑",
  "ヌシの誇り", "ヌシの憤激", "護竜の脈動", "護竜の守り",
  "先達の導き", "ヌシの魂",
];

export function normalizeOcrText(value) {
  return String(value ?? "").normalize("NFKC")
    .toUpperCase()
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/[\s·ㆍ:：_\-–—|()[\]{}.,，。'“”]/g, "")
    .replace(/鍊/g, "練");
}

function classifyBonus(line) {
  const s = normalizeOcrText(line);
  if (/기초공격력|기본공격력|공격력강화|基礎攻撃力/.test(s)) return "attack";
  if (/회심률|회심강화|会心率/.test(s)) return "affinity";
  if (/속성강화|속성치강화|属性強化/.test(s)) return "element";
  if (/예리도|장전수|장전강화|斬れ味|装填/.test(s)) return "sharpness";
  return null;
}

function bonusTier(line) {
  const s = normalizeOcrText(line);
  // NFKC converts Ⅱ/Ⅲ/ＥＸ to II/III/EX, but OCR sometimes reads digits.
  // Read the grade only after the 강화/強化 label; do not confuse +5 stats with grades.
  const m = s.match(/(?:강화|強化)(EX|E[X×]|III|II|I|3|2|1)(?![A-Z])/);
  if (!m) return null;
  if (m[1] === "EX" || m[1] === "E×") return "EX";
  if (m[1] === "III" || m[1] === "3") return "III";
  if (m[1] === "II" || m[1] === "2") return "II";
  return "I";
}

export function matchBonusLine(line, mode) {
  const type = classifyBonus(line);
  if (!type) return null;
  if (mode === "artian") {
    // Do not silently misfile a graded Gogma bonus as a base Artian result.
    if (bonusTier(line) !== null) return null;
    return ARTIAN_IDS[type];
  }
  if (mode !== "gogma") return null;
  let tier = bonusTier(line);
  if (type === "sharpness" && tier === null) tier = "I";
  const id = GOGMA_IDS[type][tier];
  return Number.isInteger(id) ? id : null;
}

function findSkillIndices(text, jpNames) {
  const normalized = normalizeOcrText(text);
  const hits = [];
  jpNames.forEach((name, index) => {
    const localized = KO_TEXT[name];
    if ([name, localized].some((candidate) =>
      candidate && normalized.includes(normalizeOcrText(candidate))
    )) hits.push(index);
  });
  return hits;
}

export function parseOcrResult(mode, text) {
  const lines = String(text ?? "").split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (mode === "skill") {
    const seriesHits = findSkillIndices(text, SERIES_JP);
    const groupHits = findSkillIndices(text, GROUP_JP);
    const valid = seriesHits.length === 1 && groupHits.length === 1;
    return {
      mode, complete: valid, recognized: seriesHits.length + groupHits.length,
      lines, seriesIndex: valid ? seriesHits[0] : null,
      groupIndex: valid ? groupHits[0] : null,
      labels: valid ? [KO_TEXT[SERIES_JP[seriesHits[0]]], KO_TEXT[GROUP_JP[groupHits[0]]]] : [],
      signature: valid ? `skill:${seriesHits[0]}:${groupHits[0]}` : null,
    };
  }

  // Keep positions only when the OCR region contains exactly five lines.
  // Never shift a missing middle option into the preceding slot: slot order
  // is essential for the seed search.
  const slotIds = lines.length === 5
    ? lines.map((line) => matchBonusLine(line, mode))
    : [];
  const mapped = lines.map((line) => ({ line, id: matchBonusLine(line, mode) }))
    .filter((result) => result.id !== null);
  const ids = mapped.map(({ id }) => id);
  const complete = ids.length === 5;
  return {
    mode, complete, recognized: ids.length, lines,
    ids: complete ? ids : [],
    slotIds,
    labels: mapped.map(({ line }) => line),
    signature: complete ? `${mode}:${ids.join(",")}` : null,
  };
}

// OCR can fail transiently while showing the very same roll. An incomplete
// reading must NEVER rearm an already-recorded result: only a different,
// stable result, or an explicit manual entry, may create the next row.
export function createOcrSequencer({ stablePasses = 2 } = {}) {
  let pending = null;
  let pendingCount = 0;
  let lastApplied = null;

  return {
    observe(result) {
      if (!result?.complete || !result.signature) {
        pending = null;
        pendingCount = 0;
        return false;
      }
      if (result.signature !== pending) {
        pending = result.signature;
        pendingCount = 1;
      } else {
        pendingCount++;
      }
      if (pendingCount < stablePasses) return false;
      // Repeated rolls can be deliberately added with the manual button,
      // but noisy intermediate OCR must never cause an automatic duplicate.
      return lastApplied !== result.signature;
    },
    applied(result) {
      lastApplied = result.signature;
      pending = result.signature;
      pendingCount = 0;
    },
    alreadyApplied(signature) {
      return signature === lastApplied;
    },
    clearPending() {
      pending = null;
      pendingCount = 0;
    },
    reset() {
      pending = null;
      pendingCount = 0;
      lastApplied = null;
    },
  };
}
