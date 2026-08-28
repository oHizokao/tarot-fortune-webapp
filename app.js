const DECK = Array.from(
  { length: 78 },
  (_, index) => `tarot-cards/card-${String(index + 1).padStart(3, "0")}.webp`,
);
const STORAGE_KEY = "tarot-daily-deck-v1";
const SESSION_KEY = "tarot-daily-session-v1";
const MAX_HISTORY = 60;

const state = {
  count: 1,
  drawn: [],
  remaining: [],
  notice: "",
  history: [],
  activeHistoryId: null,
  aiConversation: [],
  aiBackendAvailable: true,
  aiUser: null,
  aiCsrfToken: "",
  aiBusy: false,
  aiRequestVersion: 0,
  copyBusy: false,
};

const choiceButtons = [...document.querySelectorAll(".choice-button")];
const drawButton = document.querySelector("#draw-button");
const resetButton = document.querySelector("#reset-button");
const cardsGrid = document.querySelector("#cards-grid");
const emptyState = document.querySelector("#empty-state");
const resultCount = document.querySelector("#result-count");
const resultMessage = document.querySelector("#result-message");
const deckRemaining = document.querySelector("#deck-remaining");
const drawnCount = document.querySelector("#drawn-count");
const remainingCount = document.querySelector("#remaining-count");
const progressPercent = document.querySelector("#progress-percent");
const progressBar = document.querySelector("#progress-bar");
const drawButtonLabel = document.querySelector("#draw-button-label");
const copyButtons = [...document.querySelectorAll("[data-copy-result]")];
const copyStatus = document.querySelector("#copy-status");
const historySearch = document.querySelector("#history-search");
const clearHistoryButton = document.querySelector("#clear-history-button");
const historyCount = document.querySelector("#history-count");
const historyStatus = document.querySelector("#history-status");
const historyList = document.querySelector("#history-list");
const historyEmpty = document.querySelector("#history-empty");
const aiGuestPanel = document.querySelector("#ai-guest-panel");
const aiMemberPanel = document.querySelector("#ai-member-panel");
const aiQuestionPreview = document.querySelector("#ai-question-preview");
const betaLoginForm = document.querySelector("#beta-login-form");
const betaCodeInput = document.querySelector("#beta-code");
const betaLoginButton = document.querySelector("#beta-login-button");
const betaAuthStatus = document.querySelector("#beta-auth-status");
const aiUserStatus = document.querySelector("#ai-user-status");
const betaLogoutButton = document.querySelector("#beta-logout-button");
const aiQuestion = document.querySelector("#ai-question");
const askAiButton = document.querySelector("#ask-ai-button");
const aiRequestStatus = document.querySelector("#ai-request-status");
const aiAnswer = document.querySelector("#ai-answer");
const betaFocusButton = document.querySelector("#beta-focus-button");
let drawTimer = null;

function isValidDeckList(list) {
  return (
    Array.isArray(list) &&
    list.length <= DECK.length &&
    new Set(list).size === list.length &&
    list.every((card) => DECK.includes(card))
  );
}

function isValidHistoryList(list) {
  return (
    Array.isArray(list) &&
    list.length <= MAX_HISTORY &&
    list.every(
      (entry) =>
        entry &&
        typeof entry.id === "string" &&
        Number.isFinite(entry.createdAt) &&
        Array.isArray(entry.cards) &&
        entry.cards.length >= 1 &&
        entry.cards.length <= 3 &&
        isValidDeckList(entry.cards),
    )
  );
}

function isFreshBrowserSession() {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) !== "active";
  } catch {
    return true;
  }
}

function markBrowserSessionActive() {
  try {
    window.sessionStorage.setItem(SESSION_KEY, "active");
  } catch {
    // sessionStorage may be unavailable when the page is opened directly as a file.
  }
}

function loadSavedState() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    if (!saved || !isValidDeckList(saved.remaining)) {
      return null;
    }

    const restoreCurrentReading = !isFreshBrowserSession();

    return {
      remaining: saved.remaining,
      drawn: restoreCurrentReading && isValidDeckList(saved.drawn) ? saved.drawn.slice(0, 3) : [],
      notice: restoreCurrentReading && typeof saved.notice === "string" ? saved.notice : "",
      history: isValidHistoryList(saved.history)
        ? saved.history.map((entry) => ({
            id: entry.id,
            createdAt: entry.createdAt,
            cards: [...entry.cards],
          }))
        : [],
    };
  } catch {
    return null;
  }
}

function saveState() {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        remaining: state.remaining,
        drawn: state.drawn,
        notice: state.notice,
        history: state.history,
      }),
    );
  } catch {
    // localStorage may be unavailable when the page is opened directly as a file.
  }
}

function shuffle(items) {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }

  return shuffled;
}

function setCount(count) {
  state.count = count;

  choiceButtons.forEach((button) => {
    const isSelected = Number(button.dataset.count) === count;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });
}

function updateProgress() {
  const remaining = state.remaining.length;
  const opened = DECK.length - remaining;
  const percent = Math.round((opened / DECK.length) * 100);

  deckRemaining.textContent = String(remaining);
  drawnCount.textContent = String(opened);
  remainingCount.textContent = String(remaining);
  progressPercent.textContent = `${percent}%`;
  progressBar.style.width = `${percent}%`;
  progressBar.parentElement?.setAttribute("aria-valuenow", String(percent));

  const isEmpty = remaining === 0;
  drawButton.disabled = isEmpty;
  drawButtonLabel.textContent = isEmpty ? "สำรับหมดแล้ว" : "เปิดไพ่";
}

function getCardNumber(fileName) {
  return fileName.match(/card-(\d{3})/i)?.[1] ?? "—";
}

function formatHistoryTime(timestamp) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function setCopyStatus(message, isError = false) {
  copyStatus.textContent = message;
  copyStatus.classList.toggle("is-error", isError);
}

function updateCopyButton() {
  copyButtons.forEach((button) => {
    button.disabled = state.drawn.length === 0 || state.copyBusy;
  });
}

function showHistoryEntry(entry) {
  state.activeHistoryId = entry.id;
  state.drawn = [...entry.cards];
  state.notice = "กำลังดูชุดไพ่ก่อนหน้า กดเปิดไพ่เพื่อสุ่มชุดใหม่";
  resetAiReaderState();
  renderResult();
  renderHistory();
  document.querySelector("#result-title")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderHistory() {
  const query = historySearch.value.trim().toLowerCase();
  const visibleEntries = state.history
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry, index }) => {
      if (!query) {
        return true;
      }

      const searchText = [
        `ชุดที่ ${index + 1}`,
        formatHistoryTime(entry.createdAt),
        ...entry.cards.map(getCardNumber),
      ]
        .join(" ")
        .toLowerCase();

      return searchText.includes(query);
    });

  historyCount.textContent = state.history.length
    ? `${state.history.length} ชุดก่อนหน้า`
    : "ยังไม่มีชุดก่อนหน้า";
  historyStatus.textContent = query
    ? `พบ ${visibleEntries.length} ชุด`
    : state.history.length
      ? "แตะชุดใดก็ได้เพื่อดูซ้ำ"
      : "";
  clearHistoryButton.disabled = state.history.length === 0;
  historyList.replaceChildren();

  if (visibleEntries.length === 0) {
    historyEmpty.querySelector("p").textContent = query
      ? "ไม่พบชุดไพ่ที่ค้นหา"
      : "เปิดไพ่ชุดแรก แล้วประวัติจะปรากฏตรงนี้";
    historyList.append(historyEmpty);
    return;
  }

  visibleEntries.forEach(({ entry, index }) => {
    const historyButton = document.createElement("button");
    historyButton.type = "button";
    historyButton.className = "history-entry";
    historyButton.classList.toggle("is-current", state.activeHistoryId === entry.id);
    historyButton.setAttribute("aria-label", `ดูชุดไพ่ ${index + 1} จำนวน ${entry.cards.length} ใบ`);

    const top = document.createElement("span");
    top.className = "history-entry-top";

    const title = document.createElement("span");
    title.className = "history-entry-title";
    title.textContent = index === 0 ? "ชุดล่าสุด" : `ชุดก่อนหน้า ${index}`;

    const time = document.createElement("span");
    time.className = "history-entry-time";
    time.textContent = formatHistoryTime(entry.createdAt);
    top.append(title, time);

    const meta = document.createElement("span");
    meta.className = "history-entry-meta";
    meta.textContent = `${entry.cards.length} ใบ · ไพ่ ${entry.cards.map(getCardNumber).join(", ")}`;

    const miniCards = document.createElement("span");
    miniCards.className = "history-mini-cards";
    entry.cards.forEach((fileName, cardIndex) => {
      const image = document.createElement("img");
      const cardNumber = getCardNumber(fileName);
      image.className = "history-mini-card";
      image.src = `./${fileName}`;
      image.alt = `ไพ่ทำนายใบที่ ${cardNumber} ในชุดก่อนหน้า`;
      image.loading = "lazy";
      image.style.animationDelay = `${cardIndex * 70}ms`;
      miniCards.append(image);
    });

    historyButton.append(top, meta, miniCards);
    historyButton.addEventListener("click", () => showHistoryEntry(entry));
    historyList.append(historyButton);
  });
}

function loadCardImage(fileName) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`โหลดภาพ ${fileName} ไม่สำเร็จ`));
    image.src = `./${fileName}`;
  });
}

function drawRoundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function drawContainedImage(context, image, x, y, width, height) {
  const ratio = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * ratio;
  const drawHeight = image.naturalHeight * ratio;
  context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("สร้างรูปภาพไม่สำเร็จ"));
      }
    }, "image/png");
  });
}

async function createResultImage() {
  const images = await Promise.all(state.drawn.map(loadCardImage));
  const scale = 2;
  const padding = 48;
  const cardWidth = state.drawn.length === 1 ? 330 : 285;
  const cardHeight = 405;
  const gap = 18;
  const width = padding * 2 + cardWidth * images.length + gap * (images.length - 1);
  const height = 625;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const context = canvas.getContext("2d");
  context.scale(scale, scale);

  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#120d38");
  background.addColorStop(0.55, "#0a1736");
  background.addColorStop(1, "#25114d");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  const glow = context.createRadialGradient(width * 0.5, height * 0.55, 30, width * 0.5, height * 0.55, width * 0.65);
  glow.addColorStop(0, "rgba(118, 86, 255, 0.3)");
  glow.addColorStop(1, "rgba(118, 86, 255, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);

  context.fillStyle = "#ffe1a0";
  context.font = '600 14px "Kanit", sans-serif';
  context.fillText("✦  TAROT DAILY", padding, 44);
  context.fillStyle = "#f7faff";
  context.font = '500 26px "Kanit", sans-serif';
  context.fillText("คำทำนายของคุณ", padding, 79);
  context.fillStyle = "#9aaed0";
  context.font = '400 13px "Prompt", sans-serif';
  context.fillText(`${state.drawn.length} ใบที่เปิดได้ · เปิดไพ่เพื่อความบันเทิง`, padding, 103);

  images.forEach((image, index) => {
    const x = padding + index * (cardWidth + gap);
    const y = 145;
    drawRoundedRect(context, x, y, cardWidth, cardHeight, 18);
    context.fillStyle = "rgba(32, 21, 83, 0.9)";
    context.fill();
    context.save();
    drawRoundedRect(context, x + 12, y + 12, cardWidth - 24, cardHeight - 24, 13);
    context.clip();
    drawContainedImage(context, image, x + 18, y + 25, cardWidth - 36, cardHeight - 58);
    context.restore();
    context.strokeStyle = "rgba(221, 188, 255, 0.28)";
    context.lineWidth = 1;
    drawRoundedRect(context, x, y, cardWidth, cardHeight, 18);
    context.stroke();
    context.fillStyle = "#dfd1ff";
    context.font = '400 11px "Prompt", sans-serif';
    context.fillText(`ไพ่ใบที่ ${index + 1} · NO. ${getCardNumber(state.drawn[index])}`, x + 18, y + cardHeight - 16);
  });

  return canvasToBlob(canvas);
}

function downloadBlob(blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "tarot-daily-set.png";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

async function copyResultImage() {
  if (state.drawn.length === 0 || state.copyBusy || copyButtons.some((button) => button.classList.contains("is-busy"))) {
    return;
  }

  state.copyBusy = true;
  copyButtons.forEach((button) => {
    button.classList.add("is-busy");
    button.disabled = true;
  });
  setCopyStatus("กำลังสร้างรูปภาพ...");

  try {
    const blob = await createResultImage();
    if (navigator.clipboard?.write && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setCopyStatus("คัดลอกรูปภาพชุดนี้แล้ว");
    } else {
      downloadBlob(blob);
      setCopyStatus("เบราว์เซอร์นี้ Copy ไม่ได้ จึงดาวน์โหลดภาพให้แทน");
    }
  } catch {
    setCopyStatus("คัดลอกไม่ได้ ลองกดอีกครั้งนะครับ", true);
  } finally {
    state.copyBusy = false;
    copyButtons.forEach((button) => button.classList.remove("is-busy"));
    updateCopyButton();
  }
}

function createApiError(message, status = 0, code = "") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

async function fetchApiJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const raw = await response.text();
  let data;

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw createApiError(
      response.status === 404
        ? "ยังไม่ได้ติดตั้ง AI backend บนโฮสต์นี้"
        : "เซิร์ฟเวอร์ส่งคำตอบที่อ่านไม่ได้",
      response.status,
      "INVALID_JSON",
    );
  }

  if (!response.ok || data.ok === false) {
    throw createApiError(
      data.message || data.error || "ทำรายการไม่สำเร็จ",
      response.status,
      data.code || "REQUEST_FAILED",
    );
  }

  return data;
}

function formatAccessExpiry(value) {
  if (!value) {
    return "ไม่พบวันหมดอายุ";
  }

  try {
    return new Intl.DateTimeFormat("th-TH", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function setAiStatus(element, message, isError = false) {
  if (!element) {
    return;
  }

  element.textContent = message;
  element.classList.toggle("is-error", isError);
}

function clearAiAnswer() {
  state.aiConversation = [];
  aiAnswer?.replaceChildren();
}

function renderAiAnswer(answer) {
  aiAnswer.replaceChildren();
  const paragraphs = String(answer)
    .split(/\n{2,}|\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  paragraphs.forEach((paragraph, index) => {
    const line = document.createElement("p");
    line.className = "ai-answer-line";
    line.style.setProperty("--answer-delay", `${index * 120}ms`);
    line.textContent = paragraph;
    aiAnswer.append(line);
  });
}

function syncAiControls() {
  if (!state.aiUser) {
    return;
  }

  const hasQuestion = aiQuestion.value.trim().length > 0;
  const hasCards = state.drawn.length > 0;
  askAiButton.disabled = state.aiBusy || !hasCards || !hasQuestion || !state.aiBackendAvailable;

  if (!hasCards) {
    setAiStatus(aiRequestStatus, "เปิดไพ่ก่อน แล้วพิมพ์คำถามได้เลย");
  } else if (!state.aiBusy && !aiAnswer.childElementCount) {
    setAiStatus(aiRequestStatus, hasQuestion ? "พร้อมเชื่อมคำบนไพ่กับคำถามของคุณ" : "พิมพ์คำถาม แล้วกดถาม AI Tarot Reader");
  }
}

function setAiLoggedOut(message = "ใส่ Beta Access Code เพื่อใช้ AI Tarot Reader", isError = false) {
  state.aiRequestVersion += 1;
  state.aiBusy = false;
  clearAiAnswer();
  state.aiUser = null;
  state.aiCsrfToken = "";
  aiGuestPanel.hidden = false;
  aiMemberPanel.hidden = false;
  betaLogoutButton.hidden = true;
  aiUserStatus.hidden = true;
  betaCodeInput.value = "";
  aiQuestion.value = "";
  setAiStatus(betaAuthStatus, message, isError);
  setAiStatus(aiRequestStatus, "พิมพ์คำถามไว้ได้ แล้วเข้าสู่ Beta เพื่อส่งคำถามให้ AI");
  askAiButton.disabled = true;
}

function setAiLoggedIn(user, csrfToken = "") {
  state.aiUser = user;
  state.aiCsrfToken = csrfToken;
  aiGuestPanel.hidden = true;
  aiMemberPanel.hidden = false;
  betaLogoutButton.hidden = false;
  aiUserStatus.hidden = false;
  betaCodeInput.value = "";
  aiUserStatus.textContent = user.role === "admin"
    ? `${user.name || user.username || "ผู้ดูแล"} · สิทธิ์ผู้ดูแลใช้งานได้ตลอด`
    : `${user.name || user.username || "สมาชิก"} · ใช้ได้ถึง ${formatAccessExpiry(user.access_expires_at)}`;
  setAiStatus(aiRequestStatus, state.drawn.length ? "พร้อมเชื่อมคำบนไพ่กับคำถามของคุณ" : "เปิดไพ่ก่อน แล้วพิมพ์คำถามได้เลย");
  syncAiControls();
}

function resetAiReaderState() {
  state.aiRequestVersion += 1;
  state.aiBusy = false;
  clearAiAnswer();
  if (aiQuestion) {
    aiQuestion.value = "";
  }
  if (state.aiUser) {
    setAiStatus(aiRequestStatus, state.drawn.length ? "ชุดไพ่ใหม่พร้อมให้ถามแล้ว" : "เปิดไพ่ก่อน แล้วพิมพ์คำถามได้เลย");
  }
  syncAiControls();
}

async function loadBetaSession() {
  try {
    const data = await fetchApiJson("/api/auth/me");
    if (data.backend_configured === false) {
      state.aiBackendAvailable = false;
      setAiLoggedOut("โหมดเปิดไพ่ใช้ฟรีพร้อมใช้งานแล้ว — กรุณาตั้งค่า Neon DATABASE_URL ใน Vercel เพื่อเปิด Beta และ AI");
      return;
    }
    state.aiBackendAvailable = true;
    if (data.authenticated && data.user?.ai_enabled) {
      setAiLoggedIn(data.user, data.csrf_token || "");
    } else if (data.authenticated && data.user) {
      setAiLoggedOut("เข้าสู่ระบบแล้ว แต่บัญชียังไม่ได้รับสิทธิ์ AI จากผู้ดูแล");
    } else {
      setAiLoggedOut("เข้าสู่ระบบเพื่อใช้ AI Tarot Reader");
    }
  } catch (error) {
    const setupError = ["DATABASE_NOT_CONFIGURED", "SERVER_CONFIG_MISSING", "INVALID_JSON"].includes(error.code) || error.status === 404;
    state.aiBackendAvailable = !setupError;
    betaLoginButton.disabled = false;
    setAiStatus(
      betaAuthStatus,
      setupError
        ? "โหมดเปิดไพ่ใช้ฟรีพร้อมใช้งานแล้ว — ตั้งค่า Neon DATABASE_URL ใน Vercel เพื่อเปิดล็อกอินและ AI"
        : "ยังเชื่อมต่อ AI backend ไม่ได้ ลองใหม่อีกครั้งภายหลัง",
      !setupError,
    );
    syncAiControls();
  }
}

async function loginBeta() {
  const accessCode = betaCodeInput.value.trim();
  if (!accessCode) {
    setAiStatus(betaAuthStatus, "กรุณากรอก Beta Access Code ก่อน", true);
    return;
  }

  betaLoginButton.disabled = true;
  setAiStatus(betaAuthStatus, "กำลังตรวจสอบรหัส...");

  try {
    const data = await fetchApiJson("/api/auth/beta-login", {
      method: "POST",
      body: JSON.stringify({ access_code: accessCode }),
    });
    state.aiBackendAvailable = true;
    clearAiAnswer();
    setAiLoggedIn(data.user, data.csrf_token || "");
  } catch (error) {
    setAiStatus(betaAuthStatus, error.message || "รหัสไม่ถูกต้องหรือหมดอายุแล้ว", true);
  } finally {
    betaLoginButton.disabled = false;
  }
}

async function logoutBeta() {
  betaLogoutButton.disabled = true;
  try {
    await fetchApiJson("/api/auth/logout", { method: "POST", body: "{}" });
  } catch {
    // Clear the local UI even if the host is temporarily unavailable.
  } finally {
    setAiLoggedOut("ออกจาก Beta แล้ว");
    betaLogoutButton.disabled = false;
  }
}

function getCardFileName(fileName) {
  return fileName.match(/card-\d{3}\.webp$/i)?.[0] || fileName;
}

async function askAi() {
  if (!state.aiUser) {
    setAiStatus(betaAuthStatus, "กรุณาเข้าสู่ Beta ก่อนใช้ AI Tarot Reader", true);
    return;
  }

  if (state.drawn.length === 0) {
    setAiStatus(aiRequestStatus, "เปิดไพ่ก่อน แล้วจึงถาม AI ได้", true);
    return;
  }

  const question = aiQuestion.value.trim();
  if (!question) {
    setAiStatus(aiRequestStatus, "พิมพ์คำถามของคุณก่อนนะครับ", true);
    aiQuestion.focus();
    return;
  }

  state.aiBusy = true;
  const requestVersion = state.aiRequestVersion;
  askAiButton.disabled = true;
  setAiStatus(aiRequestStatus, "กำลังอ่านคำบนไพ่และเชื่อมโยงกับคำถาม...");

  try {
    const data = await fetchApiJson("/api/ai/tarot-chat", {
      method: "POST",
      headers: { "X-CSRF-Token": state.aiCsrfToken },
      body: JSON.stringify({
        question,
        cards: state.drawn.map(getCardFileName),
        conversation: state.aiConversation.slice(-4),
      }),
    });
    const answer = String(data.answer || data.output_text || "").trim();
    if (!answer) {
      throw createApiError("AI ไม่ได้ส่งคำตอบกลับมา ลองถามอีกครั้ง", 502, "EMPTY_AI_RESPONSE");
    }
    if (requestVersion !== state.aiRequestVersion) {
      return;
    }

    state.aiConversation.push({ role: "user", content: question });
    state.aiConversation.push({ role: "assistant", content: answer });
    renderAiAnswer(answer);
    setAiStatus(aiRequestStatus, "คำตอบนี้เป็นแนวทางสะท้อนความคิด ไม่ใช่คำตัดสินชีวิต");
    aiAnswer.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    if (error.status === 401 || error.code === "BETA_AUTH_REQUIRED") {
      setAiLoggedOut("เซสชันหมดอายุ กรุณาเข้าสู่ Beta ใหม่", true);
    } else if (error.status === 403 || error.code === "BETA_ACCESS_EXPIRED") {
      setAiLoggedOut("Beta Access หมดอายุแล้ว กรุณาติดต่อผู้ดูแล", true);
    } else {
      setAiStatus(aiRequestStatus, error.message || "ขออภัย ระบบยังตอบไม่ได้ ลองใหม่อีกครั้ง", true);
    }
  } finally {
    if (requestVersion === state.aiRequestVersion) {
      state.aiBusy = false;
      syncAiControls();
    }
  }
}

function createCard(fileName, position) {
  const card = document.createElement("article");
  card.className = "result-card";
  card.style.setProperty("--reveal-delay", `${position * 180}ms`);
  const cardNumber = getCardNumber(fileName);
  card.innerHTML = `
    <div class="card-meta">
      <span>NO. ${cardNumber}</span>
      <span>TAROT CARD</span>
    </div>
    <div class="card-art">
      <img src="./${fileName}" alt="ไพ่ทำนายใบที่ ${cardNumber}" />
    </div>
    <span class="card-caption">ไพ่ใบที่ ${position + 1}</span>
  `;
  return card;
}

function renderResult() {
  if (state.drawn.length === 0) {
    cardsGrid.classList.add("is-empty");
    cardsGrid.replaceChildren(emptyState);
    resultCount.textContent = "ยังไม่ได้เปิดไพ่";
    resultMessage.textContent = state.notice || "คำทำนายเป็นแนวทาง ใช้หัวใจของคุณตัดสินใจเสมอ";
    updateCopyButton();
    syncAiControls();
    return;
  }

  cardsGrid.classList.remove("is-empty");
  cardsGrid.replaceChildren(...state.drawn.map(createCard));
  resultCount.textContent = `${state.drawn.length} ใบที่เปิดได้`;
  resultMessage.textContent = state.notice || "ขอให้คำทำนายนี้นำพลังดี ๆ มาให้คุณ";
  updateCopyButton();
  syncAiControls();
}

function drawCards() {
  if (drawButton.disabled || drawButton.classList.contains("is-busy")) {
    return;
  }

  drawButton.classList.add("is-busy");
  drawButton.disabled = true;
  drawButton.setAttribute("aria-busy", "true");

  drawTimer = window.setTimeout(() => {
    const requestedCount = state.count;
    const actualCount = Math.min(requestedCount, state.remaining.length);
    state.drawn = state.remaining.splice(0, actualCount);
    state.activeHistoryId = null;
    resetAiReaderState();

    if (actualCount > 0) {
      state.history.unshift({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        createdAt: Date.now(),
        cards: [...state.drawn],
      });
      state.history = state.history.slice(0, MAX_HISTORY);
    }

    if (state.remaining.length === 0) {
      state.notice = "เปิดครบทั้งสำรับแล้ว กด “ล้างคำทำนาย” เพื่อเริ่มใหม่";
    } else if (actualCount < requestedCount) {
      state.notice = `สำรับเหลือ ${actualCount} ใบ ระบบจึงเปิดให้ครบเท่าที่เหลือ`;
    } else {
      state.notice = "";
    }

    saveState();
    updateProgress();
    renderResult();
    renderHistory();
    drawButton.classList.remove("is-busy");
    drawButton.removeAttribute("aria-busy");
    drawTimer = null;
  }, 260);
}

function resetCards() {
  if (drawTimer !== null) {
    window.clearTimeout(drawTimer);
    drawTimer = null;
    drawButton.classList.remove("is-busy");
    drawButton.removeAttribute("aria-busy");
  }

  state.remaining = shuffle(DECK);
  state.drawn = [];
  state.activeHistoryId = null;
  state.notice = "เริ่มสำรับใหม่แล้ว ไพ่ทั้ง 78 ใบพร้อมให้เปิดอีกครั้ง";
  resetAiReaderState();
  saveState();
  updateProgress();
  renderResult();
  renderHistory();
}

function clearHistory() {
  if (state.history.length === 0) {
    return;
  }

  state.history = [];
  state.activeHistoryId = null;
  saveState();
  renderHistory();
  historyStatus.textContent = "ล้างประวัติแล้ว";
}

choiceButtons.forEach((button) => {
  button.addEventListener("click", () => setCount(Number(button.dataset.count)));
});

drawButton.addEventListener("click", drawCards);
resetButton.addEventListener("click", resetCards);
copyButtons.forEach((button) => button.addEventListener("click", copyResultImage));
historySearch.addEventListener("input", renderHistory);
clearHistoryButton.addEventListener("click", clearHistory);
betaLoginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  loginBeta();
});
betaLogoutButton.addEventListener("click", logoutBeta);
aiQuestion.addEventListener("input", syncAiControls);
askAiButton.addEventListener("click", askAi);
betaFocusButton.addEventListener("click", () => {
  betaCodeInput.focus();
  betaCodeInput.scrollIntoView({ behavior: "smooth", block: "center" });
});

const savedState = loadSavedState();
state.remaining = savedState?.remaining ?? shuffle(DECK);
state.drawn = savedState?.drawn ?? [];
state.notice = savedState?.notice ?? "";
state.history = savedState?.history ?? [];
if (isFreshBrowserSession() && state.remaining.length === 0) {
  state.remaining = shuffle(DECK);
  state.notice = "เริ่มรอบใหม่อัตโนมัติแล้ว ไพ่ทั้ง 78 ใบพร้อมให้เปิดอีกครั้ง";
  saveState();
}
markBrowserSessionActive();
updateProgress();
renderResult();
renderHistory();
loadBetaSession();
