import { messageForError } from "../lib/client/error-copy.js";
import { createLocalDeckSession, drawNextRound, normalizeLocalDeckSession, resetLocalDeckSession } from "./deck-session.mjs";
import { groupReadingHistory } from "./reading-sets.mjs";

const STORAGE_KEY = "tarot-daily-ai-reading-v3";
const LEGACY_STORAGE_KEY = "tarot-daily-ai-reading-v2";
const MAX_HISTORY = 78;
const DECK_SIZE = 78;
const FAN_CARD_COUNT = 7;
const state = {
  count: 1,
  localSession: null,
  savedServerSessionId: "",
  sessionId: "",
  serverSession: null,
  serverHistory: [],
  rounds: [],
  history: [],
  currentRoundId: "",
  viewingHistorySessionId: "",
  historyBusy: false,
  drawn: [],
  user: null,
  csrf: "",
  backend: true,
  busy: false,
  fanPhase: "ready",
  requestVersion: 0,
  failedQuestion: "",
  failedErrorCode: "",
  failedRequestId: "",
};

const $ = (selector) => document.querySelector(selector);
const choiceButtons = [...document.querySelectorAll(".choice-button")];

function randomId(prefix = "request") {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sleep(milliseconds) {
  return new Promise((resolve) => { window.setTimeout(resolve, milliseconds); });
}

function textValue(value, maxLength = 2_000) { return String(value ?? "").trim().slice(0, maxLength); }

function currentRound() {
  return state.rounds.find((round) => round.id === state.currentRoundId) || null;
}

function hasAnswer() {
  const round = currentRound();
  return Boolean(round?.answer || round?.structured);
}

function currentQuestionField() { return $("#ai-question"); }
function currentQuestionValue() { return textValue(currentQuestionField()?.value); }
function hasQuestion() { return currentQuestionValue().length > 0; }
function hasAiAccess() { return Boolean(state.user?.ai_enabled && !state.user?.must_change_password); }
function isMemberMode() { return Boolean(state.user); }
function isViewingHistory() { return Boolean(state.viewingHistorySessionId); }

function remainingCount() {
  if (isMemberMode() && hasAiAccess()) return Math.max(0, Number(state.serverSession?.remaining ?? DECK_SIZE));
  return Math.max(0, Number(state.localSession?.deckOrder?.length || DECK_SIZE) - Number(state.localSession?.cursor || 0));
}

function openedCount() {
  if (isMemberMode() && hasAiAccess()) return Math.max(0, Number(state.serverSession?.opened_count ?? state.serverSession?.draw_cursor ?? 0));
  return Math.max(0, Number(state.localSession?.cursor || 0));
}

function normalizedQuestion(value) { return textValue(value, 2_000).replace(/\s+/g, " ").toLocaleLowerCase("th"); }

function duplicateCurrentQuestion(value = currentQuestionValue()) {
  const latest = currentRound();
  return Boolean(hasAnswer() && latest?.question && normalizedQuestion(value) === normalizedQuestion(latest.question));
}

function setReadingState() {
  const app = $("#ai-reader-app");
  if (!app) return;
  app.dataset.readingState = hasAnswer() ? "answered" : currentRound() ? "drawn" : "empty";
}

function renderQuestionComposer() {
  const stage = $("#question-stage");
  if (!stage) return;
  const enabled = hasAiAccess();
  const answered = hasAnswer();
  stage.hidden = !enabled || isViewingHistory();
  stage.dataset.composerMode = answered ? "follow-up" : "initial";
  $("#question-kicker")?.replaceChildren(document.createTextNode(answered ? "คำถามรอบใหม่" : "01 / YOUR QUESTION"));
  $("#question-title")?.replaceChildren(document.createTextNode(answered ? "ถามคำถามใหม่" : "พิมพ์คำถามของคุณ"));
  $("#question-description")?.replaceChildren(document.createTextNode(answered
    ? "พิมพ์คำถามใหม่ แล้วเลือกจำนวนไพ่เพื่อเปิดรอบถัดไปจากสำรับเดิม"
    : "เขียนเรื่องที่ต้องการถามให้ชัดเจน คำถามนี้จะเป็นแกนหลักของคำทำนาย"));
  $("#question-label")?.replaceChildren(document.createTextNode(answered ? "คำถามรอบถัดไป" : "คำถามของคุณ"));
  const field = $("#ai-question");
  if (field) {
    field.placeholder = answered ? "เช่น แล้วก้าวต่อไปเรื่องนี้ควรเป็นอย่างไร?" : "เช่น ตอนนี้ฉันควรเริ่มจัดการความกังวลเรื่องงานจากตรงไหนดี?";
    field.setAttribute("aria-label", answered ? "คำถามรอบถัดไป" : "คำถามของคุณ");
  }
  $("#question-hint")?.replaceChildren(document.createTextNode(answered
    ? "คำถามนี้จะใช้เปิดไพ่ชุดใหม่ และระบบจะจำบริบทจากรอบก่อนหน้าไว้"
    : "ยิ่งระบุเรื่องที่อยากรู้ชัด คำทำนายจากไพ่ก็จะตรงกับคำถามมากขึ้น"));
  $("#account-callout")?.classList.toggle("is-follow-up", answered);
  setReadingState();
}

function initMotion() {
  const app = $("#ai-reader-app");
  if (!app) return;
  app.classList.add("motion-always-on");
  app.dataset.motionEnabled = "true";
  try { localStorage.removeItem("tarot-daily-motion-enabled"); } catch { /* storage may be disabled */ }
}

function setCount(count) {
  state.count = Number(count);
  choiceButtons.forEach((button) => {
    const selected = Number(button.dataset.count) === state.count;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  renderProgress();
}

function setReaderMode(user) {
  const member = Boolean(user);
  const aiEnabled = Boolean(user?.ai_enabled && !user?.must_change_password);
  const app = $("#ai-reader-app");
  if (app) app.dataset.readerMode = member ? "member" : "guest";
  document.querySelectorAll(".member-only").forEach((element) => { element.hidden = !member; });
  $("#question-stage")?.toggleAttribute("hidden", !aiEnabled);
  if (!aiEnabled) $("#ai-answer-stage")?.toggleAttribute("hidden", true);
  const guestBanner = $("#guest-mode-banner");
  if (guestBanner) guestBanner.hidden = member;
  const copy = member
    ? {
      brand: "WITCH AI READER",
      eyebrow: "AI TAROT · QUESTION FIRST",
      primary: "ถามไพ่ในเรื่องที่อยู่ใจ",
      secondary: "แล้วรับคำตอบให้ชัดเจน",
      description: "พิมพ์คำถาม เลือกจำนวนไพ่ แล้วกดเปิดไพ่ คำตอบจะอ่านจากคำบนไพ่และตอบตรงกับเรื่องที่คุณถาม",
      spread: "เลือก 1, 2 หรือ 3 ใบ · ทุกครั้งจะหยิบต่อจากสำรับเดิม",
      cards: "ไพ่ที่เปิดได้",
      seal: "AI\nREADING",
    }
    : {
      brand: "FREE CARD READER",
      eyebrow: "FREE READING · NO LOGIN",
      primary: "เปิดไพ่ด้วยตัวเอง",
      secondary: "ให้ไพ่เล่าเรื่องของคุณ",
      description: "เลือกจำนวนไพ่ เปิดทีละใบ แล้วอ่านภาพและคำบนไพ่ด้วยตัวเอง ไม่ต้องสมัครสมาชิก",
      spread: "เลือก 1, 2 หรือ 3 ใบ · เปิดต่อได้จนกว่าจะครบสำรับ",
      cards: "ไพ่ที่เปิดได้",
      seal: "FREE\nREADING",
    };
  $("#brand-mode-label")?.replaceChildren(document.createTextNode(copy.brand));
  $("#hero-eyebrow")?.replaceChildren(document.createTextNode(copy.eyebrow));
  $("#hero-title-primary")?.replaceChildren(document.createTextNode(copy.primary));
  $("#hero-title-secondary")?.replaceChildren(document.createTextNode(copy.secondary));
  $("#hero-description")?.replaceChildren(document.createTextNode(copy.description));
  $("#spread-description")?.replaceChildren(document.createTextNode(copy.spread));
  $("#cards-title")?.replaceChildren(document.createTextNode(copy.cards));
  $("#hero-seal-label")?.replaceChildren(...copy.seal.split("\n").map((line, index, all) => index < all.length - 1 ? [document.createTextNode(line), document.createElement("br")] : [document.createTextNode(line)]).flat());
  $("#spread-kicker")?.replaceChildren(document.createTextNode(member ? "02 / CHOOSE CARDS" : "01 / CHOOSE CARDS"));
  $("#reveal-kicker")?.replaceChildren(document.createTextNode(member ? "03 / THE REVEAL" : "02 / THE REVEAL"));
  const stepNumbers = member ? { question: "01", spread: "02", draw: "03", answer: "04" } : { spread: "01", draw: "02" };
  Object.entries(stepNumbers).forEach(([step, number]) => { $(`#flow-number-${step}`)?.replaceChildren(document.createTextNode(number)); });
  $("#account-title")?.replaceChildren(document.createTextNode(member ? (user.ai_enabled ? `พร้อมอ่านไพ่ให้ ${user.name || user.username}` : "บัญชีนี้ยังรอสิทธิ์ AI") : "เปิดไพ่ได้เลย"));
  $("#account-message")?.replaceChildren(document.createTextNode(member
    ? user.ai_enabled ? "พิมพ์คำถามก่อน แล้วกดเปิดไพ่ ระบบจะอ่านคำตอบให้ตรงกับคำถามและจำรอบก่อนหน้าไว้" : "บัญชีเข้าใช้งานแล้ว แต่ผู้ดูแลยังไม่ได้เปิดสิทธิ์ AI ให้บัญชีนี้"
    : "เลือกจำนวนไพ่แล้วกดเปิดไพ่ได้ทันที ถ้าอยากให้ AI ตอบคำถาม ให้เข้าใช้งานก่อน"));
  const accountAction = $("#account-action");
  if (accountAction) {
    accountAction.textContent = member ? "ออกจากระบบ" : "เข้าใช้งาน";
    accountAction.href = member ? "#question-title" : "../login/?next=/ai/";
    accountAction.dataset.action = member ? "logout" : "login";
  }
  const accountLink = $("#account-link");
  if (accountLink) {
    accountLink.textContent = member ? "ออกจากระบบ" : "เข้าใช้งาน";
    accountLink.href = member ? "#question-title" : "../login/?next=/ai/";
    accountLink.dataset.action = member ? "logout" : "login";
  }
  renderQuestionComposer();
}

function setWitchStatus(message, mode = "") {
  const element = $("#witch-status");
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("is-reading", mode === "reading");
  element.classList.toggle("is-ready", mode === "ready");
}

function ensureFanCards() {
  const fan = $("#tarot-fan");
  if (!fan) return [];
  if (fan.children.length === FAN_CARD_COUNT) return [...fan.children];

  fan.replaceChildren(...Array.from({ length: FAN_CARD_COUNT }, (_, index) => {
    const card = document.createElement("div");
    card.className = "tarot-fan-card";
    card.dataset.slot = String(index + 1);
    card.style.setProperty("--fan-slot", String(index + 1));

    const inner = document.createElement("div");
    inner.className = "tarot-fan-card__inner";

    const back = document.createElement("div");
    back.className = "tarot-fan-card__back";
    back.innerHTML = '<span aria-hidden="true">✦</span><small>เปิดไพ่</small>';

    const front = document.createElement("div");
    front.className = "tarot-fan-card__front";
    const image = document.createElement("img");
    image.loading = "eager";
    image.decoding = "async";
    const label = document.createElement("span");
    label.className = "tarot-fan-card__label";
    front.append(image, label);

    inner.append(back, front);
    card.append(inner);
    return card;
  }));
  return [...fan.children];
}

function renderFanBoard() {
  const board = $("#tarot-fan-board");
  if (!board) return;
  const fanCards = ensureFanCards();
  const round = currentRound();
  const hasCards = Boolean(round?.cards?.length);
  const phase = state.fanPhase === "ready" && hasCards && !isViewingHistory() ? "revealed" : state.fanPhase;
  const files = phase === "answering" || phase === "revealed" ? [...(round?.cards || [])] : [];
  const history = isViewingHistory();
  board.dataset.fanState = phase;
  board.dataset.cardCount = String(files.length);
  const selectedStart = Math.floor((FAN_CARD_COUNT - files.length) / 2);

  fanCards.forEach((card, index) => {
    const fileIndex = index - selectedStart;
    const file = fileIndex >= 0 && fileIndex < files.length ? files[fileIndex] : "";
    const image = card.querySelector("img");
    const label = card.querySelector(".tarot-fan-card__label");
    card.classList.toggle("is-revealed", Boolean(file));
    card.classList.toggle("is-selected", Boolean(file));
    card.setAttribute("aria-label", file ? `ไพ่ทำนายใบที่ ${fileIndex + 1}` : `ไพ่คว่ำใบที่ ${index + 1}`);
    if (file) {
      image.src = `../tarot-cards/${file}`;
      image.alt = `ไพ่ทำนายใบที่ ${fileIndex + 1}`;
      label.textContent = `ไพ่ใบที่ ${fileIndex + 1}`;
    } else {
      image.removeAttribute("src");
      image.alt = "";
      label.textContent = "";
    }
  });

  const title = $("#tarot-fan-title");
  const message = $("#tarot-fan-message");
  if (phase === "shuffling") {
    title && (title.textContent = "กำลังสับไพ่…");
    message && (message.textContent = "ไพ่กำลังหมุนออกมาทีละใบ");
  } else if (phase === "answering") {
    title && (title.textContent = `ไพ่เปิดแล้ว · ${files.length} ใบ`);
    message && (message.textContent = "กำลังอ่านคำบนไพ่ให้ตรงกับคำถามของคุณ");
  } else if (phase === "revealed" && history) {
    title && (title.textContent = `ประวัติการเปิดไพ่ · ${files.length} ใบ`);
    message && (message.textContent = "กำลังดูผลของรอบก่อนหน้า");
  } else if (phase === "revealed") {
    title && (title.textContent = `ไพ่ของรอบนี้ · ${files.length} ใบ`);
    message && (message.textContent = "เลื่อนลงเพื่ออ่านความหมายและคำทำนาย");
  } else {
    title && (title.textContent = "สำรับพร้อมแล้ว");
    message && (message.textContent = "เลือกจำนวนไพ่ แล้วกด “เปิดไพ่”");
  }
}

function setFanPhase(phase) {
  state.fanPhase = phase;
  renderFanBoard();
}

function renderWaitingRitual() {
  const round = currentRound();
  const waiting = Boolean(hasAiAccess() && state.busy && round?.cards?.length && !hasAnswer() && !isViewingHistory());
  $("#tarot-waiting-ritual")?.toggleAttribute("hidden", !waiting);
  $("#ai-reader-app")?.toggleAttribute("data-ai-waiting", waiting);
}

function renderFlow() {
  const questionReady = !isMemberMode() || hasQuestion();
  const hasSpread = Boolean(state.currentRoundId);
  const answered = hasAnswer();
  const current = hasAiAccess()
    ? !questionReady ? "question" : !hasSpread ? "spread" : !answered ? "draw" : "answer"
    : !hasSpread ? "spread" : "draw";
  const steps = [
    ["question", hasAiAccess() && questionReady],
    ["spread", hasSpread],
    ["draw", hasSpread],
    ["answer", isMemberMode() && answered],
  ];
  steps.forEach(([step, complete]) => {
    const element = $(`#flow-step-${step}`);
    if (!element) return;
    element.classList.toggle("is-current", current === step);
    element.classList.toggle("is-complete", complete);
    if (current === step) element.setAttribute("aria-current", "step");
    else element.removeAttribute("aria-current");
  });
}

function renderProgress() {
  const opened = openedCount();
  const remaining = remainingCount();
  const percent = Math.round((opened / DECK_SIZE) * 100);
  $("#remaining-count").textContent = String(remaining);
  $("#opened-count").textContent = String(opened);
  $("#progress-bar").style.width = `${percent}%`;
  $(".progress-track")?.setAttribute("aria-valuenow", String(opened));
  const empty = remaining === 0;
  const round = currentRound();
  const hasSpread = Boolean(round);
  const answered = hasAnswer();
  const question = currentQuestionValue();
  const historyView = isViewingHistory();
  const aiQuestionBlocked = hasAiAccess() && hasSpread && (!answered || !question || duplicateCurrentQuestion(question));
  const questionReady = !hasAiAccess() || Boolean(question);
  $("#draw-button").disabled = empty || state.busy || historyView || aiQuestionBlocked || !questionReady;
  $("#reset-button").disabled = state.busy || historyView;
  choiceButtons.forEach((button) => { button.disabled = state.busy || historyView || (hasAiAccess() && hasSpread && !answered); });
  $("#draw-label").textContent = empty ? "สำรับหมดแล้ว" : "เปิดไพ่";
  $("#deck-message").textContent = historyView
    ? "กำลังดูประวัติเดิม · กดเริ่มดูดวงใหม่ด้านบนเมื่อต้องการเปิดรอบใหม่"
    : empty
    ? "เปิดครบทั้ง 78 ใบแล้ว กดล้างไพ่และสับใหม่เพื่อเริ่มต้นอีกครั้ง"
    : !hasAiAccess()
      ? `เปิดแล้ว ${opened} ใบ · กดเปิดไพ่ต่อได้ ไพ่จะไม่ซ้ำกัน`
      : !hasSpread
        ? questionReady ? `คำถามพร้อมแล้ว · กดเปิดไพ่ (เหลือ ${remaining} ใบ)` : "ขั้นที่ 1: พิมพ์คำถามก่อน แล้วจึงกดเปิดไพ่"
        : !answered
          ? "ไพ่เปิดแล้ว · กำลังเตรียมคำทำนาย"
          : duplicateCurrentQuestion(question)
            ? "พิมพ์คำถามใหม่เพื่อเปิดไพ่รอบถัดไป"
            : question ? `คำถามรอบใหม่พร้อมแล้ว · กดเปิดไพ่ (เหลือ ${remaining} ใบ)` : "คำตอบพร้อมแล้ว · พิมพ์คำถามรอบถัดไป";
  if (empty) setWitchStatus("เปิดครบทั้งสำรับแล้ว · เริ่มสำรับใหม่ได้เลย");
  else if (state.busy) setWitchStatus(hasAnswer() ? "กำลังอ่านคำทำนาย..." : "กำลังสับไพ่...", "reading");
  else if (hasAnswer()) setWitchStatus(question && !duplicateCurrentQuestion(question) ? "คำถามใหม่พร้อมแล้ว · กดเปิดไพ่" : "คำตอบพร้อมแล้ว · พิมพ์คำถามใหม่", "ready");
  else if (hasSpread) setWitchStatus(isMemberMode() ? "ไพ่เปิดแล้ว · กำลังเตรียมคำตอบ" : "ไพ่เปิดแล้ว · เปิดต่อได้เลย", "ready");
  else if (hasAiAccess() && questionReady) setWitchStatus("คำถามพร้อมแล้ว · กดเปิดไพ่");
  else if (hasAiAccess()) setWitchStatus("รอคำถามของคุณ");
  else setWitchStatus("พร้อมเปิดไพ่");
  renderWaitingRitual();
  renderQuestionComposer();
  renderFlow();
}

function getNumber(file) { return String(file).match(/card-(\d{3})/)?.[1] || "—"; }

function createCardElement(file, index, imageIndex = index) {
  const card = document.createElement("article");
  card.className = "tarot-card-card";
  card.dataset.cardFile = file;
  card.style.setProperty("--card-delay", `${Math.min(8, index) * 180}ms`);
  const image = document.createElement("img");
  image.src = `../tarot-cards/${file}`;
  image.alt = `ไพ่ทำนายใบที่ ${index + 1}`;
  image.loading = imageIndex < 6 ? "eager" : "lazy";
  image.decoding = "async";
  const meta = document.createElement("div");
  meta.className = "card-meta";
  meta.textContent = `CARD ${getNumber(file)} · ไพ่ใบที่ ${index + 1}`;
  card.append(image, meta);
  return card;
}

function formatReadingSetTime(timestamp) {
  if (!timestamp) return "เวลาไม่ระบุ";
  try { return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp)); } catch { return "เวลาไม่ระบุ"; }
}

function createReadingSetElement(entry, setIndex, cardOffset) {
  const readingSet = document.createElement("section");
  readingSet.className = "reading-set";
  readingSet.dataset.setId = entry.id;
  readingSet.dataset.cardCount = String(entry.cardCount);
  readingSet.classList.toggle("is-current", setIndex === 0);
  readingSet.setAttribute("aria-label", `ชุดที่ ${entry.setNumber} จำนวน ${entry.cardCount} ใบ`);

  const heading = document.createElement("div");
  heading.className = "reading-set-heading";
  const title = document.createElement("div");
  title.className = "reading-set-title";
  const titleLabel = document.createElement("strong");
  titleLabel.textContent = `ชุดที่ ${entry.setNumber}`;
  const titleState = document.createElement("span");
  titleState.textContent = setIndex === 0 ? "เปิดล่าสุด" : "เปิดก่อนหน้านี้";
  title.append(titleLabel, titleState);
  const details = document.createElement("div");
  details.className = "reading-set-details";
  const amount = document.createElement("span");
  amount.textContent = `เปิด ${entry.cardCount} ใบ`;
  const time = document.createElement("time");
  time.dateTime = entry.createdAt ? new Date(entry.createdAt).toISOString() : "";
  time.textContent = formatReadingSetTime(entry.createdAt);
  details.append(amount, time);
  heading.append(title, details);

  const cardsGrid = document.createElement("div");
  cardsGrid.className = "cards-grid";
  cardsGrid.dataset.cardCount = String(entry.cardCount);
  entry.cards.forEach((file, cardIndex) => cardsGrid.append(createCardElement(file, cardIndex, cardOffset + cardIndex)));
  const setHint = document.createElement("p");
  setHint.className = "reading-set-hint";
  setHint.textContent = hasAiAccess() && setIndex === 0 ? "รอบล่าสุด · คำตอบ AI จะอ่านจากไพ่รอบนี้" : `ไพ่ ${entry.cardCount} ใบ · ไม่ซ้ำกับรอบอื่นในสำรับนี้`;
  readingSet.append(heading, cardsGrid, setHint);
  return readingSet;
}

function syncHistory() {
  state.history = [...state.rounds].reverse().map((round) => ({ id: round.id, createdAt: round.createdAt, cards: [...round.cards] })).slice(0, MAX_HISTORY);
}

function renderCards() {
  const setsContainer = $("#reading-sets");
  const readingSets = groupReadingHistory(state.history);
  if (!readingSets.length) {
    setsContainer.dataset.setCount = "0";
    setsContainer.classList.add("is-empty");
    setsContainer.innerHTML = hasAiAccess()
      ? '<div class="empty-card"><span>?</span><p>พิมพ์คำถามก่อน<br />แล้วกดเปิดไพ่</p></div>'
      : '<div class="empty-card"><span>?</span><p>เลือกจำนวนไพ่<br />แล้วกดเปิดไพ่</p></div>';
    $("#spread-count").textContent = "ยังไม่ได้เปิด";
    $("#reading-note").textContent = hasAiAccess() ? "คำตอบจะอ่านจากคำบนไพ่ของรอบล่าสุด" : "เปิดไพ่แล้วอ่านภาพและคำบนไพ่ด้วยตัวเองได้เลย";
    return;
  }
  setsContainer.dataset.setCount = String(readingSets.length);
  setsContainer.classList.remove("is-empty");
  let cardOffset = 0;
  const setElements = readingSets.map((entry, index) => {
    const element = createReadingSetElement(entry, index, cardOffset);
    cardOffset += entry.cardCount;
    return element;
  });
  setsContainer.replaceChildren(...setElements);
  const totalCards = readingSets.reduce((sum, entry) => sum + entry.cardCount, 0);
  $("#spread-count").textContent = `${readingSets.length} ชุด · ${totalCards} ใบ`;
  $("#reading-note").textContent = hasAiAccess() ? "แต่ละชุดแสดงแยกกัน · รอบล่าสุดคือชุดที่ใช้ตอบคำถามปัจจุบัน" : `เปิดแล้ว ${readingSets.length} ชุด · เลื่อนดูไพ่รอบก่อนหน้าได้`;
}

function historySessionTitle(session, index = 0) {
  return textValue(session?.latest_question || session?.latestQuestion || session?.title, 160) || `ดูดวงครั้งที่ ${index + 1}`;
}

function renderServerHistory() {
  const panel = $("#reading-history-panel");
  const list = $("#reading-history-list");
  if (!panel || !list) return;
  const sessions = isMemberMode()
    ? state.serverHistory.filter((session) => Number(session?.opened_count ?? session?.draw_cursor ?? 0) > 0)
    : [];
  panel.hidden = sessions.length === 0;
  list.replaceChildren(...sessions.map((session, index) => {
    const item = document.createElement("article");
    const selected = String(session.id) === state.viewingHistorySessionId;
    item.className = "reading-history-item";
    item.classList.toggle("is-selected", selected);

    const copy = document.createElement("div");
    copy.className = "reading-history-copy";
    const label = document.createElement("span");
    label.className = "reading-history-label";
    label.textContent = `รอบที่ ${sessions.length - index}`;
    const title = document.createElement("strong");
    title.textContent = historySessionTitle(session, index);
    const meta = document.createElement("p");
    const opened = Number(session.opened_count ?? session.draw_cursor ?? 0);
    const status = session.status === "active" ? "ยังเปิดอยู่" : "เก็บไว้ดูย้อนหลัง";
    meta.textContent = `${status} · เปิดแล้ว ${opened} ใบ · ${formatReadingSetTime(session.updated_at || session.created_at)}`;
    copy.append(label, title, meta);

    const action = document.createElement("button");
    action.className = "history-open-button";
    action.type = "button";
    action.textContent = selected ? "กำลังดู" : "ดูย้อนหลัง";
    action.disabled = state.historyBusy || selected;
    action.addEventListener("click", () => { void openHistorySession(session.id); });
    item.append(copy, action);
    return item;
  }));
}

function renderMemoryHistory() {
  const history = $("#memory-history");
  const list = $("#memory-history-list");
  const count = $("#memory-history-count");
  if (!history || !list || !count) return;
  const questions = state.rounds.filter((round) => round.question);
  list.replaceChildren(...questions.map((round) => {
    const item = document.createElement("li");
    item.textContent = round.question;
    return item;
  }));
  history.hidden = questions.length === 0;
  count.textContent = questions.length ? `${questions.length} คำถาม` : "";
}

function renderMemory() {
  const title = $("#memory-title");
  const message = $("#memory-message");
  const action = $("#new-reading-button");
  const status = $("#memory-status");
  if (!title || !message || !action || !status) return;
  const answeredRounds = state.rounds.filter((round) => round.answer || round.structured);
  const hasRounds = state.rounds.length > 0;
  action.disabled = !hasRounds || state.busy;
  status.classList.toggle("is-active", answeredRounds.length > 0);
  if (!hasRounds) {
    title.textContent = "Memory ของสำรับนี้ยังว่าง";
    message.textContent = "เมื่อเปิดไพ่และได้รับคำตอบ ระบบจะจำคำถามกับคำทำนายแต่ละรอบไว้";
  } else if (!answeredRounds.length) {
    title.textContent = "เปิดไพ่แล้ว · รอคำตอบ";
    message.textContent = isMemberMode() ? "คำถามนี้จะถูกบันทึกเป็นรอบแรกของสำรับ" : "โหมดฟรีเปิดไพ่ต่อได้ และอ่านความหมายด้วยตัวเอง";
  } else {
    const firstQuestion = textValue(state.rounds.find((round) => round.question)?.question, 90);
    title.textContent = "Memory พร้อม · เปิดรอบใหม่ได้";
    message.textContent = `จำแล้ว ${answeredRounds.length} รอบ · คำถามตั้งต้น: “${firstQuestion}${firstQuestion.length >= 90 ? "…" : ""}”`;
  }
  renderMemoryHistory();
}

function clearAnswer() {
  $("#ai-answer")?.replaceChildren();
  const retry = $("#retry-ai-button");
  if (retry) retry.hidden = true;
  if (!hasAnswer()) $("#ai-answer-stage")?.toggleAttribute("hidden", true);
}

function createAnswerHeading(label, number = "01") {
  const heading = document.createElement("div");
  heading.className = "answer-section-heading";
  const marker = document.createElement("span");
  marker.className = "answer-section-number";
  marker.textContent = number;
  const copy = document.createElement("div");
  const eyebrow = document.createElement("span");
  eyebrow.className = "answer-section-eyebrow";
  eyebrow.textContent = "TAROT READING";
  const title = document.createElement("h3");
  title.textContent = label;
  copy.append(eyebrow, title);
  heading.append(marker, copy);
  return heading;
}

function appendCopy(container, label, value, className = "answer-copy") {
  const row = document.createElement("div");
  row.className = "answer-detail-row";
  const title = document.createElement("strong");
  title.textContent = label;
  const paragraph = document.createElement("p");
  paragraph.className = className;
  paragraph.textContent = textValue(value, 4_000);
  row.append(title, paragraph);
  container.append(row);
}

function normalizeStructuredAnswer(value, round) {
  if (value && typeof value === "object") {
    const cards = Array.isArray(value.cards) ? value.cards.map((card, index) => ({
      position: Number(card?.position) || index + 1,
      name: textValue(card?.name, 240) || `ไพ่ใบที่ ${index + 1}`,
      meaning: textValue(card?.meaning, 2_000),
      prediction: textValue(card?.prediction, 3_000),
    })).filter((card) => card.meaning || card.prediction) : [];
    if (cards.length) return { verdict: textValue(value.verdict, 1_500), cards, overall_prediction: textValue(value.overall_prediction, 4_000), safety_note: textValue(value.safety_note, 1_500) };
  }
  const fallbackCards = (round?.cards || []).map((file, index) => ({ position: index + 1, name: `ไพ่ ${getNumber(file)}`, meaning: "อ่านจากคำบนไพ่ที่เปิด", prediction: textValue(round?.answer, 3_000) || "ยังไม่มีคำทำนาย" }));
  return { verdict: "คำทำนายจากไพ่พร้อมแล้ว", cards: fallbackCards, overall_prediction: textValue(round?.answer, 4_000) || "ยังไม่มีคำทำนายจากไพ่", safety_note: "" };
}

function renderAnswer(answer, structured = null, round = currentRound()) {
  const box = $("#ai-answer");
  if (!box || !round) return;
  const reading = normalizeStructuredAnswer(structured, { ...round, answer: answer || round.answer });
  box.replaceChildren();
  const verdict = document.createElement("section");
  verdict.className = "answer-section answer-section--verdict";
  verdict.dataset.answerKey = "verdict";
  verdict.style.setProperty("--answer-delay", "0ms");
  verdict.append(createAnswerHeading("คำฟันธงจากไพ่", "01"));
  const verdictText = document.createElement("p");
  verdictText.className = "answer-verdict-text";
  verdictText.textContent = reading.verdict;
  verdict.append(verdictText);
  if (round.question) {
    const question = document.createElement("p");
    question.className = "answer-question-context";
    question.textContent = `คำถาม: ${round.question}`;
    verdict.append(question);
  }
  box.append(verdict);

  const cardsSection = document.createElement("section");
  cardsSection.className = "answer-section answer-section--cards";
  cardsSection.dataset.answerKey = "cards";
  cardsSection.style.setProperty("--answer-delay", "110ms");
  cardsSection.append(createAnswerHeading("คำทำนายรายใบ", "02"));
  const cardList = document.createElement("div");
  cardList.className = "answer-card-list";
  reading.cards.forEach((card, index) => {
    const cardSection = document.createElement("article");
    cardSection.className = "answer-card answer-section--card";
    cardSection.dataset.answerKey = "card";
    cardSection.style.setProperty("--answer-delay", `${(index + 2) * 110}ms`);
    const cardHeader = document.createElement("div");
    cardHeader.className = "answer-card-detail-heading";
    const marker = document.createElement("span");
    marker.className = "answer-card-marker";
    marker.textContent = `ใบที่ ${card.position}`;
    const name = document.createElement("h3");
    name.className = "answer-card-name";
    name.textContent = card.name;
    cardHeader.append(marker, name);
    cardSection.append(cardHeader);
    appendCopy(cardSection, "ความหมายของไพ่", card.meaning);
    appendCopy(cardSection, "คำทำนาย", card.prediction);
    cardList.append(cardSection);
  });
  cardsSection.append(cardList);
  box.append(cardsSection);

  const overall = document.createElement("section");
  overall.className = "answer-section answer-section--overall";
  overall.dataset.answerKey = "overall";
  overall.style.setProperty("--answer-delay", `${(reading.cards.length + 2) * 110}ms`);
  overall.append(createAnswerHeading("คำทำนายโดยรวม", "03"));
  const overallText = document.createElement("p");
  overallText.className = "answer-overall-text";
  overallText.textContent = reading.overall_prediction;
  overall.append(overallText);
  if (reading.safety_note) appendCopy(overall, "หมายเหตุ", reading.safety_note);
  box.append(overall);
  $("#ai-answer-stage").hidden = false;
  $("#request-status").textContent = "คำตอบพร้อมแล้ว · พิมพ์คำถามใหม่ด้านล่าง แล้วกดเปิดไพ่";
  renderQuestionComposer();
  setWitchStatus("คำตอบพร้อมแล้ว · ถามไพ่รอบใหม่ได้", "ready");
  renderWaitingRitual();
}

function normalizeServerRound(round, index = 0) {
  const cards = Array.isArray(round?.cards) ? round.cards.map((card) => String(card)) : [];
  const answerObject = round?.answer && typeof round.answer === "object" ? round.answer : round?.answer_json && typeof round.answer_json === "object" ? round.answer_json : null;
  const answerText = textValue(round?.answer_text || (typeof round?.answer === "string" ? round.answer : ""), 12_000);
  return {
    id: String(round?.id || `round-${index + 1}`),
    roundNumber: Number(round?.round_number || round?.roundNumber || index + 1),
    cards,
    question: textValue(round?.question),
    answer: answerText,
    structured: answerObject,
    status: String(round?.status || (answerObject || answerText ? "answered" : "drawn")),
    createdAt: round?.created_at || round?.createdAt || Date.now(),
    updatedAt: round?.updated_at || round?.updatedAt || Date.now(),
  };
}

function applyServerSession(session) {
  if (!session) return;
  state.serverSession = session;
  state.sessionId = String(session.id || "");
  state.rounds = Array.isArray(session.rounds) ? session.rounds.map(normalizeServerRound) : [];
  const latest = state.rounds[state.rounds.length - 1];
  state.currentRoundId = latest?.id || "";
  state.drawn = latest ? [...latest.cards] : [];
  syncHistory();
  saveState();
}

function applyLocalSession(session) {
  state.localSession = normalizeLocalDeckSession(session) || createLocalDeckSession();
  state.serverSession = null;
  state.sessionId = "";
  state.rounds = state.localSession.rounds.map((round) => ({ ...round, cards: [...round.cards] }));
  const latest = state.rounds[state.rounds.length - 1];
  state.currentRoundId = latest?.id || "";
  state.drawn = latest ? [...latest.cards] : [];
  syncHistory();
  saveState();
}

function savedLocalSession() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY) || "null");
    state.savedServerSessionId = textValue(value?.serverSessionId, 120);
    return normalizeLocalDeckSession(value?.localSession || value);
  } catch { return null; }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ serverSessionId: state.sessionId || state.savedServerSessionId, localSession: state.localSession }));
  } catch { /* private browsing can disable storage */ }
}

function renderAll() {
  renderProgress();
  renderServerHistory();
  renderCards();
  renderFanBoard();
  renderMemory();
  renderAnswerFromCurrent();
  renderQuestionComposer();
  syncQuestion();
}

function renderAnswerFromCurrent() {
  const round = currentRound();
  if (round?.answer || round?.structured) renderAnswer(round.answer, round.structured, round);
  else if (!round || !hasAnswer()) clearAnswer();
}

function syncQuestion() {
  const question = currentQuestionValue();
  const answer = hasAnswer();
  const retry = $("#retry-ai-button");
  if (retry) retry.hidden = !(state.failedQuestion && !state.busy);
  if (!hasAiAccess()) {
    $("#request-status").textContent = isMemberMode() ? "บัญชีนี้ยังไม่ได้รับสิทธิ์ AI · เปิดไพ่ดูเองได้เลย" : "โหมดเปิดไพ่ฟรี · เข้าใช้งานเพื่อพิมพ์คำถามถาม AI";
  } else if (!question && !answer) {
    $("#request-status").textContent = "ขั้นที่ 1: พิมพ์คำถามก่อน แล้วจึงเลือกจำนวนไพ่";
  } else if (answer && !question) {
    $("#request-status").textContent = "คำตอบพร้อมแล้ว · พิมพ์คำถามใหม่เพื่อเปิดไพ่รอบถัดไป";
  } else if (answer && duplicateCurrentQuestion(question)) {
    $("#request-status").textContent = "คำถามซ้ำกับรอบก่อน · พิมพ์คำถามใหม่ก่อนเปิดไพ่";
  } else if (!answer && !state.busy && !state.failedQuestion) {
    $("#request-status").textContent = question ? "คำถามพร้อมแล้ว · กดเปิดไพ่" : "พิมพ์คำถามเพื่อเริ่มอ่าน";
  }
  renderProgress();
}

function clearPrivateMemory() {
  state.savedServerSessionId = "";
  state.sessionId = "";
  state.serverSession = null;
  state.serverHistory = [];
  state.rounds = [];
  state.currentRoundId = "";
  state.drawn = [];
  state.viewingHistorySessionId = "";
  state.historyBusy = false;
  state.failedQuestion = "";
  state.failedErrorCode = "";
  state.failedRequestId = "";
  state.fanPhase = "ready";
  $("#ai-question").value = "";
  clearAnswer();
  syncHistory();
}

async function api(url, options = {}) {
  const headers = { Accept: "application/json", "X-Client-Request-Id": randomId("client"), ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) };
  let response;
  try { response = await fetch(url, { credentials: "same-origin", ...options, headers }); }
  catch (error) { const offline = new Error("ตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่"); offline.code = navigator.onLine === false ? "OFFLINE" : "AI_UPSTREAM_ERROR"; offline.cause = error; throw offline; }
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { throw new Error("เซิร์ฟเวอร์ส่งข้อมูลที่อ่านไม่ได้"); }
    if (!response.ok || data.ok === false) {
      const error = new Error(data.message || data.error || "ทำรายการไม่สำเร็จ");
      error.code = data.code || "REQUEST_FAILED";
      error.status = response.status;
      error.requestId = data.request_id || response.headers.get("x-request-id") || "";
      throw error;
  }
  return data;
}

async function createServerSession() {
  const data = await api("/api/ai/deck-sessions", { method: "POST", headers: { "X-CSRF-Token": state.csrf }, body: JSON.stringify({ title: "คำถามจากไพ่" }) });
  const session = data?.session;
  const sessionId = textValue(session?.id, 120);
  if (!sessionId) {
    const error = new Error("ไม่พบรหัสสำรับไพ่หลังสร้างสำรับ");
    error.code = "SESSION_CREATE_FAILED";
    throw error;
  }
  // Keep the new id locally before any secondary render work. This prevents
  // the next draw request from ever being built with an empty session id.
  state.serverSession = session;
  state.sessionId = sessionId;
  state.rounds = Array.isArray(session.rounds) ? session.rounds.map(normalizeServerRound) : [];
  state.currentRoundId = state.rounds.at(-1)?.id || "";
  state.drawn = state.rounds.at(-1) ? [...state.rounds.at(-1).cards] : [];
  syncHistory();
  saveState();
  return session;
}

function deckSessionUrl(sessionId, action = "", roundId = "") {
  const params = new URLSearchParams({ session_id: textValue(sessionId, 120) });
  if (action) params.set("action", action);
  if (roundId) params.set("round_id", textValue(roundId, 120));
  return `/api/ai/deck-sessions?${params.toString()}`;
}

async function loadServerReadingHistory() {
  if (!hasAiAccess()) {
    state.serverHistory = [];
    renderServerHistory();
    return;
  }
  const data = await api("/api/ai/deck-sessions");
  state.serverHistory = Array.isArray(data.sessions)
    ? data.sessions.filter((session) => Number(session?.opened_count ?? session?.draw_cursor ?? 0) > 0)
    : [];
  renderServerHistory();
}

async function openHistorySession(sessionId) {
  if (!hasAiAccess() || state.busy || state.historyBusy || !sessionId) return;
  state.historyBusy = true;
  renderServerHistory();
  try {
    const data = await api(deckSessionUrl(sessionId));
    if (!data.session || data.session.deck_ready === false) throw new Error("ประวัติชุดนี้ไม่พร้อมเปิดดู");
    state.viewingHistorySessionId = String(sessionId);
    applyServerSession(data.session);
    state.fanPhase = "revealed";
    renderAll();
    $("#request-status").textContent = "กำลังดูประวัติเดิม · กดเริ่มดูดวงใหม่เมื่อต้องการเปิดรอบใหม่";
    setWitchStatus("กำลังดูประวัติเดิม", "ready");
    document.querySelector("#ai-answer-stage")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  } catch (error) {
    $("#request-status").textContent = messageForError(error.code, error.requestId) || error.message;
  } finally {
    state.historyBusy = false;
    renderAll();
  }
}

function startNewReading() {
  if (state.busy || state.historyBusy) return;
  state.requestVersion += 1;
  state.savedServerSessionId = "";
  state.serverSession = null;
  state.sessionId = "";
  state.viewingHistorySessionId = "";
  state.rounds = [];
  state.currentRoundId = "";
  state.drawn = [];
  state.failedQuestion = "";
  state.failedErrorCode = "";
  state.failedRequestId = "";
  state.fanPhase = "ready";
  $("#ai-question").value = "";
  clearAnswer();
  syncHistory();
  saveState();
  renderAll();
  $("#request-status").textContent = "พร้อมเริ่มดูดวงใหม่ · พิมพ์คำถามแล้วเลือกจำนวนไพ่";
  setWitchStatus("พร้อมเริ่มดูดวงใหม่");
  if (hasAiAccess()) window.requestAnimationFrame(() => $("#ai-question")?.focus());
}

async function answerCurrentRound(roundId) {
  if (!hasAiAccess() || !state.sessionId || !roundId) return;
  const version = ++state.requestVersion;
  const round = state.rounds.find((item) => item.id === roundId);
  if (!round) return;
  state.busy = true;
  setFanPhase("answering");
  state.failedQuestion = "";
  state.failedErrorCode = "";
  state.failedRequestId = "";
  setWitchStatus("กำลังอ่านคำบนไพ่และสรุปคำทำนาย...", "reading");
  $("#request-status").textContent = "กำลังอ่านไพ่ให้ตรงกับคำถาม...";
  renderProgress();
  try {
    const data = await api(deckSessionUrl(state.sessionId, "answer", roundId), { method: "POST", headers: { "X-CSRF-Token": state.csrf }, body: "{}" });
    if (version !== state.requestVersion) return;
    applyServerSession(data.session);
    state.currentRoundId = String(data.round?.id || roundId);
    const answered = state.rounds.find((item) => item.id === state.currentRoundId) || normalizeServerRound(data.round, state.rounds.length - 1);
    if (!answered.answer && data.answer) answered.answer = textValue(data.answer, 12_000);
    if (!answered.structured && data.structured) answered.structured = data.structured;
    if (!state.rounds.some((item) => item.id === answered.id)) state.rounds.push(answered);
    state.drawn = [...answered.cards];
    syncHistory();
    saveState();
    setFanPhase("revealed");
    renderAnswer(answered.answer, answered.structured, answered);
    void loadServerReadingHistory().catch(() => {});
    $("#ai-question").value = "";
    renderQuestionComposer();
    $("#retry-ai-button").hidden = true;
    $("#ai-answer-title")?.focus?.({ preventScroll: false });
  } catch (error) {
    if (error.status === 401 || error.code === "ACCOUNT_AUTH_REQUIRED") {
      state.user = null;
      state.csrf = "";
      clearPrivateMemory();
      setReaderMode(null);
      applyLocalSession(state.localSession);
      $("#request-status").textContent = "เซสชันหมดอายุ กรุณาเข้าใช้งานใหม่";
    } else {
      state.failedQuestion = round.question;
      state.failedErrorCode = error.code || "";
      state.failedRequestId = error.requestId || "";
      $("#request-status").textContent = messageForError(error.code, error.requestId);
      $("#retry-ai-button").hidden = !["AI_TIMEOUT", "AI_UPSTREAM_ERROR", "AI_RATE_LIMITED", "EMPTY_AI_RESPONSE", "OFFLINE"].includes(error.code);
      setFanPhase("revealed");
      setWitchStatus("ยังอ่านคำทำนายไม่ได้ · กดลองอีกครั้ง");
    }
  } finally {
    if (version === state.requestVersion) {
      state.busy = false;
      renderProgress();
      renderMemory();
      syncQuestion();
    }
  }
}

async function drawCards() {
  if (state.busy) return;
  const question = hasAiAccess() ? textValue($("#ai-question")?.value) : "";
  if (hasAiAccess() && !question) {
    $("#request-status").textContent = "ขั้นที่ 1: พิมพ์คำถามก่อน แล้วจึงกดเปิดไพ่";
    $("#ai-question")?.focus();
    return;
  }
  if (hasAiAccess() && duplicateCurrentQuestion(question)) {
    $("#request-status").textContent = "คำถามซ้ำกับรอบก่อน · พิมพ์คำถามใหม่ก่อนเปิดไพ่";
    $("#ai-question")?.focus();
    return;
  }
  if ($("#draw-button").disabled) return;
  const version = ++state.requestVersion;
  state.busy = true;
  setFanPhase("shuffling");
  $("#draw-button").classList.add("is-busy");
  setWitchStatus("กำลังสับไพ่...", "reading");
  renderProgress();
  try {
    await sleep(420);
    let round;
    if (hasAiAccess()) {
      if (!state.sessionId) await createServerSession();
      const sessionId = textValue(state.sessionId, 120);
      if (!sessionId) {
        const error = new Error("ไม่พบสำรับไพ่ของบัญชีนี้");
        error.code = "SESSION_CREATE_FAILED";
        throw error;
      }
      const data = await api(deckSessionUrl(state.sessionId, "draw"), {
        method: "POST",
        headers: { "X-CSRF-Token": state.csrf },
        body: JSON.stringify({ count: state.count, question, request_id: randomId("draw") }),
      });
      if (version !== state.requestVersion) return;
      applyServerSession(data.session);
      round = normalizeServerRound(data.round, state.rounds.length - 1);
      state.currentRoundId = round.id;
      state.drawn = [...round.cards];
      state.rounds = state.rounds.filter((item) => item.id !== round.id).concat(round);
      syncHistory();
      saveState();
    } else {
      const result = drawNextRound(state.localSession, state.count, "", () => randomId("round"));
      state.localSession = result.session;
      round = result.round;
      state.rounds = result.session.rounds.map((item) => ({ ...item }));
      state.currentRoundId = round.id;
      state.drawn = [...round.cards];
      syncHistory();
      saveState();
    }
    clearAnswer();
    $("#ai-question").value = hasAiAccess() ? question : $("#ai-question").value;
    state.busy = false;
    $("#draw-button").classList.remove("is-busy");
    setFanPhase(hasAiAccess() ? "answering" : "revealed");
    renderProgress();
    renderCards();
    renderMemory();
    if (hasAiAccess()) await answerCurrentRound(round.id);
  } catch (error) {
    if (version !== state.requestVersion) return;
    state.busy = false;
    $("#draw-button").classList.remove("is-busy");
    setFanPhase(currentRound()?.cards?.length ? "revealed" : "ready");
    $("#request-status").textContent = messageForError(error.code, error.requestId) || error.message;
    setWitchStatus("ยังเปิดไพ่ไม่ได้ · กดลองอีกครั้ง");
    renderProgress();
  }
}

async function resetCards() {
  if (state.busy) return;
  const oldSessionId = state.sessionId;
  state.busy = true;
  state.requestVersion += 1;
  renderProgress();
  if (hasAiAccess() && oldSessionId) {
    try { await api(deckSessionUrl(oldSessionId, "reset"), { method: "POST", headers: { "X-CSRF-Token": state.csrf }, body: "{}" }); } catch { /* local reset remains usable */ }
  }
  state.localSession = resetLocalDeckSession(state.localSession);
  state.savedServerSessionId = "";
  state.sessionId = "";
  state.serverSession = null;
  state.rounds = [];
  state.currentRoundId = "";
  state.drawn = [];
  state.failedQuestion = "";
  state.failedErrorCode = "";
  state.failedRequestId = "";
  state.fanPhase = "ready";
  $("#ai-question").value = "";
  clearAnswer();
  syncHistory();
  state.busy = false;
  saveState();
  renderAll();
  $("#request-status").textContent = "เริ่มสำรับใหม่แล้ว ไพ่ทั้ง 78 ใบพร้อมให้เปิด";
  setWitchStatus("สำรับใหม่พร้อมแล้ว");
}

async function loadSession() {
  state.localSession = savedLocalSession() || createLocalDeckSession();
  applyLocalSession(state.localSession);
  try {
    const data = await api("/api/auth/me");
    state.backend = data.backend_configured !== false;
    const authenticated = Boolean(data.authenticated && data.user);
    state.user = authenticated ? data.user : null;
    state.csrf = data.csrf_token || "";
    setReaderMode(state.user);
    if (authenticated && hasAiAccess()) {
      clearPrivateMemory();
      try { await loadServerReadingHistory(); } catch { /* the new reader remains usable while history recovers */ }
    }
    if (!state.user) applyLocalSession(state.localSession);
  } catch {
    state.backend = false;
    state.user = null;
    state.csrf = "";
    setReaderMode(null);
    applyLocalSession(state.localSession);
  }
  renderAll();
}

async function logoutMember(event) {
  if (!isMemberMode()) return;
  event.preventDefault();
  try { await api("/api/auth/logout", { method: "POST", body: "{}" }); } catch { /* local guest mode remains usable */ }
  state.user = null;
  state.csrf = "";
  clearPrivateMemory();
  applyLocalSession(state.localSession || createLocalDeckSession());
  setReaderMode(null);
  renderAll();
  window.location.hash = "question-title";
}

function handleQuestionInput(event) {
  if (textValue(event.currentTarget?.value) !== state.failedQuestion) {
    state.failedQuestion = "";
    state.failedErrorCode = "";
    state.failedRequestId = "";
  }
  syncQuestion();
}

function retryAi() {
  const round = currentRound();
  if (round && !state.busy) void answerCurrentRound(round.id);
}

$("#draw-button")?.addEventListener("click", drawCards);
$("#reset-button")?.addEventListener("click", resetCards);
$("#new-reading-button")?.addEventListener("click", resetCards);
$("#start-new-reading-button")?.addEventListener("click", startNewReading);
$("#retry-ai-button")?.addEventListener("click", retryAi);
$("#ai-question")?.addEventListener("input", handleQuestionInput);
$("#account-action")?.addEventListener("click", logoutMember);
$("#account-link")?.addEventListener("click", logoutMember);
choiceButtons.forEach((button) => button.addEventListener("click", () => setCount(button.dataset.count)));

initMotion();
setReaderMode(null);
state.localSession = savedLocalSession() || createLocalDeckSession();
applyLocalSession(state.localSession);
renderAll();
void loadSession();
