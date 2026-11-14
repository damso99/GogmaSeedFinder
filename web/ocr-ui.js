import { getLocale } from "./i18n.js";
import { createOcrSequencer, parseOcrResult } from "./ocr-parser.js";
import { createFrameThrottle } from "./ocr-frame.js";
import { ocrRenderSize, enhanceOcrImageData, removeVariableBackground, bestOcrCandidate } from "./ocr-image.js";
import { pointerToCanvasImage } from "./ocr-geometry.js";
import { buildHudFingerprint, stabilizeTransition } from "./ocr-hud.js";
import { frameDifference } from "./ocr-frame.js";
import { recognizeResultRows } from "./ocr-lines.js";
import { loadOcrSnapshots, lastSavedOcrSignature } from "./ocr-observation-store.js";
import { createRollEventDetector } from "./ocr-roll-event.js";
import { createOcrConsensus } from "./ocr-consensus.js";
import { createWildsOcrQueue } from "./ocr-wilds-queue.js";
import { WILDS_GOGMA_ROI, WILDS_GOGMA_SIGNAL, supportsWildsGogmaProfile, measureWildsResultSignal, createWildsResultTracker, wildsFrameQuality, isolateWildsGreenText, isolateWildsColoredText } from "./ocr-wilds-profile.js";

const OCR_SCRIPT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
const OCR_INTERVAL_MS = 1200;
const PREVIEW_INTERVAL_MS = 180;
const MIN_AUTO_CONFIDENCE = 42;
const REGIONS_STORAGE_KEY = "gogma-ocr-regions-v1";

const TEXT = {
  ko: {
    heading: "복원 결과 자동 입력",
    description: "인식할 신규 옵션 5줄(스킬은 2줄)만 게임 화면에서 드래그해 선택하세요.",
    modeLabel: "인식 대상",
    zoomLabel: "인식 영역 확대",
    zoomFit: "화면에 맞춤",
    wildsProfile: "실제 영상 기준 복원 감지 (16:9, 시험 기능)",
    wildsIdle: "영상 기준 프리셋 꺼짐 · 기존 OCR 모드",
    wildsUnsupported: "이 프리셋은 게임 창이 화면 전체를 차지하는 16:9 캡처에서 사용하세요.",
    wildsUnknown: "????? 상태 감시 중 · 복원 결과가 표시되면 자동 캡처",
    wildsRevealed: "복원 결과 표시 감지 · 선명한 원본 화면 저장 중",
    wildsReading: "복원 화면 저장 완료 · 결과 분석 중",
    wildsComplete: "복원 결과 자동 입력 완료 · 다음 결과 대기",
    wildsFailed: "저장된 복원 화면에서 옵션 5개를 확정하지 못했습니다. 영역과 보정 이미지를 확인하세요.",
    wildsPaused: "일시정지 · 저장된 화면은 유지되며 재개하면 분석합니다.",
    wildsQueued: "복원 이미지가 대기열에 저장되었습니다. 인식 순서를 기다리는 중",
    wildsReview: "인식 확인 필요 · 해당 회차의 저장 화면으로 다시 인식할 수 있습니다.",
    wildsOverflow: "OCR 대기열 한도 초과 · 일부 결과를 저장하지 못했습니다. 일시정지를 해제하세요.",
    wildsCounts: ["감지","대기","분석","완료","확인 필요","초과"],
    wildsStates: { pending:"대기", processing:"분석 중", done:"입력 완료", review:"확인 필요" },
    eventMode: "복원 이벤트 추적 + 다중 프레임 인식 (시험 기능)",
    eventIdle: "이벤트 추적 비활성 · 기존 OCR 방식 사용",
    eventInitial: "이벤트 감시: 첫 결과 화면이 안정화되기를 기다리는 중",
    eventTransition: "복원 중 또는 화면 전환 감지 · 안정화 대기",
    eventReady: "결과 화면 안정화 · 여러 프레임 OCR 확인 중",
    eventLocked: "인식 완료 · 다음 복원 화면 전환 대기",
    precision: "정밀 분석 (옵션 5줄 각각 인식, 느림)",
    gogma: "거극 아티어 복원",
    artian: "일반 아티어 복원",
    skill: "스킬 재부여",
    auto: "안정적으로 인식되면 자동 입력",
    preprocessLabel: "글자 배경",
    light: "어두운 배경 · 밝은 글자",
    dark: "밝은 배경 · 어두운 글자",
    original: "원본 인식",
    enhanced: "선명하게 보정 (권장)",
    adaptive: "배경색 제거 (장면 변화에 강함)",
    enhancedPreview: "OCR에 전달되는 보정 이미지 확인",
    resetArea: "영역 다시 지정",
    retry: "다시 인식",
    pause: "인식 일시정지",
    resume: "인식 재개",
    applyOnce: "인식 결과 한 번 입력",
    selectArea: "미리보기에서 새 결과 텍스트만 드래그해 인식 영역을 지정하세요.",
    recognized: "최근 인식 결과",
    hint: "옵션만 포함하도록 인식 영역을 좁게 선택하세요. 선명하게 보정 모드는 글자를 최대 3배 확대하고 대비·윤곽을 조절합니다. 동일 화면은 반복 입력하지 않으며, 외부 서버로 화면을 전송하지 않습니다.",
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
    zoomLabel: "Preview zoom",
    zoomFit: "Fit width",
    wildsProfile: "Recorded Wilds reroll detection (16:9, experimental)",
    wildsIdle: "Recorded game profile off",
    wildsUnsupported: "Use a 16:9 capture with the game filling the window.",
    wildsUnknown: "Watching ????? placeholders for the next roll",
    wildsRevealed: "Roll revealed · freezing source frames",
    wildsReading: "Reading saved game frames",
    wildsComplete: "Restoration recorded · awaiting next result",
    wildsFailed: "Could not verify all five slots; inspect the capture.",
    wildsPaused: "Paused · captured frames are retained until resumed.",
    wildsQueued: "Result images saved; awaiting OCR.",
    wildsReview: "Needs review · the saved result can be retried.",
    wildsOverflow: "OCR queue full · some results could not be saved.",
    wildsCounts: ["Detected","Queued","Reading","Saved","Review","Overflow"],
    wildsStates: { pending:"Queued", processing:"Reading", done:"Saved", review:"Review" },
    eventMode: "Track reroll event + multi-frame OCR (experimental)",
    eventIdle: "Event tracking off · original OCR mode",
    eventInitial: "Waiting for the first stable result",
    eventTransition: "Screen transition detected · waiting to settle",
    eventReady: "Stable result · combining OCR frames",
    eventLocked: "Result recorded · waiting for next reroll",
    precision: "Precise reading (individual rows, slower)",
    gogma: "Gogma reinforcement",
    artian: "Base Artian reinforcement",
    skill: "Skill reset",
    auto: "Auto-fill after stable recognition",
    preprocessLabel: "Text background",
    light: "Dark background · light text",
    dark: "Light background · dark text",
    original: "Original image",
    enhanced: "Enhanced clarity (recommended)",
    adaptive: "Remove game background",
    enhancedPreview: "Preview processed OCR image",
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
    zoomLabel: "プレビュー拡大",
    zoomFit: "幅に合わせる",
    wildsProfile: "実映像に基づく結果検出（16:9、試験）",
    wildsIdle: "映像プリセット無効",
    wildsUnsupported: "ゲーム全画面の16:9映像を共有してください。",
    wildsUnknown: "????? 表示を監視中",
    wildsRevealed: "復元結果を検出 · 画像保存中",
    wildsReading: "保存した画像を認識中",
    wildsComplete: "復元結果を記録済み",
    wildsFailed: "5項目を確認できませんでした。",
    wildsPaused: "一時停止中 · 保存画像は再開まで保持します。",
    wildsQueued: "結果の画像を保存しました。OCR待機中です。",
    wildsReview: "確認が必要です。保存画像から再解析できます。",
    wildsOverflow: "OCRキューの上限に達しました。",
    wildsCounts: ["検出","待機","解析","完了","確認","超過"],
    wildsStates: { pending:"待機", processing:"解析中", done:"入力済", review:"確認" },
    eventMode: "再抽選イベント追跡 + 複数フレーム認識（試験）",
    eventIdle: "イベント追跡オフ",
    eventInitial: "最初の安定した画面を待機中",
    eventTransition: "画面切替を検出 · 安定化を待機中",
    eventReady: "画面安定 · OCR結果を照合中",
    eventLocked: "入力完了 · 次の再抽選を待機中",
    precision: "精密認識 (各行を読み取る・低速)",
    gogma: "巨戟アーティア復元",
    artian: "通常アーティア復元",
    skill: "スキル再付与",
    auto: "安定して認識したら自動入力",
    preprocessLabel: "文字の背景",
    light: "暗い背景・明るい文字",
    dark: "明るい背景・暗い文字",
    original: "画像のまま",
    enhanced: "鮮明化（推奨）",
    adaptive: "ゲーム背景を除去",
    enhancedPreview: "OCR画像を確認",
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
    zoomLabel: "預覽放大",
    zoomFit: "符合寬度",
    wildsProfile: "實際影片還原偵測（16:9，實驗）",
    wildsIdle: "錄影預設關閉",
    wildsUnsupported: "請使用遊戲填滿畫面的 16:9 影像。",
    wildsUnknown: "正在監看 ????? 狀態",
    wildsRevealed: "偵測到新結果，擷取畫面",
    wildsReading: "辨識已儲存的畫面",
    wildsComplete: "結果已記錄",
    wildsFailed: "無法確認全部五個選項。",
    wildsPaused: "暫停 · 已擷取畫面保留至恢復。",
    wildsQueued: "已儲存畫面，等待 OCR。",
    wildsReview: "需要確認，可重新辨識已儲存結果。",
    wildsOverflow: "OCR 佇列已滿，部分結果未儲存。",
    wildsCounts: ["偵測","等待","分析","完成","確認","溢出"],
    wildsStates: { pending:"等待", processing:"分析中", done:"完成", review:"確認" },
    eventMode: "追蹤重抽事件 + 多影格辨識（實驗）",
    eventIdle: "事件追蹤關閉",
    eventInitial: "等待第一個穩定畫面",
    eventTransition: "偵測到畫面轉換 · 等待穩定",
    eventReady: "畫面穩定 · 核對多影格OCR",
    eventLocked: "輸入完成 · 等待下一次重抽",
    precision: "精確辨識 (逐行，速度較慢)",
    gogma: "巨戟機械武器復原",
    artian: "一般機械武器復原",
    skill: "技能重新附加",
    auto: "辨識穩定後自動填入",
    preprocessLabel: "文字背景",
    light: "深色背景·淺色文字",
    dark: "淺色背景·深色文字",
    original: "原始影像",
    enhanced: "強化清晰度（建議）",
    adaptive: "去除遊戲背景",
    enhancedPreview: "檢視增強影像",
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
  const zoomSelect = $("#ocr-preview-zoom");
  const precisionCheck = $("#ocr-precision");
  const eventModeCheck = $("#ocr-event-mode");
  const wildsCheck = $("#ocr-wilds-profile");
  const wildsStatus = $("#ocr-wilds-status");
  const wildsProgress = $("#ocr-wilds-progress");
  const wildsHistory = $("#ocr-wilds-history");
  const eventStatus = $("#ocr-event-state");
  const autoCheck = $("#ocr-auto");
  const resetButton = $("#ocr-reset-area");
  const retryButton = $("#ocr-retry");
  const pauseButton = $("#ocr-toggle-pause");
  const applyButton = $("#ocr-apply-once");
  const status = $("#ocr-status");
  const output = $("#ocr-recognized");
  const processedPreview = $("#ocr-enhanced-preview");
  const processedContext = processedPreview?.getContext("2d") ?? null;
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
  const frameStable = stabilizeTransition({ stableFrames: 2 });
  const rollEvents = createRollEventDetector();
  const consensus = createOcrConsensus({ windowSize: 5, minVotes: 2 });
  const wildsTracker = createWildsResultTracker();
  const wildsTasks = createWildsOcrQueue({ maxActive: 8, maxHistory: 20 });
  const wildsProbe = doc.createElement("canvas");
  wildsProbe.width = 140;
  wildsProbe.height = 150;
  const wildsProbeContext = wildsProbe.getContext("2d", { willReadFrequently: true });
  const regions = getStoredRegions();
  const sequencers = {
    gogma: createOcrSequencer(),
    artian: createOcrSequencer(),
    skill: createOcrSequencer(),
  };
  // Reloading the page does not mean the game performed another roll. Keep
  // the last recorded signature so a reconnected capture cannot duplicate it.
  const previousOcrSnapshots = loadOcrSnapshots(localStorage);
  for (const mode of ["gogma", "artian", "skill"]) {
    const signature = lastSavedOcrSignature(mode, previousOcrSnapshots[mode]);
    if (signature) sequencers[mode].applied({ signature });
  }

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
  let activeEventId = 0;
  let committedEventId = 0;
  let wildsCaptures = [];
  let wildsEnqueuedId = 0;
  let wildsAppliedIds = new Set();
  let wildsLastBatch = null;
  let region = validRegion(regions[modeSelect.value]) ? regions[modeSelect.value] : null;
  let pointerOrigin = null;
  let pointerRegion = null;

  function setStatus(text, state = "info") {
    if (status.textContent !== text) status.textContent = text;
    if (status.dataset.state !== state) status.dataset.state = state;
  }

  function resetEventTracking() {
    rollEvents.reset();
    consensus.reset(modeSelect.value);
    activeEventId = 0;
    committedEventId = 0;
    if (eventStatus) eventStatus.textContent = eventModeCheck?.checked
      ? translations.eventInitial : translations.eventIdle;
  }

  function monitorRollFrame(frame) {
    if (!eventModeCheck?.checked || !frame) return null;
    const state = rollEvents.observe(frame);
    if (state.newEvent) {
      activeEventId = state.eventId;
      consensus.reset(modeSelect.value);
      frameThrottle.retry();
      frameStable.reset();
    }
    if (eventStatus) {
      const key = "event" + state.phase[0].toUpperCase() + state.phase.slice(1);
      const message = translations[key] ?? translations.eventInitial;
      if (eventStatus.textContent !== message) eventStatus.textContent = message;
    }
    return state;
  }

  function resetWildsTracking() {
    wildsTracker.reset();
    wildsTasks.clear();
    wildsCaptures = [];
    wildsEnqueuedId = 0;
    wildsAppliedIds = new Set();
    wildsLastBatch = null;
    updateWildsProgress();
    if (wildsStatus) wildsStatus.textContent = wildsCheck?.checked
      ? translations.wildsUnknown : translations.wildsIdle;
  }

  function setWildsProfileRegion() {
    if (!video?.videoWidth || !video?.videoHeight
      || !supportsWildsGogmaProfile(video.videoWidth, video.videoHeight)) {
      if (wildsStatus) wildsStatus.textContent = translations.wildsUnsupported;
      return false;
    }
    region = { ...WILDS_GOGMA_ROI };
    regions.gogma = region;
    try { localStorage.setItem(REGIONS_STORAGE_KEY, JSON.stringify(regions)); } catch {}
    return true;
  }

  function cloneOcrCanvas(source) {
    if (!source) return null;
    const copy = doc.createElement("canvas");
    copy.width = source.width;
    copy.height = source.height;
    const ctx = copy.getContext("2d");
    ctx.drawImage(source, 0, 0);
    return copy;
  }

  function captureWildsSnapshot() {
    const original = cloneOcrCanvas(captureRegion("original"));
    const enhanced = cloneOcrCanvas(captureRegion("enhanced"));
    const green = cloneOcrCanvas(captureRegion("wilds-green"));
    const colored = cloneOcrCanvas(captureRegion("wilds-colors"));
    if (!enhanced || !original || !green || !colored) return null;
    const pixels = original.getContext("2d", { willReadFrequently: true })
      .getImageData(0, 0, original.width, original.height);
    return { colored, green, enhanced, original, quality: wildsFrameQuality(pixels) };
  }

  function monitorWildsPreview() {
    if (!wildsCheck?.checked || modeSelect.value !== "gogma" || !video
      || video.readyState < 2) return;
    if (!supportsWildsGogmaProfile(video.videoWidth, video.videoHeight)) {
      if (wildsStatus) wildsStatus.textContent = translations.wildsUnsupported;
      return;
    }
    const spec = WILDS_GOGMA_SIGNAL;
    const x = Math.round(spec.x * video.videoWidth);
    const y = Math.round(spec.y * video.videoHeight);
    const w = Math.round(spec.w * video.videoWidth);
    const h = Math.round(spec.h * video.videoHeight);
    wildsProbeContext.drawImage(video, x, y, w, h,
      0, 0, wildsProbe.width, wildsProbe.height);
    const score = measureWildsResultSignal(
      wildsProbeContext.getImageData(0, 0, wildsProbe.width, wildsProbe.height),
    );
    const state = wildsTracker.observe(score);
    if (state.newEvent) {
      wildsCaptures = [];
      if (wildsStatus) wildsStatus.textContent = translations.wildsRevealed;
    }
    if (state.shouldCapture && state.eventId > wildsEnqueuedId) {
      const screenshot = captureWildsSnapshot();
      if (screenshot) wildsCaptures.push(screenshot);
    }
    if (state.captures >= 4 && wildsCaptures.length >= 2
      && state.eventId > wildsEnqueuedId) {
      // The OCR worker receives immutable snapshots, not the live video.
      const batch = { id: state.eventId, snapshots: wildsCaptures };
      wildsQueue.push(batch);
      wildsEnqueuedId = state.eventId;
      wildsLastBatch = batch;
      wildsCaptures = [];
      if (wildsStatus) wildsStatus.textContent = translations.wildsReading;
    }
    if (state.phase === "hidden" && wildsQueue.length === 0 && wildsCompletedId === 0
      && wildsStatus) wildsStatus.textContent = translations.wildsUnknown;
  }

  async function scanWildsQueue() {
    if (running || paused || !video || !wildsQueue.length) return;
    const batch = wildsQueue.shift();
    if (!batch || batch.id <= wildsCompletedId) return;
    const epoch = session;
    running = true;
    try {
      if (!workerPromise) setStatus(translations.loading);
      const worker = await getWorker();
      if (epoch !== session || !video) return;
      const voting = createOcrConsensus({ windowSize: 4, minVotes: 2, minimumConfidence: 30 });
      let final = null;
      let strongest = null;
      // Prefer snapshots where glow has subsided. The source pixels remain
      // available after the green result disappears from the game.
      const ordered = [...batch.snapshots].sort((a, b) => b.quality - a.quality);
      let snapshotIndex = 0;
      for (const screenshot of ordered) {
        snapshotIndex++;
        const first = await worker.recognize(screenshot.green);
        if (epoch !== session || !video) return;
        let chosen = first;
        let result = parseOcrResult("gogma", first?.data?.text ?? "");
        let confidence = Number(first?.data?.confidence) || 0;
        if (!result.complete) {
          const fallback = await worker.recognize(screenshot.enhanced);
          if (epoch !== session || !video) return;
          const altResult = parseOcrResult("gogma", fallback?.data?.text ?? "");
          const alternative = { result: altResult, confidence: Number(fallback?.data?.confidence) || 0 };
          if (bestOcrCandidate({ result, confidence }, alternative) === alternative) {
            result = altResult;
            confidence = alternative.confidence;
            chosen = fallback;
          }
        }
        // If requested, use the original single-row OCR on the two cleanest
        // frozen frames. Never split moving video frames during animation.
        if (!result.complete && precisionCheck?.checked && snapshotIndex <= 2) {
          const precise = await recognizeResultRows(worker, doc, screenshot.enhanced, "gogma");
          if (epoch !== session || !video) return;
          if (precise) {
            const rowResult = parseOcrResult("gogma", precise?.data?.text ?? "");
            const alt = { result: rowResult, confidence: Number(precise?.data?.confidence) || 0 };
            if (bestOcrCandidate({ result, confidence }, alt) === alt) {
              result = rowResult;
              confidence = alt.confidence;
              chosen = precise;
            }
          }
        }
        if (!result.complete) {
          const originalRead = await worker.recognize(screenshot.original);
          if (epoch !== session || !video) return;
          const originalResult = parseOcrResult("gogma", originalRead?.data?.text ?? "");
          const alternative = { result: originalResult, confidence: Number(originalRead?.data?.confidence) || 0 };
          if (bestOcrCandidate({ result, confidence }, alternative) === alternative) {
            result = originalResult;
            confidence = alternative.confidence;
            chosen = originalRead;
          }
        }
        const candidate = { result, confidence, rawText: chosen?.data?.text ?? "" };
        if (!strongest || bestOcrCandidate(strongest, candidate) === candidate) strongest = candidate;
        final = voting.observe(result, confidence);
        if (final?.result?.complete && final.confidence >= MIN_AUTO_CONFIDENCE) break;
      }
      if (epoch !== session || !video) return;
      wildsCompletedId = batch.id;
      if (final?.result?.complete) {
        const result = final.result;
        const confidence = final.confidence;
        lastResult = result;
        lastConfidence = confidence;
        displayedConfidence = confidence;
        applyButton.disabled = false;
        const text = strongest?.rawText?.trim() || result.ids.join(" / ");
        output.textContent = text + "\n\n[5/5] " + result.ids.join(" / ");
        // Never re-add the previous confirmed roll merely from reconnecting.
        // Genuine later events can have the same options and still count.
        const repeatedOnReconnect = batch.id === 1
          && sequencers.gogma.alreadyApplied(result.signature);
        if (autoCheck.checked && confidence >= MIN_AUTO_CONFIDENCE
          && !repeatedOnReconnect && !wildsAppliedIds.has(batch.id)) {
          currentFrame = snapshotRegion();
          const applied = applyResult(result);
          if (applied) wildsAppliedIds.add(batch.id);
          if (wildsStatus) wildsStatus.textContent = applied
            ? translations.wildsComplete : translations.wildsFailed;
        } else if (repeatedOnReconnect || wildsAppliedIds.has(batch.id)) {
          setStatus(translations.duplicate);
          if (wildsStatus) wildsStatus.textContent = translations.wildsComplete;
        } else {
          setStatus(confidence < MIN_AUTO_CONFIDENCE
            ? translations.lowConfidence + " (" + Math.round(confidence) + "%)"
            : translations.ready + result.ids.join(" / "));
        }
      } else {
        if (strongest && (!lastResult?.complete || strongest.result.complete)) {
          lastResult = strongest.result;
          lastConfidence = strongest.confidence;
          output.textContent = (strongest.rawText.trim() || "—") +
            "\n\n[" + strongest.result.recognized + "/5] " +
            strongest.result.labels.join(" / ");
          applyButton.disabled = !strongest.result.complete;
        }
        setStatus(translations.wildsFailed);
        if (wildsStatus) wildsStatus.textContent = translations.wildsFailed;
      }
    } catch (error) {
      if (epoch === session && !hasRecordedResult()) {
        setStatus(translations.failure + " " + (error?.message ?? ""), "error");
      }
    } finally {
      running = false;
    }
  }

  function hasRecordedResult() {
    return lastResult?.complete
      && sequencers[lastResult.mode]?.alreadyApplied(lastResult.signature);
  }

  function resetReading({ keepRecognized = false } = {}) {
    // Preprocessing changes and manual Retry must restart scanning, NOT erase
    // a correctly recognized/recorded result or unlock the previous image.
    const retained = keepRecognized && Boolean(lastResult?.complete);
    if (!retained) {
      lastResult = null;
      lastConfidence = 0;
      displayedConfidence = 0;
      applyButton.disabled = true;
      output.textContent = "—";
      frameThrottle.reset();
      currentFrame = null;
    } else {
      frameThrottle.retry();
    }
    lastRejectedSignature = null;
    lastRejectedMessage = "";
    frameStable.reset();
    if (!retained) setStatus(region ? translations.reading : translations.selectArea);
    consensus.reset(modeSelect.value);
  }

  function screenPoint(event, clamp = false) {
    // The image is drawn in its original aspect ratio, but 'contain' can
    // introduce invisible letterbox areas in constrained layouts.
    return pointerToCanvasImage(
      event, preview.getBoundingClientRect(), preview.width, preview.height,
      { fit: "contain", clamp },
    );
  }
  zoomSelect?.addEventListener("change", () => {
    const value = Number(zoomSelect.value);
    preview.style.width = value === 1.5 ? "150%" : value === 2 ? "200%" : "100%";
  });

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
    if (!pointerOrigin) return;
    pointerRegion = null;
    preview.setPointerCapture?.(event.pointerId);
  });
  preview.addEventListener("pointermove", (event) => {
    if (!pointerOrigin) return;
    const point = screenPoint(event, true);
    if (!point) return;
    pointerRegion = selectionFromCorners(pointerOrigin, point);
    drawPreview();
  });
  preview.addEventListener("pointerup", (event) => {
    if (!pointerOrigin) return;
    const point = screenPoint(event, true);
    const chosen = point ? selectionFromCorners(pointerOrigin, point) : null;
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
    resetEventTracking();
    resetReading();
  });
  preview.addEventListener("pointercancel", () => {
    pointerOrigin = null;
    pointerRegion = null;
  });

  function drawPreview() {
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
    const width = Math.min(video.videoWidth, 1920);
    const height = Math.round(width * video.videoHeight / video.videoWidth);
    if (preview.width !== width || preview.height !== height) {
      preview.width = width;
      preview.height = height;
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
    if (wildsCheck?.checked) monitorWildsPreview();
    else if (eventModeCheck?.checked && !pointerOrigin && validRegion(region)) {
      monitorRollFrame(snapshotRegion());
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
    // Ignore global lighting shifts: monitor the geometry of the text strokes
    // and UI outlines rather than the raw color/brightness of the background.
    const fingerprint = buildHudFingerprint({
      data: bytes, width: frameCanvas.width, height: frameCanvas.height,
    });
    if (fingerprint) return fingerprint;
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

    const size = ocrRenderSize(width, height);
    if (!size) return null;
    const { padding, renderedWidth, renderedHeight } = size;
    workCanvas.width = size.width;
    workCanvas.height = size.height;
    // White margin prevents Tesseract from chopping off characters near
    // a tightly selected game region.
    workContext.fillStyle = "#fff";
    workContext.fillRect(0, 0, size.width, size.height);
    workContext.imageSmoothingEnabled = true;
    workContext.imageSmoothingQuality = "high";
    workContext.drawImage(video, left, top, width, height,
      padding, padding, renderedWidth, renderedHeight);

    if (preprocess === "wilds-colors") {
      const pixels = workContext.getImageData(padding, padding, renderedWidth, renderedHeight);
      isolateWildsColoredText(pixels);
      workContext.putImageData(pixels, padding, padding);
    } else if (preprocess === "wilds-green") {
      const pixels = workContext.getImageData(padding, padding, renderedWidth, renderedHeight);
      isolateWildsGreenText(pixels);
      workContext.putImageData(pixels, padding, padding);
    } else if (preprocess === "enhanced" || preprocess === "adaptive") {
      const image = workContext.getImageData(padding, padding, renderedWidth, renderedHeight);
      if (preprocess === "adaptive") removeVariableBackground(image);
      else enhanceOcrImageData(image);
      workContext.putImageData(image, padding, padding);
    } else if (preprocess === "light" || preprocess === "dark") {
      const frame = workContext.getImageData(padding, padding, renderedWidth, renderedHeight);
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
      // Otsu threshold for bright/dark binary modes.
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
      workContext.putImageData(frame, padding, padding);
    }
    // The user can inspect the exact most recently processed OCR crop.
    // Downsample only the visual preview, never the full-resolution OCR input.
    if (processedPreview && processedContext) {
      const ratio = Math.min(1, 720 / workCanvas.width);
      processedPreview.width = Math.max(1, Math.floor(workCanvas.width * ratio));
      processedPreview.height = Math.max(1, Math.floor(workCanvas.height * ratio));
      processedContext.imageSmoothingEnabled = true;
      processedContext.imageSmoothingQuality = "high";
      processedContext.drawImage(workCanvas, 0, 0,
        processedPreview.width, processedPreview.height);
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
      if (eventModeCheck?.checked && rollEvents.confirm(currentFrame)) {
        committedEventId = activeEventId;
        consensus.reset(result.mode);
        if (eventStatus) eventStatus.textContent = translations.eventLocked;
      }
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
    return Boolean(reply?.success);
  }

  async function scan() {
    if (wildsCheck?.checked) return scanWildsQueue();
    if (running || paused || !video || !region || video.readyState < 2) return;
    const epoch = session;
    running = true;
    try {
      if (!workerPromise) setStatus(translations.loading);
      const worker = await getWorker();
      if (epoch !== session || !video) return;
      const frame = snapshotRegion();
      if (!frame) return;
      const eventState = monitorRollFrame(frame);
      if (eventModeCheck?.checked && (!eventState?.ready
        || eventState.eventId === committedEventId)) return;
      const capturedEventId = eventModeCheck?.checked ? eventState.eventId : null;
      // Event mode is already settled via high-frequency preview frames;
      // do not wait another two slow OCR intervals.
      if (!eventModeCheck?.checked
        && !frameStable.observe(frame, (a, b) => frameDifference(a, b).changedRatio < 0.025)) return;
      if (!frameThrottle.shouldScan(frame)) return;
      // In experimental event mode, a confirmed visual transition can mean
      // a genuinely identical consecutive roll. Legacy mode still uses the
      // old pixel guard for backwards compatibility.
      if (!eventModeCheck?.checked && hasRecordedResult()
        && !frameThrottle.canAdvance(frame)) return;
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
        const alternate = processSelect.value === "enhanced" ? "original" : "enhanced";
        const otherImage = captureRegion(alternate);
        if (otherImage) {
          const secondary = await worker.recognize(otherImage);
          if (epoch !== session || !video) return;
          const secondaryResult = parseOcrResult(modeSelect.value, secondary?.data?.text ?? "");
          const secondaryConfidence = Number(secondary?.data?.confidence) || 0;
          const winner = bestOcrCandidate(
            { result, confidence },
            { result: secondaryResult, confidence: secondaryConfidence },
          );
          if (winner.result === secondaryResult) {
            chosen = secondary;
            result = secondaryResult;
          }
        }
      }
      // The alternative full-block preprocessing can still fail when a
      // bright moving background shines through the translucent game panel.
      // Try local illumination subtraction once before per-row OCR.
      if (!result.complete || (Number(chosen?.data?.confidence) || 0) < MIN_AUTO_CONFIDENCE) {
        const backgroundImage = captureRegion("adaptive");
        if (backgroundImage) {
          const backgroundRead = await worker.recognize(backgroundImage);
          if (epoch !== session || !video) return;
          const backgroundResult = parseOcrResult(modeSelect.value, backgroundRead?.data?.text ?? "");
          const backgroundConfidence = Number(backgroundRead?.data?.confidence) || 0;
          const winner = bestOcrCandidate(
            { result, confidence: Number(chosen?.data?.confidence) || 0 },
            { result: backgroundResult, confidence: backgroundConfidence },
          );
          if (winner.result === backgroundResult) {
            chosen = backgroundRead;
            result = backgroundResult;
          }
        }
      }
      // Optional slow fallback: read each game bonus row separately.
      // The crop must contain exactly five option rows (two skill rows).
      if (precisionCheck?.checked && !result.complete) {
        const stripImage = captureRegion("enhanced");
        if (stripImage) {
          const precise = await recognizeResultRows(worker, doc, stripImage, modeSelect.value);
          if (epoch !== session || !video) return;
          if (precise) {
            const preciseResult = parseOcrResult(modeSelect.value, precise.data.text);
            const preciseConfidence = Number(precise.data.confidence) || 0;
            const winner = bestOcrCandidate(
              { result, confidence: Number(chosen?.data?.confidence) || 0 },
              { result: preciseResult, confidence: preciseConfidence },
            );
            if (winner.result === preciseResult) {
              chosen = precise;
              result = preciseResult;
            }
          }
        }
      }
      // OCR can take several seconds on large Korean crops. Never associate
      // a finished OCR result with a newer reroll that appeared meanwhile.
      if (eventModeCheck?.checked) {
        const latest = rollEvents.getState();
        if (!latest.ready || latest.eventId !== capturedEventId) return;
      }
      const rawText = chosen?.data?.text ?? "";
      lastConfidence = Number(chosen?.data?.confidence) || 0;
      let combined = null;
      if (eventModeCheck?.checked) {
        combined = consensus.observe(result, lastConfidence);
        if (combined) {
          result = combined.result;
          lastConfidence = combined.confidence;
        }
      }
      const readyToApply = eventModeCheck?.checked
        ? Boolean(combined?.result?.complete && activeEventId !== committedEventId
          && (activeEventId > 1 || !sequencers[result.mode].alreadyApplied(result.signature)))
        : sequencers[result.mode].observe(result);
      // Freeze the displayed result once it was saved. Wait for TWO stable
      // readings of a different result before replacing it; raw OCR glitches
      // alone must not make the same game screen look as if it changed.
      const savedResultOnScreen = lastResult?.complete
        && sequencers[lastResult.mode].alreadyApplied(lastResult.signature);
      const confirmedVisualTransition = eventModeCheck?.checked
        ? activeEventId !== committedEventId && rollEvents.getState().ready
        : frameThrottle.canAdvance(currentFrame);
      const holdSavedOutput = savedResultOnScreen
        && (!readyToApply || !confirmedVisualTransition);
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
        && confirmedVisualTransition) {
        applyResult(result);
      } else if (readyToApply && autoCheck.checked && lastConfidence >= MIN_AUTO_CONFIDENCE) {
        // Keep the confirmation status and previously captured values visible.
        if (!hasRecordedResult()) setStatus(translations.visualWaiting);
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
      if (epoch === session && !hasRecordedResult()) {
        setStatus(`${translations.failure} ${error?.message ?? ""}`, "error");
      }
    } finally {
      running = false;
    }
  }

  function start() {
    panel.hidden = false;
    paused = false;
    pauseButton.textContent = translations.pause;
    resetWildsTracking();
    if (wildsCheck?.checked) setWildsProfileRegion();
    resetReading({ keepRecognized: true });
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
    // Keep the last confirmed text in memory when the user reconnects the
    // screen share. Only the video stream and OCR worker are released here.
    panel.hidden = true;
    if (workerPromise) {
      const pending = workerPromise;
      workerPromise = null;
      pending.then((worker) => worker.terminate()).catch(() => {});
    }
  }

  modeSelect.addEventListener("change", () => {
    session++;
    if (modeSelect.value !== "gogma" && wildsCheck?.checked) {
      wildsCheck.checked = false;
      resetWildsTracking();
    }
    region = validRegion(regions[modeSelect.value]) ? regions[modeSelect.value] : null;
    sequencers[modeSelect.value].clearPending();
    resetEventTracking();
    resetReading();
  });
  wildsCheck?.addEventListener("change", () => {
    session++;
    if (wildsCheck.checked) {
      modeSelect.value = "gogma";
      if (eventModeCheck) eventModeCheck.checked = false;
      resetEventTracking();
      setWildsProfileRegion();
    }
    resetWildsTracking();
    sequencers[modeSelect.value].clearPending();
    resetReading({ keepRecognized: true });
  });
  eventModeCheck?.addEventListener("change", () => {
    session++;
    if (eventModeCheck.checked && wildsCheck?.checked) {
      wildsCheck.checked = false;
      resetWildsTracking();
    }
    sequencers[modeSelect.value].clearPending();
    resetEventTracking();
    resetReading({ keepRecognized: true });
  });
  precisionCheck?.addEventListener("change", () => {
    session++;
    sequencers[modeSelect.value].clearPending();
    resetReading({ keepRecognized: true });
  });
  processSelect.addEventListener("change", () => {
    session++;
    sequencers[modeSelect.value].clearPending();
    resetReading({ keepRecognized: true });
  });
  autoCheck.addEventListener("change", () => {
    if (autoCheck.checked) setStatus(translations.reading);
  });
  resetButton.addEventListener("click", () => {
    session++;
    if (wildsCheck?.checked) {
      wildsCheck.checked = false;
      resetWildsTracking();
    }
    region = null;
    delete regions[modeSelect.value];
    try { localStorage.setItem(REGIONS_STORAGE_KEY, JSON.stringify(regions)); } catch {}
    sequencers[modeSelect.value].clearPending();
    resetEventTracking();
    resetReading();
  });
  retryButton?.addEventListener("click", () => {
    session++;
    if (wildsCheck?.checked && wildsLastBatch
      && !wildsAppliedIds.has(wildsLastBatch.id)) {
      wildsQueue.push(wildsLastBatch);
      wildsCompletedId = Math.min(wildsCompletedId, wildsLastBatch.id - 1);
    }
    sequencers[modeSelect.value].clearPending();
    resetReading({ keepRecognized: true });
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
  return { scan, stop, preview: drawPreview };
}

initializeOcrUi();
