import { getLocale } from "./i18n.js";
import { createOcrSequencer, parseOcrResult } from "./ocr-parser.js";
import { createFrameThrottle } from "./ocr-frame.js";

const OCR_SCRIPT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
const OCR_INTERVAL_MS = 1800;
const PREVIEW_INTERVAL_MS = 180;
const MIN_AUTO_CONFIDENCE = 42;
const REGIONS_STORAGE_KEY = "gogma-ocr-regions-v1";

const TEXT = {
  ko: {
    heading: "복원 결과 자동 입력",
    description: "인식할 신규 옵션 5줄(스킬은 2줄)만 게임 화면에서 드래그해 선택하세요.",
    modeLabel: "인식 대상",
    gogma: "거극 아티어 복원",
    artian: "일반 아티어 복원",
    skill: "스킬 재부여",
    auto: "안정적으로 인식되면 자동 입력",
    preprocessLabel: "글자 배경",
    light: "어두운 배경 · 밝은 글자",
    dark: "밝은 배경 · 어두운 글자",
    original: "전처리 없이 원본 인식",
    resetArea: "영역 다시 지정",
    retry: "다시 인식",
    pause: "인식 일시정지",
    resume: "인식 재개",
    applyOnce: "인식 결과 한 번 입력",
    selectArea: "미리보기에서 새 결과 텍스트만 드래그해 인식 영역을 지정하세요.",
    recognized: "최근 인식 결과",
    hint: "비교 화면에서는 기존 옵션을 제외하고 신규 결과만 선택하세요. 5개 옵션(스킬은 2개)을 모두 읽어야 자동 입력합니다. 화면 이미지는 외부 서버로 전송하지 않으며 브라우저 내부에서 처리합니다. 최초 실행 시 OCR 코드와 한국어 모델을 내려받습니다.",
    reading: "게임 화면 인식 중…",
    loading: "한국어 OCR 모델 불러오는 중… (최초 실행은 오래 걸릴 수 있습니다)",
    partial: "인식된 옵션: ",
    ready: "입력 준비 완료: ",
    waiting: "동일한 결과를 한 번 더 확인하는 중…",
    visualWaiting: "옵션은 읽었지만 실제 화면 변경이 확인되지 않아 자동 입력을 보류했습니다. 결과를 확인하고 수동 입력할 수 있습니다.",
    lowConfidence: "인식 신뢰도가 낮아 자동 입력을 보류했습니다. 결과를 확인하고 수동 입력하세요.",
    duplicate: "현재 결과는 이미 입력되어 있습니다. 같은 화면에서는 인식을 반복하거나 새 행을 추가하지 않습니다. 실제로 동일한 결과가 연속 출현했다면 수동 입력하세요.",
    paused: "인식이 일시정지되었습니다.",
    failure: "OCR 로딩 또는 인식에 실패했습니다. 인터넷 연결과 브라우저 설정을 확인해 주세요.",
    noResult: "선택된 영역에 해당 옵션이 없습니다. 새 결과 표시 영역만 다시 지정해 주세요.",
    noApp: "입력 화면과 연결되지 않았습니다. 사이트를 새로고침해 주세요.",
  },
  en: {
    heading: "Auto-fill from game screen",
    description: "Drag a region containing only the five new bonus lines (two for skills).",
    modeLabel: "Recognition target",
    gogma: "Gogma reinforcement",
    artian: "Base Artian reinforcement",
    skill: "Skill reset",
    auto: "Auto-fill after stable recognition",
    preprocessLabel: "Text background",
    light: "Dark background · light text",
    dark: "Light background · dark text",
    original: "Original image",
    resetArea: "Reselect region",
    retry: "Read again",
    pause: "Pause recognition",
    resume: "Resume recognition",
    applyOnce: "Add recognized result once",
    selectArea: "Drag over the NEW result text in the game preview.",
    recognized: "Latest OCR",
    hint: "On comparison screens, select only the new results, not the old ones. Five bonuses (or two skills) must be recognized. Frames stay in your browser; OCR code and language data are downloaded on first use.",
    reading: "Recognizing game screen…",
    loading: "Loading Korean OCR model (first run may take longer)…",
    partial: "Recognized options: ",
    ready: "Ready to apply: ",
    waiting: "Confirming the same result again…",
    visualWaiting: "No meaningful screen change detected. Auto-fill withheld; verify and use manual add if appropriate.",
    lowConfidence: "Recognition confidence is low. Auto-fill paused; inspect before adding manually.",
    duplicate: "Already recorded this result. Move to the next result, or use the manual add button for an identical consecutive roll.",
    paused: "Recognition paused.",
    failure: "OCR initialization or recognition failed. Check the internet connection and browser.",
    noResult: "No matching options inside the selected region. Reselect the new result.",
    noApp: "Calculator not ready. Reload the page.",
  },
  ja: {
    heading: "画面から結果を自動入力",
    description: "新しい結果の5項目（スキルは2項目）だけをドラッグして選択してください。",
    modeLabel: "認識対象",
    gogma: "巨戟アーティア復元",
    artian: "通常アーティア復元",
    skill: "スキル再付与",
    auto: "安定して認識したら自動入力",
    preprocessLabel: "文字の背景",
    light: "暗い背景・明るい文字",
    dark: "明るい背景・暗い文字",
    original: "画像のまま",
    resetArea: "範囲を再選択",
    retry: "もう一度認識",
    pause: "認識を一時停止",
    resume: "認識を再開",
    applyOnce: "認識結果を1回入力",
    selectArea: "プレビューで新しい結果の文字部分だけをドラッグしてください。",
    recognized: "直近の認識結果",
    hint: "比較画面では新しい結果だけを選んでください。5項目（スキルは2項目）がそろうと入力できます。画像はブラウザ内のみで処理し、初回は韓国語OCRモデルをダウンロードします。",
    reading: "画面認識中…",
    loading: "韓国語OCRモデル読込中…",
    partial: "認識した項目: ",
    ready: "入力可能: ",
    waiting: "同じ結果を再確認中…",
    visualWaiting: "画面の変化が確認できないため自動入力を保留しています。必要な場合は手動で追加してください。",
    lowConfidence: "認識精度が低いため自動入力を保留しました。手動で確認してください。",
    duplicate: "すでに入力した結果です。次の結果へ進むか、同一の連続結果なら手動で追加してください。",
    paused: "認識を一時停止しました。",
    failure: "OCRの読込に失敗しました。接続とブラウザ設定をご確認ください。",
    noResult: "指定範囲に認識できる結果がありません。範囲を選び直してください。",
    noApp: "計算機の準備ができていません。再読み込みしてください。",
  },
  "zh-Hant": {
    heading: "遊戲畫面自動填入",
    description: "拖曳並選取只有五項新加成（技能為兩項）的區域。",
    modeLabel: "辨識目標",
    gogma: "巨戟機械武器復原",
    artian: "一般機械武器復原",
    skill: "技能重新附加",
    auto: "辨識穩定後自動填入",
    preprocessLabel: "文字背景",
    light: "深色背景·淺色文字",
    dark: "淺色背景·深色文字",
    original: "原始影像",
    resetArea: "重新選取區域",
    retry: "重新辨識",
    pause: "暫停辨識",
    resume: "繼續辨識",
    applyOnce: "輸入辨識結果一次",
    selectArea: "請在預覽中拖曳並選擇新結果文字區域。",
    recognized: "最近辨識結果",
    hint: "比較畫面請只選取新結果，不要包含舊結果。必須辨識到五項加成（或兩項技能）才會填入。畫面僅於瀏覽器內處理，首次需要下載OCR程式及韓文模型。",
    reading: "辨識遊戲畫面中…",
    loading: "載入韓文OCR模型中…",
    partial: "已辨識項目：",
    ready: "可填入：",
    waiting: "正在再次確認相同結果…",
    visualWaiting: "尚未偵測到畫面變更，已暫緩自動輸入。必要時請手動新增。",
    lowConfidence: "辨識可信度偏低，暫停自動填入。請確認後手動輸入。",
    duplicate: "此結果已輸入。請切換至下個結果；連續相同結果可用手動新增。",
    paused: "辨識已暫停。",
    failure: "OCR載入或辨識失敗。請檢查網路與瀏覽器設定。",
    noResult: "選定範圍沒有可辨識的結果。請重新選取新結果區域。",
    noApp: "計算器尚未就緒。請重新載入網頁。",
  },
};

let tesseractLoading = null;
function loadTesseract(doc = document) {
  if (window.Tesseract?.createWorker) return Promise.resolve(window.Tesseract);
  if (tesseractLoading) return tesseractLoading;
  tesseractLoading = new Promise((resolve, reject) => {
    const script = doc.createElement("script");
    script.src = OCR_SCRIPT_URL;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => window.Tesseract?.createWorker
      ? resolve(window.Tesseract)
      : reject(new Error("OCR library unavailable"));
    script.onerror = () => reject(new Error("OCR download failed"));
    doc.head.append(script);
  }).catch((error) => {
    tesseractLoading = null;
    throw error;
  });
  return tesseractLoading;
}

function getStoredRegions() {
  try {
    const value = JSON.parse(localStorage.getItem(REGIONS_STORAGE_KEY) ?? "{}");
    if (value && typeof value === "object") return value;
  } catch { /* Storage may be unavailable. */ }
  return {};
}

function validRegion(region) {
  return region && ["x", "y", "w", "h"].every((key) => Number.isFinite(region[key]))
    && region.x >= 0 && region.y >= 0 && region.w > 0.03 && region.h > 0.02
    && region.x + region.w <= 1.001 && region.y + region.h <= 1.001;
}

export function initializeOcrUi(doc = document) {
  const $ = (selector) => doc.querySelector(selector);
  const panel = $("#ocr-panel");
  const preview = $("#ocr-preview");
  if (!panel || !preview) return null;
  const modeSelect = $("#ocr-mode");
  const processSelect = $("#ocr-preprocess");
  const autoCheck = $("#ocr-auto");
  const resetButton = $("#ocr-reset-area");
  const retryButton = $("#ocr-retry");
  const pauseButton = $("#ocr-toggle-pause");
  const applyButton = $("#ocr-apply-once");
  const status = $("#ocr-status");
  const output = $("#ocr-recognized");
  const translations = TEXT[getLocale()] ?? TEXT.ko;
  doc.querySelectorAll("[data-ocr-text]").forEach((node) => {
    const translation = translations[node.dataset.ocrText];
    if (translation) node.textContent = translation;
  });

  const context = preview.getContext("2d", { willReadFrequently: false });
  const workCanvas = doc.createElement("canvas");
  const workContext = workCanvas.getContext("2d", { willReadFrequently: true });
  // Inspect original pixels independently from unreliable OCR text.
  const frameCanvas = doc.createElement("canvas");
  frameCanvas.width = 192;
  frameCanvas.height = 108;
  const frameContext = frameCanvas.getContext("2d", { willReadFrequently: true });
  const frameThrottle = createFrameThrottle({ maxScansPerView: 3 });
  const regions = getStoredRegions();
  const sequencers = {
    gogma: createOcrSequencer(),
    artian: createOcrSequencer(),
    skill: createOcrSequencer(),
  };

  let video = null;
  let session = 0;
  let previewTimer = null;
  let scanTimer = null;
  let paused = false;
  let running = false;
  let workerPromise = null;
  let lastResult = null;
  let lastConfidence = 0;
  let displayedConfidence = 0;
  let lastRejectedSignature = null;
  let lastRejectedMessage = "";
  let currentFrame = null;
  let region = validRegion(regions[modeSelect.value]) ? regions[modeSelect.value] : null;
  let pointerOrigin = null;
  let pointerRegion = null;

  function setStatus(text, state = "info") {
    if (status.textContent !== text) status.textContent = text;
    if (status.dataset.state !== state) status.dataset.state = state;
  }

  function resetReading() {
    lastResult = null;
    lastConfidence = 0;
    displayedConfidence = 0;
    lastRejectedSignature = null;
    lastRejectedMessage = "";
    frameThrottle.reset();
    currentFrame = null;
    applyButton.disabled = true;
    output.textContent = "—";
    setStatus(region ? translations.reading : translations.selectArea);
  }

  function screenPoint(event) {
    const rect = preview.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  }

  function selectionFromCorners(a, b) {
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: Math.abs(a.x - b.x),
      h: Math.abs(a.y - b.y),
    };
  }

  preview.addEventListener("pointerdown", (event) => {
    if (!video || event.button !== 0) return;
    pointerOrigin = screenPoint(event);
    pointerRegion = null;
    preview.setPointerCapture?.(event.pointerId);
  });
  preview.addEventListener("pointermove", (event) => {
    if (!pointerOrigin) return;
    pointerRegion = selectionFromCorners(pointerOrigin, screenPoint(event));
  });
  preview.addEventListener("pointerup", (event) => {
    if (!pointerOrigin) return;
    const chosen = selectionFromCorners(pointerOrigin, screenPoint(event));
    pointerOrigin = null;
    pointerRegion = null;
    if (!validRegion(chosen)) {
      setStatus(translations.selectArea);
      return;
    }
    region = chosen;
    regions[modeSelect.value] = chosen;
    try { localStorage.setItem(REGIONS_STORAGE_KEY, JSON.stringify(regions)); } catch {}
    sequencers[modeSelect.value].clearPending();
    session++;
    resetReading();
  });
  preview.addEventListener("pointercancel", () => {
    pointerOrigin = null;
    pointerRegion = null;
  });

  function drawPreview() {
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
    const h = Math.max(160, Math.round(960 * video.videoHeight / video.videoWidth));
    if (preview.width !== 960 || preview.height !== h) {
      preview.width = 960;
      preview.height = h;
    }
    context.drawImage(video, 0, 0, preview.width, preview.height);
    const area = pointerRegion ?? region;
    if (area) {
      const x = area.x * preview.width;
      const y = area.y * preview.height;
      const w = area.w * preview.width;
      const h = area.h * preview.height;
      context.fillStyle = "rgba(0,0,0,0.36)";
      context.fillRect(0, 0, preview.width, preview.height);
      context.drawImage(video, area.x * video.videoWidth, area.y * video.videoHeight,
        area.w * video.videoWidth, area.h * video.videoHeight, x, y, w, h);
      context.lineWidth = 3;
      context.strokeStyle = "#f0d27c";
      context.strokeRect(x, y, w, h);
    }
  }

  function snapshotRegion() {
    if (!video?.videoWidth || !video.videoHeight || !validRegion(region)) return null;
    const x = Math.floor(region.x * video.videoWidth);
    const y = Math.floor(region.y * video.videoHeight);
    const width = Math.min(video.videoWidth - x, Math.ceil(region.w * video.videoWidth));
    const height = Math.min(video.videoHeight - y, Math.ceil(region.h * video.videoHeight));
    if (width < 25 || height < 15) return null;
    frameContext.drawImage(video, x, y, width, height, 0, 0, frameCanvas.width, frameCanvas.height);
    const bytes = frameContext.getImageData(0, 0, frameCanvas.width, frameCanvas.height).data;
    const frame = new Uint8Array(Math.floor(bytes.length / 4));
    for (let i = 0; i < frame.length; i++) {
      const p = i * 4;
      frame[i] = Math.round(bytes[p] * 0.2126
        + bytes[p + 1] * 0.7152 + bytes[p + 2] * 0.0722);
    }
    return frame;
  }

  function captureRegion(preprocess = processSelect.value) {
    if (!video?.videoWidth || !video.videoHeight || !validRegion(region)) return null;
    const left = Math.floor(region.x * video.videoWidth);
    const top = Math.floor(region.y * video.videoHeight);
    const width = Math.min(video.videoWidth - left, Math.ceil(region.w * video.videoWidth));
    const height = Math.min(video.videoHeight - top, Math.ceil(region.h * video.videoHeight));
    if (width < 25 || height < 15) return null;
    const scale = Math.max(1, Math.min(2.4, 1900 / width));
    workCanvas.width = Math.round(width * scale);
    workCanvas.height = Math.round(height * scale);
    workContext.drawImage(video, left, top, width, height,
      0, 0, workCanvas.width, workCanvas.height);
    if (preprocess !== "original") {
      const frame = workContext.getImageData(0, 0, workCanvas.width, workCanvas.height);
      const data = frame.data;
      const brightLetters = preprocess === "light";
      const histogram = new Uint32Array(256);
      const brightnesses = new Uint8Array(data.length / 4);
      let totalBrightness = 0;
      for (let i = 0; i < brightnesses.length; i++) {
        const p = i * 4;
        const lightness = Math.round(
          data[p] * 0.2126 + data[p + 1] * 0.7152 + data[p + 2] * 0.0722,
        );
        brightnesses[i] = lightness;
        histogram[lightness]++;
        totalBrightness += lightness;
      }
      // Dynamic Otsu threshold retains Korean strokes across different
      // brightness settings, unlike the former hard-coded 151/108 cutoffs.
      let bestVariance = -1;
      let threshold = 128;
      let backgroundPixels = 0;
      let backgroundBrightness = 0;
      for (let i = 0; i < 256; i++) {
        backgroundPixels += histogram[i];
        backgroundBrightness += i * histogram[i];
        const foregroundPixels = brightnesses.length - backgroundPixels;
        if (!backgroundPixels || !foregroundPixels) continue;
        const difference = backgroundBrightness / backgroundPixels
          - (totalBrightness - backgroundBrightness) / foregroundPixels;
        const variance = backgroundPixels * foregroundPixels * difference * difference;
        if (variance > bestVariance) {
          bestVariance = variance;
          threshold = i;
        }
      }
      for (let i = 0; i < brightnesses.length; i++) {
        const textPixel = brightLetters
          ? brightnesses[i] > threshold : brightnesses[i] <= threshold;
        const value = textPixel ? 0 : 255;
        const p = i * 4;
        data[p] = data[p + 1] = data[p + 2] = value;
        data[p + 3] = 255;
      }
      workContext.putImageData(frame, 0, 0);
    }
    return workCanvas;
  }

  function getWorker() {
    if (!workerPromise) {
      workerPromise = loadTesseract(doc)
        .then(async (library) => {
          const worker = await library.createWorker(["kor", "eng"], 1);
          await worker.setParameters({
            tessedit_pageseg_mode: library.PSM?.SINGLE_BLOCK ?? "6",
          });
          return worker;
        }).catch((error) => {
          workerPromise = null;
          throw error;
        });
    }
    return workerPromise;
  }

  function applyResult(result, manual = false) {
    if (!result?.complete) return;
    let reply = null;
    const replyHandler = (event) => { reply = event.detail; };
    doc.addEventListener("gogma:ocr-ack", replyHandler, { once: true });
    const detail = result.mode === "skill"
      ? { mode: "skill", seriesIndex: result.seriesIndex, groupIndex: result.groupIndex }
      : { mode: result.mode, ids: [...result.ids] };
    doc.dispatchEvent(new CustomEvent("gogma:ocr-observation", { detail }));
    doc.removeEventListener("gogma:ocr-ack", replyHandler);
    if (!reply) {
      setStatus(translations.noApp, "error");
      return;
    }
    if (reply.success) {
      sequencers[result.mode].applied(result);
      frameThrottle.applied(currentFrame);
      lastRejectedSignature = null;
      lastRejectedMessage = "";
      setStatus(reply.message, "success");
    } else {
      lastRejectedSignature = result.signature;
      lastRejectedMessage = reply.message;
      setStatus(reply.message, "error");
    }
    // Manual confirmation can record intentionally repeated, identical rolls.
    if (manual && reply.success) applyButton.disabled = false;
  }

  async function scan() {
    if (running || paused || !video || !region || video.readyState < 2) return;
    const epoch = session;
    running = true;
    try {
      if (!workerPromise) setStatus(translations.loading);
      const worker = await getWorker();
      if (epoch !== session || !video) return;
      const frame = snapshotRegion();
      if (!frame || !frameThrottle.shouldScan(frame)) return;
      currentFrame = frame;
      const image = captureRegion();
      if (!image) return;
      const primary = await worker.recognize(image);
      if (epoch !== session || !video) return;
      let chosen = primary;
      let result = parseOcrResult(modeSelect.value, primary?.data?.text ?? "");
      const confidence = Number(primary?.data?.confidence) || 0;
      // Recheck a damaged reading once with alternate preprocessing. Stable
      // frames are throttled; failed OCR does not cause infinite rescanning.
      if (!result.complete || confidence < MIN_AUTO_CONFIDENCE) {
        const alternate = processSelect.value === "original" ? "light" : "original";
        const otherImage = captureRegion(alternate);
        if (otherImage) {
          const secondary = await worker.recognize(otherImage);
          if (epoch !== session || !video) return;
          const secondaryResult = parseOcrResult(modeSelect.value, secondary?.data?.text ?? "");
          const secondaryConfidence = Number(secondary?.data?.confidence) || 0;
          if (secondaryResult.recognized > result.recognized ||
            (secondaryResult.recognized === result.recognized && secondaryConfidence > confidence)) {
            chosen = secondary;
            result = secondaryResult;
          }
        }
      }
      const rawText = chosen?.data?.text ?? "";
      lastConfidence = Number(chosen?.data?.confidence) || 0;
      const readyToApply = sequencers[result.mode].observe(result);
      // Freeze the displayed result once it was saved. Wait for TWO stable
      // readings of a different result before replacing it; raw OCR glitches
      // alone must not make the same game screen look as if it changed.
      const savedResultOnScreen = lastResult?.complete
        && sequencers[lastResult.mode].alreadyApplied(lastResult.signature);
      const holdSavedOutput = savedResultOnScreen && !readyToApply;
      const holdUnconfirmedChange = lastResult?.complete && result.complete
        && result.signature !== lastResult.signature && !readyToApply;
      const improvedPartial = !lastResult || result.recognized > lastResult.recognized
        || (result.recognized === lastResult.recognized
          && lastConfidence >= displayedConfidence + 15);
      if (!holdSavedOutput && !holdUnconfirmedChange
        && (result.complete || (!lastResult?.complete && improvedPartial))) {
        lastResult = result;
        displayedConfidence = lastConfidence;
        const nextOutput = `${rawText.trim() || "—"}\n\n[${result.recognized}/${result.mode === "skill" ? 2 : 5}] ${result.labels.join(" / ")}`;
        if (output.textContent !== nextOutput) output.textContent = nextOutput;
        applyButton.disabled = !result.complete;
      }
      if (!result.complete) {
        if (!lastResult?.complete) {
          setStatus(result.recognized
            ? `${translations.partial}${result.recognized}/${result.mode === "skill" ? 2 : 5}`
            : translations.noResult);
        }
      } else if (lastRejectedSignature === result.signature) {
        setStatus(lastRejectedMessage, "error");
      } else if (readyToApply && autoCheck.checked && lastConfidence >= MIN_AUTO_CONFIDENCE
        && frameThrottle.canAdvance(currentFrame)) {
        applyResult(result);
      } else if (readyToApply && autoCheck.checked && lastConfidence >= MIN_AUTO_CONFIDENCE) {
        setStatus(translations.visualWaiting);
      } else if (readyToApply && autoCheck.checked && lastConfidence < MIN_AUTO_CONFIDENCE) {
        setStatus(`${translations.lowConfidence} (${Math.round(lastConfidence)}%)`);
      } else if (!readyToApply) {
        if (sequencers[result.mode].alreadyApplied(result.signature)) {
          // Keep the successful entry visible instead of "recognizing" it anew.
          if (status.dataset.state !== "success") setStatus(translations.duplicate);
        } else {
          setStatus(translations.waiting);
        }
      } else {
        setStatus(translations.ready + result.labels.join(" / "));
      }
    } catch (error) {
      if (epoch === session) setStatus(`${translations.failure} ${error?.message ?? ""}`, "error");
    } finally {
      running = false;
    }
  }

  function start() {
    panel.hidden = false;
    paused = false;
    pauseButton.textContent = translations.pause;
    resetReading();
    previewTimer = window.setInterval(drawPreview, PREVIEW_INTERVAL_MS);
    scanTimer = window.setInterval(() => { void scan(); }, OCR_INTERVAL_MS);
    drawPreview();
  }

  function stop() {
    session++;
    video = null;
    window.clearInterval(previewTimer);
    window.clearInterval(scanTimer);
    previewTimer = null;
    scanTimer = null;
    running = false;
    lastResult = null;
    applyButton.disabled = true;
    panel.hidden = true;
    if (workerPromise) {
      const pending = workerPromise;
      workerPromise = null;
      pending.then((worker) => worker.terminate()).catch(() => {});
    }
  }

  modeSelect.addEventListener("change", () => {
    session++;
    region = validRegion(regions[modeSelect.value]) ? regions[modeSelect.value] : null;
    sequencers[modeSelect.value].clearPending();
    resetReading();
  });
  processSelect.addEventListener("change", () => {
    session++;
    sequencers[modeSelect.value].clearPending();
    resetReading();
  });
  autoCheck.addEventListener("change", () => {
    if (autoCheck.checked) setStatus(translations.reading);
  });
  resetButton.addEventListener("click", () => {
    session++;
    region = null;
    delete regions[modeSelect.value];
    try { localStorage.setItem(REGIONS_STORAGE_KEY, JSON.stringify(regions)); } catch {}
    sequencers[modeSelect.value].clearPending();
    resetReading();
  });
  retryButton?.addEventListener("click", () => {
    session++;
    sequencers[modeSelect.value].clearPending();
    resetReading();
  });
  pauseButton.addEventListener("click", () => {
    paused = !paused;
    if (paused) session++;
    pauseButton.textContent = paused ? translations.resume : translations.pause;
    setStatus(paused ? translations.paused : region ? translations.reading : translations.selectArea);
  });
  applyButton.addEventListener("click", () => {
    if (lastResult?.complete) applyResult(lastResult, true);
  });
  for (const selector of ["#weapon-type", "#attribute-force",
    "#artian-search-weapon-type", "#artian-search-attribute-force"]) {
    $(selector)?.addEventListener("change", () => {
      lastRejectedSignature = null;
      lastRejectedMessage = "";
      sequencers[modeSelect.value].clearPending();
    });
  }
  doc.addEventListener("gogma:screen-share-started", (event) => {
    stop();
    video = event.detail?.video ?? null;
    if (video) start();
  });
  doc.addEventListener("gogma:screen-share-stopped", stop);
  return { scan, stop };
}

initializeOcrUi();
