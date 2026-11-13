import { getLocale } from "./i18n.js";

const COPY = {
  ko: {
    title: "실시간 화면 공유",
    description: "게임 화면을 연결합니다. 인식 영역을 선택하면 강화 옵션이 자동으로 계산기에 입력됩니다.",
    idle: "연결되지 않음",
    start: "화면 공유 시작",
    stop: "공유 종료",
    guideTitle: "게임을 테두리 없는 창 모드로 변경해 주세요",
    guideIntro: "화면 공유 전 몬스터헌터 와일즈의 화면 표시 모드를 ‘테두리 없는 창(보더리스)’으로 변경해 주세요.",
    guideStep1: "게임 설정에서 화면 모드를 ‘테두리 없는 창’으로 변경",
    guideStep2: "게임 화면이 정상적으로 표시되는지 확인",
    guideStep3: "아래 버튼을 누르고 공유할 게임 창 또는 모니터를 선택",
    guideNote: "브라우저에서는 게임의 화면 모드를 자동으로 변경할 수 없습니다.",
    cancel: "취소",
    confirm: "설정 확인 · 화면 선택",
    selecting: "공유할 화면 선택 중…",
    connected: "화면 공유 중",
    stopped: "화면 공유가 종료되었습니다.",
    denied: "화면 공유가 취소되었거나 권한이 허용되지 않았습니다.",
    unavailable: "이 브라우저는 화면 공유를 지원하지 않습니다. PC의 최신 Chrome 또는 Edge에서 HTTPS로 접속해 주세요.",
    failed: "화면 공유를 시작하지 못했습니다. 게임의 화면 모드와 브라우저 권한을 확인해 주세요.",
  },
  ja: {
    title: "リアルタイム画面共有",
    description: "ゲーム画面を接続します。OCR自動入力は次の段階で追加します。",
    idle: "未接続",
    start: "画面共有を開始",
    stop: "共有を停止",
    guideTitle: "ゲームをボーダーレスウィンドウモードに変更してください",
    guideIntro: "画面共有の前にモンスターハンターワイルズの画面モードを「ボーダーレスウィンドウ」に変更してください。",
    guideStep1: "ゲーム設定でボーダーレスウィンドウに変更",
    guideStep2: "ゲーム画面が正常に表示されることを確認",
    guideStep3: "次のボタンで共有するゲームウィンドウまたはモニターを選択",
    guideNote: "ブラウザからゲームの画面モードを自動変更することはできません。",
    cancel: "キャンセル",
    confirm: "設定確認・画面を選択",
    selecting: "共有画面を選択中…",
    connected: "画面共有中",
    stopped: "画面共有を停止しました。",
    denied: "画面共有がキャンセルされたか、許可されませんでした。",
    unavailable: "このブラウザは画面共有に対応していません。PCの最新ChromeまたはEdgeでHTTPS接続してください。",
    failed: "画面共有を開始できませんでした。画面モードと権限をご確認ください。",
  },
  en: {
    title: "Live Screen Sharing",
    description: "Connect your game screen. OCR autofill will be added in the next phase.",
    idle: "Not connected",
    start: "Share screen",
    stop: "Stop sharing",
    guideTitle: "Switch the game to Borderless Windowed mode",
    guideIntro: "Before sharing, set Monster Hunter Wilds to Borderless Windowed display mode.",
    guideStep1: "Change the game's display mode to Borderless Windowed",
    guideStep2: "Confirm that the game is displayed correctly",
    guideStep3: "Continue and choose the game window or monitor in your browser",
    guideNote: "The browser cannot change the game's display mode automatically.",
    cancel: "Cancel",
    confirm: "I've switched · Choose screen",
    selecting: "Choosing a screen to share…",
    connected: "Screen sharing active",
    stopped: "Screen sharing stopped.",
    denied: "Screen sharing was cancelled or permission was denied.",
    unavailable: "Screen sharing is unavailable. Use HTTPS in an up-to-date Chrome or Edge browser on desktop.",
    failed: "Could not start screen sharing. Check the game's display mode and browser permissions.",
  },
  "zh-Hant": {
    title: "即時畫面分享",
    description: "連接遊戲畫面。OCR自動填入功能將於下一階段加入。",
    idle: "尚未連接",
    start: "開始分享畫面",
    stop: "停止分享",
    guideTitle: "請切換遊戲至無邊框視窗模式",
    guideIntro: "分享前請先將魔物獵人 荒野的顯示模式切換為「無邊框視窗」。",
    guideStep1: "在遊戲設定中切換至無邊框視窗模式",
    guideStep2: "確認遊戲畫面正常顯示",
    guideStep3: "繼續並在瀏覽器選擇遊戲視窗或螢幕",
    guideNote: "瀏覽器無法自動修改遊戲的顯示模式。",
    cancel: "取消",
    confirm: "已設定 · 選擇畫面",
    selecting: "正在選擇分享畫面…",
    connected: "正在分享畫面",
    stopped: "畫面分享已停止。",
    denied: "畫面分享已取消或未獲授權。",
    unavailable: "此瀏覽器不支援畫面分享。請在電腦上使用最新版Chrome或Edge並以HTTPS連接。",
    failed: "無法開始分享畫面。請檢查遊戲顯示模式與瀏覽器權限。",
  },
};

export function initializeScreenCapture(doc = document, nav = navigator) {
  const startButton = doc.querySelector("#capture-start");
  const stopButton = doc.querySelector("#capture-stop");
  const guide = doc.querySelector("#capture-guide");
  const cancelGuide = doc.querySelector("#capture-guide-cancel");
  const confirmGuide = doc.querySelector("#capture-guide-confirm");
  const status = doc.querySelector("#capture-status");
  const video = doc.querySelector("#capture-video");
  if (![startButton, stopButton, guide, cancelGuide, confirmGuide, status, video].every(Boolean)) return null;

  const copy = COPY[getLocale()] ?? COPY.ko;
  doc.querySelectorAll("[data-capture-copy]").forEach((node) => {
    const key = node.dataset.captureCopy;
    if (Object.hasOwn(copy, key)) node.textContent = copy[key];
  });

  let stream = null;
  let selecting = false;

  function setStatus(message, kind = "idle") {
    status.textContent = message;
    status.dataset.state = kind;
  }

  function releaseStream(message = copy.stopped) {
    const previous = stream;
    stream = null;
    video.pause();
    video.srcObject = null;
    if (previous) previous.getTracks().forEach((track) => track.stop());
    startButton.disabled = false;
    stopButton.disabled = true;
    setStatus(message);
    doc.dispatchEvent(new CustomEvent("gogma:screen-share-stopped"));
  }

  startButton.addEventListener("click", () => {
    if (selecting || stream) return;
    if (!nav.mediaDevices?.getDisplayMedia || !window.isSecureContext) {
      setStatus(copy.unavailable, "error");
      return;
    }
    guide.showModal();
  });

  cancelGuide.addEventListener("click", () => guide.close());

  confirmGuide.addEventListener("click", () => {
    // getDisplayMedia must be called directly inside a user-gesture handler.
    if (selecting || stream) return;
    guide.close();
    selecting = true;
    startButton.disabled = true;
    setStatus(copy.selecting, "selecting");

    let request;
    try {
      request = nav.mediaDevices.getDisplayMedia({ video: true, audio: false });
    } catch (error) {
      selecting = false;
      startButton.disabled = false;
      setStatus(error?.name === "NotAllowedError" ? copy.denied : copy.failed, "error");
      return;
    }

    Promise.resolve(request).then(async (newStream) => {
      selecting = false;
      const track = newStream.getVideoTracks()[0];
      if (!track) {
        newStream.getTracks().forEach((item) => item.stop());
        startButton.disabled = false;
        setStatus(copy.failed, "error");
        return;
      }
      stream = newStream;
      track.addEventListener("ended", () => {
        if (stream === newStream) releaseStream();
      }, { once: true });
      video.srcObject = newStream;
      try {
        await video.play();
      } catch {
        releaseStream(copy.failed);
        setStatus(copy.failed, "error");
        return;
      }
      if (stream !== newStream || track.readyState === "ended") return;
      stopButton.disabled = false;
      const { width, height } = track.getSettings();
      const resolution = width && height ? ` · ${width} × ${height}` : "";
      setStatus(copy.connected + resolution, "connected");
      // Future OCR modules can read frames from #capture-video while shared.
      doc.dispatchEvent(new CustomEvent("gogma:screen-share-started", { detail: { video } }));
    }).catch((error) => {
      selecting = false;
      startButton.disabled = false;
      setStatus(["NotAllowedError", "AbortError"].includes(error?.name) ? copy.denied : copy.failed, "error");
    });
  });

  stopButton.addEventListener("click", () => {
    if (stream) releaseStream();
  });
  window.addEventListener("pagehide", () => {
    if (stream) releaseStream();
  });
  setStatus(copy.idle);
  return { stop: () => { if (stream) releaseStream(); }, getVideo: () => stream ? video : null };
}

initializeScreenCapture();
