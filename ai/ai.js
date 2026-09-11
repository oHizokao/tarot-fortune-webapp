import { messageForError } from "../lib/client/error-copy.js";
import { createLocalDeckSession, drawNextRound, normalizeLocalDeckSession, resetLocalDeckSession } from "./deck-session.mjs";
import { commitVisualRound } from "./deck-visual-state.mjs";
import { groupReadingHistory } from "./reading-sets.mjs";

const STORAGE_KEY = "tarot-daily-ai-reading-v3";
const LEGACY_STORAGE_KEY = "tarot-daily-ai-reading-v2";
const VISUAL_DECK_STORAGE_KEY = "tarot-daily-ai-visual-deck-v1";
const MAX_HISTORY = 78;
const DECK_SIZE = 78;
const MAX_SELECTED_CARDS = 3;
const state = {
  count: 0,
  pendingDrawCount: 0,
  selectedCards: [],
  usedDeckIndexes: [],
  visualDeckKey: "",
  savedVisualDeckKey: "",
  savedVisualDeckIndexes: [],
  visualRounds: [],
  savedVisualRounds: [],
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
  deckRotation: 0,
  deckPointer: null,
  suppressDeckClick: false,
  requestVersion: 0,
  pendingDrawIntent: null,
  failedQuestion: "",
  failedErrorCode: "",
  failedRequestId: "",
};

const $ = (selector) => document.querySelector(selector);
const choiceButtons = [];

function randomId(prefix = "request") {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function memberIdentity(user = state.user) {
  return textValue(user?.id ?? user?.user_id ?? user?.username ?? user?.name, 160);
}

function captureRequestIdentity() {
  return { member: memberIdentity(), sessionId: textValue(state.sessionId, 120) };
}

function isCurrentRequest(version, identity) {
  return version === state.requestVersion
    && identity?.member === memberIdentity()
    && (!identity?.sessionId || identity.sessionId === textValue(state.sessionId, 120));
}

function sameDrawIntent(intent, count, question, selectedIndexes) {
  return Boolean(intent
    && intent.member === memberIdentity()
    && (!intent.sessionId || intent.sessionId === textValue(state.sessionId, 120))
    && intent.count === count
    && intent.question === question
    && JSON.stringify(intent.selectedIndexes) === JSON.stringify(selectedIndexes));
}

function getDrawIntent(count, question, selectedIndexes) {
  if (sameDrawIntent(state.pendingDrawIntent, count, question, selectedIndexes)) return state.pendingDrawIntent;
  state.pendingDrawIntent = {
    requestId: randomId("draw"),
    member: memberIdentity(),
    sessionId: textValue(state.sessionId, 120),
    count,
    question,
    selectedIndexes: [...selectedIndexes],
  };
  return state.pendingDrawIntent;
}

function sleep(milliseconds) {
  return new Promise((resolve) => { window.setTimeout(resolve, milliseconds); });
}

function textValue(value, maxLength = 2_000) { return String(value ?? "").trim().slice(0, maxLength); }

function normalizeDeckIndexes(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((index) => Number(index)).filter((index) => Number.isInteger(index) && index >= 0 && index < DECK_SIZE))].sort((a, b) => a - b);
}

function normalizeVisualRounds(value) {
  if (!Array.isArray(value)) return [];
  return value.map((round) => ({
    requestId: textValue(round?.requestId, 160),
    roundId: textValue(round?.roundId, 160),
    selectedIndexes: normalizeDeckIndexes(round?.selectedIndexes),
    cards: Array.isArray(round?.cards) ? round.cards.map((card) => textValue(card, 160)) : [],
  })).filter((round) => round.requestId && round.roundId && round.selectedIndexes.length === round.cards.length);
}

function visualDeckKey() {
  if (isMemberMode()) return state.sessionId ? `member:${state.sessionId}` : "member:new";
  return state.localSession?.createdAt ? `guest:${state.localSession.createdAt}` : "";
}

function syncVisualDeckState() {
  const key = visualDeckKey();
  if (!key || state.visualDeckKey === key) return;
  state.visualDeckKey = key;
  const hasSavedVisualState = state.savedVisualDeckKey === key;
  const serverRounds = state.rounds
    .filter((round) => Array.isArray(round?.selectedIndexes) && round.selectedIndexes.length === round.cards.length)
    .map((round, index) => ({
      requestId: textValue(round.requestId, 160) || `legacy-${round.id || index + 1}`,
      roundId: textValue(round.id, 160) || `legacy-round-${index + 1}`,
      selectedIndexes: round.selectedIndexes,
      cards: round.cards,
    }));
  const saved = hasSavedVisualState ? state.savedVisualDeckIndexes : serverRounds.flatMap((round) => round.selectedIndexes);
  state.usedDeckIndexes = normalizeDeckIndexes(saved);
  state.visualRounds = hasSavedVisualState ? normalizeVisualRounds(state.savedVisualRounds) : normalizeVisualRounds(serverRounds);
}

function saveVisualDeckState() {
  const key = visualDeckKey();
  if (!key) return;
  state.visualDeckKey = key;
  state.savedVisualDeckKey = key;
  state.savedVisualDeckIndexes = normalizeDeckIndexes(state.usedDeckIndexes);
  state.savedVisualRounds = normalizeVisualRounds(state.visualRounds);
  try {
    localStorage.setItem(VISUAL_DECK_STORAGE_KEY, JSON.stringify({ key, indexes: state.savedVisualDeckIndexes, rounds: state.savedVisualRounds }));
  } catch { /* storage may be disabled */ }
}

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

function setReaderView(view, { replace = false, updateUrl = false, focus = false } = {}) {
  const nextView = view === "result" ? "result" : "compose";
  const compose = $("#reader-compose-view");
  const result = $("#reader-result-view");
  [compose, result].forEach((element) => {
    if (!element) return;
    const active = element.dataset.readerView === nextView;
    element.hidden = !active;
    element.inert = !active;
    element.setAttribute("aria-hidden", String(!active));
  });
  $("#ai-reader-app")?.setAttribute("data-reader-view", nextView);
  if (updateUrl) {
    const hash = nextView === "result" ? "#reading-result" : "#question-title";
    const method = replace ? "replaceState" : "pushState";
    window.history[method]({ readerView: nextView, roundId: state.currentRoundId || "" }, "", hash);
  }
  if (focus) {
    window.requestAnimationFrame(() => {
      const target = nextView === "result" ? $("#reading-result-title") : $("#question-title");
      target?.focus?.({ preventScroll: true });
      $(nextView === "result" ? "#reader-result-view" : "#reader-compose-view")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    });
  }
}

function syncReaderViewFromLocation() {
  const wantsResult = window.location.hash === "#reading-result" && (Boolean(state.currentRoundId) || isViewingHistory());
  const nextView = wantsResult ? "result" : "compose";
  setReaderView(nextView);
  if (nextView === "compose" && window.location.hash !== "#question-title") {
    window.history.replaceState({ ...(window.history.state || {}), readerView: "compose", roundId: state.currentRoundId || "" }, "", "#question-title");
  }
}

function renderQuestionComposer() {
  const stage = $("#question-stage");
  if (!stage) return;
  const enabled = hasAiAccess();
  const answered = hasAnswer();
  stage.hidden = !enabled || isViewingHistory();
  stage.dataset.composerMode = answered ? "follow-up" : "initial";
  $("#question-kicker")?.replaceChildren(document.createTextNode(answered ? "คำถามต่อเนื่อง" : "คำถามของคุณ"));
  $("#question-title")?.replaceChildren(document.createTextNode(answered ? "อยากถามอะไรต่อ?" : "วันนี้อยากถามไพ่เรื่องอะไร?"));
  $("#question-description")?.replaceChildren(document.createTextNode("พิมพ์คำถาม แล้วเลือกไพ่ได้สูงสุด 3 ใบ"));
  $("#question-label")?.replaceChildren(document.createTextNode("คำถามของคุณ"));
  const field = $("#ai-question");
  if (field) {
    field.placeholder = "เช่น ความรักช่วงนี้จะเป็นอย่างไร?";
    field.setAttribute("aria-label", "คำถามของคุณ");
  }
  $("#question-hint")?.replaceChildren(document.createTextNode(answered
    ? "เลือกไพ่ใหม่ได้เลย ระบบยังจำเรื่องที่คุยกันไว้"
    : "ระบุเรื่องที่อยากรู้ให้ชัดเจน"));
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
  state.count = Math.max(0, Math.min(MAX_SELECTED_CARDS, Number(count) || 0));
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
  if (guestBanner) {
    guestBanner.hidden = member;
    if (member) guestBanner.style.removeProperty("display");
    else guestBanner.style.setProperty("display", "grid", "important");
  }
  const accountCallout = $("#account-callout");
  if (accountCallout) accountCallout.hidden = !member || aiEnabled;
  const copy = member
    ? {
      brand: "WITCH AI READER",
      eyebrow: "AI TAROT · QUESTION FIRST",
      primary: "ถามไพ่ในเรื่องที่อยู่ใจ",
      secondary: "แล้วรับคำตอบให้ชัดเจน",
      description: "พิมพ์คำถาม คลิกไพ่จากสำรับได้สูงสุด 3 ใบ แล้วกดทำนาย คำตอบจะอ่านจากคำบนไพ่และตอบตรงกับเรื่องที่คุณถาม",
      spread: "คลิกไพ่จากสำรับได้สูงสุด 3 ใบ · ทุกครั้งจะหยิบต่อจากสำรับเดิม",
      cards: "ไพ่ที่เปิดได้",
      seal: "AI\nREADING",
    }
    : {
      brand: "FREE CARD READER",
      eyebrow: "FREE READING · NO LOGIN",
      primary: "เปิดไพ่ด้วยตัวเอง",
      secondary: "ให้ไพ่เล่าเรื่องของคุณ",
      description: "คลิกไพ่จากสำรับได้สูงสุด 3 ใบ แล้วดูภาพกับคำบนไพ่ด้วยตัวเอง ไม่ต้องสมัครสมาชิก",
      spread: "คลิกไพ่จากสำรับได้สูงสุด 3 ใบ · เปิดต่อได้จนกว่าจะครบสำรับ",
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
  const mustChangePassword = Boolean(user?.must_change_password);
  $("#account-title")?.replaceChildren(document.createTextNode(mustChangePassword ? "ต้องเปลี่ยนรหัสผ่านก่อนใช้ AI" : "บัญชีนี้ยังรอสิทธิ์ AI"));
  $("#account-message")?.replaceChildren(document.createTextNode(mustChangePassword
    ? "ตั้งรหัสผ่านใหม่แล้วกลับมาถามไพ่ได้ คุณยังเปิดไพ่แบบปกติได้"
    : "ผู้ดูแลยังไม่ได้เปิดสิทธิ์ AI ให้บัญชีนี้ คุณยังเปิดไพ่แบบปกติได้"));
  const accountAction = $("#account-action");
  if (accountAction) {
    accountAction.hidden = !mustChangePassword;
    accountAction.textContent = "เปลี่ยนรหัสผ่าน";
    accountAction.href = "../login/?next=/ai/";
    accountAction.dataset.action = "change-password";
  }
  const accountLink = $("#account-link");
  if (accountLink) {
    accountLink.textContent = member ? `${user.name || user.username || "บัญชี"} · ออกจากระบบ` : "เข้าใช้งาน";
    accountLink.href = member ? "#question-title" : "../login/?next=/ai/";
    accountLink.dataset.action = member ? "logout" : "login";
  }
  renderQuestionComposer();
}

function setWitchStatus(message, mode = "") {
  const elements = [...document.querySelectorAll(".witch-status")];
  elements.forEach((element) => {
    element.textContent = message;
    element.classList.toggle("is-reading", mode === "reading");
    element.classList.toggle("is-ready", mode === "ready");
  });
}

function ensureDeckCards() {
  const deck = $("#tarot-deck-card-list");
  if (!deck) return [];
  if (deck.children.length === DECK_SIZE) return [...deck.children];
  deck.replaceChildren(...Array.from({ length: DECK_SIZE }, (_, index) => {
    const card = document.createElement("button");
    card.className = "tarot-deck-card";
    card.type = "button";
    card.dataset.deckIndex = String(index);
    card.style.setProperty("--deck-index", String(index));
    card.style.setProperty("--deck-angle", `${(index / DECK_SIZE) * 360}deg`);
    card.setAttribute("aria-label", `เลือกไพ่จากสำรับ ใบที่ ${index + 1}`);
    card.innerHTML = '<span class="tarot-deck-card__back" aria-hidden="true"><i>✦</i></span>';
    card.addEventListener("click", (event) => {
      if (state.suppressDeckClick) {
        event.preventDefault();
        state.suppressDeckClick = false;
        return;
      }
      selectDeckCard(card);
    });
    return card;
  }));
  return [...deck.children];
}

function applyDeckRotation() {
  $("#tarot-deck-card-list")?.style.setProperty("--deck-rotation", `${state.deckRotation}deg`);
}

function initDeckInteraction() {
  const zone = $("#tarot-deck-zone");
  if (!zone || zone.dataset.interactionReady === "true") return;
  zone.dataset.interactionReady = "true";
  zone.addEventListener("pointerdown", (event) => {
    if (state.busy || isViewingHistory() || (event.pointerType === "mouse" && event.button !== 0)) return;
    state.deckPointer = { pointerId: event.pointerId, startX: event.clientX, lastX: event.clientX, moved: false };
    zone.classList.add("is-dragging");
  });
  zone.addEventListener("pointermove", (event) => {
    const pointer = state.deckPointer;
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    const delta = event.clientX - pointer.lastX;
    if (!pointer.moved && Math.abs(event.clientX - pointer.startX) > 8) pointer.moved = true;
    if (pointer.moved && delta) {
      state.deckRotation += delta * 0.42;
      applyDeckRotation();
    }
    pointer.lastX = event.clientX;
  });
  const finishPointer = (event) => {
    const pointer = state.deckPointer;
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    if (pointer.moved) {
      state.suppressDeckClick = true;
      window.setTimeout(() => { state.suppressDeckClick = false; }, 120);
    }
    state.deckPointer = null;
    zone.classList.remove("is-dragging");
  };
  zone.addEventListener("pointerup", finishPointer);
  zone.addEventListener("pointercancel", finishPointer);
  zone.addEventListener("wheel", (event) => {
    if (state.busy || isViewingHistory() || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    event.preventDefault();
    state.deckRotation += event.deltaX * 0.18;
    applyDeckRotation();
  }, { passive: false });
}

function renderDeckZone() {
  const zone = $("#tarot-deck-zone");
  if (!zone) return;
  syncVisualDeckState();
  initDeckInteraction();
  applyDeckRotation();
  const cards = ensureDeckCards();
  const phase = state.fanPhase;
  const selectedIndexes = new Set(state.selectedCards.map((item) => Number(item.deckIndex)));
  const usedIndexes = new Set(state.usedDeckIndexes);
  zone.dataset.deckState = phase;
  zone.dataset.selectedCount = String(state.selectedCards.length);
  cards.forEach((card, index) => {
    const selected = selectedIndexes.has(index);
    const used = usedIndexes.has(index);
    const selectionLocked = state.selectedCards.length >= MAX_SELECTED_CARDS && !selected;
    const unavailable = used || selected || selectionLocked || state.busy || isViewingHistory();
    const visuallyDisabled = used || selectionLocked || isViewingHistory();
    card.classList.toggle("is-selected", selected);
    card.classList.toggle("is-used", used);
    card.classList.toggle("is-disabled", visuallyDisabled && !selected);
    card.classList.toggle("is-loading", state.busy && !used && !selected && !selectionLocked);
    card.disabled = unavailable && !selected;
    card.setAttribute("aria-pressed", String(selected));
    card.setAttribute("aria-label", used ? `ไพ่จากสำรับ ใบที่ ${index + 1} เปิดไปแล้ว` : `เลือกไพ่จากสำรับ ใบที่ ${index + 1}`);
  });
  const title = $("#deck-center-title");
  const message = $("#deck-center-message");
  if (phase === "shuffling") {
    title && (title.textContent = "กำลังสับไพ่…");
    message && (message.textContent = "รอสักครู่ แล้วผลจะเปิดให้ดู");
  } else if (phase === "answering") {
    title && (title.textContent = "กำลังอ่านไพ่…");
    message && (message.textContent = "กำลังเชื่อมโยงคำบนไพ่กับคำถาม");
  } else if (phase === "revealed") {
    title && (title.textContent = "เปิดไพ่แล้ว");
    message && (message.textContent = "ดูผลการเปิดไพ่ด้านล่าง");
  } else if (state.selectedCards.length) {
    title && (title.textContent = `เลือกแล้ว ${state.selectedCards.length} ใบ`);
    message && (message.textContent = state.selectedCards.length === MAX_SELECTED_CARDS ? "พร้อมทำนายแล้ว" : "เลือกเพิ่มได้ หรือกดทำนายเลย");
  } else {
    title && (title.textContent = "เลือกไพ่จากสำรับ");
    message && (message.textContent = "คลิกไพ่ทีละใบ · สูงสุด 3 ใบ");
  }
}

function renderSelectedTray() {
  const tray = $("#selected-card-tray");
  if (!tray) return;
  const selected = state.selectedCards.slice(0, MAX_SELECTED_CARDS);
  tray.dataset.selectedCount = String(selected.length);
  if (!selected.length) {
    const empty = document.createElement("p");
    empty.className = "selected-card-tray__empty";
    empty.textContent = "เลือกไพ่จากวงล้อได้ 1–3 ใบ";
    tray.replaceChildren(empty);
    return;
  }
  tray.replaceChildren(...selected.map((item, index) => {
    const slot = document.createElement("article");
    slot.className = "selected-card-slot";
    slot.dataset.deckIndex = String(item.deckIndex);
    slot.dataset.slot = String(index + 1);

    const back = document.createElement("span");
    back.className = "selected-card-slot__back";
    back.setAttribute("aria-hidden", "true");
    back.textContent = "✦";

    const copy = document.createElement("div");
    copy.className = "selected-card-slot__copy";
    const number = document.createElement("strong");
    number.textContent = "ใบที่ " + (index + 1);
    const detail = document.createElement("small");
    detail.textContent = state.busy ? "กำลังอ่าน" : "เลือกแล้ว";
    copy.append(number, detail);

    const remove = document.createElement("button");
    remove.className = "selected-card-slot__remove";
    remove.type = "button";
    remove.textContent = "เอาออก";
    remove.setAttribute("aria-label", "เอาไพ่ใบที่ " + (index + 1) + " ออกจากชุดที่เลือก");
    remove.disabled = state.busy || isViewingHistory();
    remove.addEventListener("click", () => {
      if (remove.disabled) return;
      const card = document.querySelector("#tarot-deck-card-list .tarot-deck-card[data-deck-index=\"" + item.deckIndex + "\"]");
      if (card) selectDeckCard(card);
    });

    slot.append(back, copy, remove);
    return slot;
  }));
}

function selectDeckCard(card) {
  if (state.busy || isViewingHistory() || card.classList.contains("is-used")) return;
  const deckIndex = Number(card.dataset.deckIndex);
  if (card.classList.contains("is-selected")) {
    state.selectedCards = state.selectedCards
      .filter((item) => Number(item.deckIndex) !== deckIndex)
      .map((item, index) => ({ ...item, slot: index + 1 }));
    state.pendingDrawIntent = null;
    state.count = state.selectedCards.length;
    renderProgress();
    setWitchStatus(state.selectedCards.length ? `เลือกแล้ว ${state.selectedCards.length} ใบ · เลือกเพิ่มได้` : "พร้อมเลือกไพ่", "ready");
    return;
  }
  if (state.selectedCards.length >= MAX_SELECTED_CARDS) return;
  state.selectedCards = [...state.selectedCards, { deckIndex, slot: state.selectedCards.length + 1 }];
  state.pendingDrawIntent = null;
  state.count = state.selectedCards.length;
  renderProgress();
  setWitchStatus(`เลือกแล้ว ${state.selectedCards.length} ใบ · กดทำนายเมื่อพร้อม`, "ready");
}

function setFanPhase(phase) {
  state.fanPhase = phase;
  renderDeckZone();
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
  const hasSelection = state.selectedCards.length > 0;
  const current = hasAiAccess()
    ? !questionReady ? "question" : answered ? "answer" : hasSelection ? "draw" : "spread"
    : hasSelection ? "draw" : "spread";
  const steps = [
    ["question", hasAiAccess() && (questionReady || answered)],
    ["spread", hasSelection || hasSpread],
    ["draw", answered],
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
  const pending = Math.max(0, Math.min(MAX_SELECTED_CARDS, Number(state.pendingDrawCount) || 0));
  const opened = Math.min(DECK_SIZE, openedCount());
  const remaining = Math.max(0, remainingCount() - pending);
  const percent = Math.round((opened / DECK_SIZE) * 100);
  $("#remaining-count").textContent = String(remaining);
  $("#available-count").textContent = String(remaining);
  $("#opened-count").textContent = String(opened);
  $("#selected-count").textContent = String(state.selectedCards.length);
  $("#pending-count").textContent = String(pending);
  $("#progress-bar").style.width = `${percent}%`;
  $(".progress-track")?.setAttribute("aria-valuenow", String(opened));
  const empty = remaining === 0 && pending === 0;
  const round = currentRound();
  const hasSpread = Boolean(round);
  const answered = hasAnswer();
  const question = currentQuestionValue();
  const historyView = isViewingHistory();
  const selected = state.selectedCards.length;
  const aiQuestionBlocked = hasAiAccess() && answered && (!question || duplicateCurrentQuestion(question));
  const questionReady = !hasAiAccess() || Boolean(question);
  $("#draw-button").disabled = empty || state.busy || historyView || selected < 1 || aiQuestionBlocked || !questionReady;
  $("#reset-button").disabled = state.busy || historyView;
  $("#draw-label").textContent = empty ? "สำรับหมดแล้ว" : "ทำนาย";
  $("#draw-button")?.setAttribute("aria-label", empty ? "สำรับหมดแล้ว" : `ทำนาย · ${selected || 0} ใบ`);
  $("#deck-message").textContent = historyView
    ? "กำลังดูประวัติเดิม · กดเริ่มดูดวงใหม่ด้านบนเมื่อต้องการเปิดรอบใหม่"
    : state.busy && pending
    ? "กำลังเปิดไพ่ " + pending + " ใบ · เหลือ " + remaining + " ใบ"
    : state.busy && state.fanPhase === "answering"
    ? "กำลังอ่านคำทำนาย · เหลือ " + remaining + " ใบ"
    : empty
    ? "เปิดครบทั้ง 78 ใบแล้ว กดล้างไพ่และสับใหม่เพื่อเริ่มต้นอีกครั้ง"
    : selected >= MAX_SELECTED_CARDS
      ? (hasAiAccess() && !questionReady ? "พิมพ์คำถามก่อน แล้วกดทำนาย" : "เลือกครบ 3 ใบแล้ว · กดทำนายได้เลย")
      : selected
        ? `เลือกแล้ว ${selected} ใบ · เลือกเพิ่มได้อีก ${MAX_SELECTED_CARDS - selected} ใบ หรือกดทำนาย`
        : hasAiAccess() && !questionReady
          ? "ขั้นที่ 1: พิมพ์คำถามก่อน แล้วคลิกไพ่จากสำรับ"
          : `คลิกไพ่จากสำรับเพื่อเลือก · เหลือ ${remaining} ใบ`;
  if (empty) setWitchStatus("เปิดครบทั้งสำรับแล้ว · เริ่มสำรับใหม่ได้เลย");
  else if (state.busy) setWitchStatus(hasAnswer() ? "กำลังอ่านคำทำนาย..." : "กำลังสับไพ่...", "reading");
  else if (selected) setWitchStatus(`เลือกแล้ว ${selected} ใบ · ${selected === MAX_SELECTED_CARDS ? "พร้อมทำนาย" : "เลือกเพิ่มได้"}`, "ready");
  else if (hasAnswer()) setWitchStatus(question && !duplicateCurrentQuestion(question) ? "คำถามใหม่พร้อมแล้ว · เลือกไพ่" : "คำตอบพร้อมแล้ว · พิมพ์คำถามใหม่", "ready");
  else if (hasSpread) setWitchStatus(isMemberMode() ? "พร้อมเปิดรอบใหม่" : "พร้อมเปิดไพ่ต่อ", "ready");
  else if (hasAiAccess() && questionReady) setWitchStatus("คำถามพร้อมแล้ว · เลือกไพ่");
  else if (hasAiAccess()) setWitchStatus("รอคำถามของคุณ");
  else setWitchStatus("พร้อมเลือกไพ่");
  renderWaitingRitual();
  renderQuestionComposer();
  renderFlow();
  renderSelectedTray();
  renderDeckZone();
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
  const resultStage = $("#reading-result-stage");
  const questionContext = $("#result-question-context");
  const readingSets = groupReadingHistory(state.history);
  if (!readingSets.length) {
    if (resultStage) resultStage.hidden = true;
    if (questionContext) questionContext.hidden = true;
    setsContainer.dataset.setCount = "0";
    setsContainer.classList.add("is-empty");
    setsContainer.innerHTML = hasAiAccess()
      ? '<div class="empty-card"><span>?</span><p>พิมพ์คำถาม แล้วคลิกไพ่<br />จากสำรับเพื่อเริ่ม</p></div>'
      : '<div class="empty-card"><span>?</span><p>คลิกไพ่จากสำรับ<br />แล้วกดทำนาย</p></div>';
    $("#spread-count").textContent = "ยังไม่ได้เปิด";
    $("#reading-note").textContent = hasAiAccess() ? "คำตอบจะอ่านจากคำบนไพ่ของรอบล่าสุด" : "เปิดไพ่แล้วอ่านภาพและคำบนไพ่ด้วยตัวเองได้เลย";
    return;
  }
  if (resultStage) resultStage.hidden = false;
  if (questionContext) {
    const question = textValue(currentRound()?.question, 2_000);
    questionContext.textContent = question ? "คำถามที่ใช้เปิดไพ่: " + question : "";
    questionContext.hidden = !question;
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
  $("#result-status")?.replaceChildren(document.createTextNode(hasAiAccess()
    ? `ไพ่ชุดนี้เปิดแล้ว · สำรับเหลือ ${remainingCount()} ใบ · คำทำนายจาก AI จะสรุปต่อด้านล่าง`
    : `ไพ่ชุดนี้เปิดแล้ว · สำรับเหลือ ${remainingCount()} ใบ · อ่านคำบนไพ่และความหมายด้วยตัวเองได้เลย`));
  $("#reading-note").textContent = hasAiAccess() ? "แต่ละชุดแสดงแยกกัน · รอบล่าสุดคือชุดที่ใช้ตอบคำถามปัจจุบัน" : `เปิดแล้ว ${readingSets.length} ชุด · เลื่อนดูไพ่รอบก่อนหน้าได้`;
}

function renderResultActions() {
  const continueButton = $("#continue-reading-button");
  const resetButton = $("#result-reset-button");
  if (!continueButton || !resetButton) return;
  continueButton.replaceChildren(
    document.createTextNode(hasAiAccess() ? "ถามต่อ · จับไพ่ใหม่ " : "จับไพ่ต่อ "),
    Object.assign(document.createElement("span"), { textContent: "→", ariaHidden: "true" }),
  );
  continueButton.disabled = state.busy || isViewingHistory() || !currentRound();
  resetButton.disabled = state.busy || isViewingHistory();
}

function continueReading() {
  if (state.busy || isViewingHistory() || !currentRound()) return;
  state.requestVersion += 1;
  state.selectedCards = [];
  state.pendingDrawCount = 0;
  state.pendingDrawIntent = null;
  state.count = 0;
  state.failedQuestion = "";
  state.failedErrorCode = "";
  state.failedRequestId = "";
  $("#ai-question").value = "";
  setFanPhase("ready");
  renderAll();
  setReaderView("compose", { updateUrl: true, focus: true });
  if (hasAiAccess()) window.requestAnimationFrame(() => $("#ai-question")?.focus({ preventScroll: true }));
}

function historySessionTitle(session, index = 0) {
  return textValue(session?.latest_question || session?.latestQuestion || session?.title, 160) || `ดูดวงครั้งที่ ${index + 1}`;
}

function renderServerHistory() {
  const panel = $("#reading-history-panel");
  const list = $("#reading-history-list");
  const deleteAll = $("#delete-all-history-button");
  if (!panel || !list) return;
  const sessions = isMemberMode()
    ? state.serverHistory.filter((session) => Number(session?.opened_count ?? session?.draw_cursor ?? 0) > 0)
    : [];
  panel.hidden = sessions.length === 0;
  if (deleteAll) {
    deleteAll.hidden = sessions.length === 0;
    deleteAll.disabled = state.historyBusy;
  }
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

    const actions = document.createElement("div");
    actions.className = "reading-history-item-actions";
    const action = document.createElement("button");
    action.className = "history-open-button";
    action.type = "button";
    action.textContent = selected ? "กำลังดู" : "ดูย้อนหลัง";
    action.disabled = state.historyBusy || selected;
    action.addEventListener("click", () => { void openHistorySession(session.id); });
    const remove = document.createElement("button");
    remove.className = "history-delete-button";
    remove.type = "button";
    remove.textContent = "ลบ";
    remove.setAttribute("aria-label", `ลบประวัติ ${historySessionTitle(session, index)}`);
    remove.disabled = state.historyBusy;
    remove.addEventListener("click", () => { void deleteDeckHistory(session.id); });
    actions.append(action, remove);
    item.append(copy, actions);
    return item;
  }));
}

async function deleteDeckHistory(sessionId) {
  if (!hasAiAccess() || state.busy || state.historyBusy || !sessionId) return;
  if (!window.confirm("ลบประวัติการดูดวงรายการนี้หรือไม่? การลบจะย้อนกลับไม่ได้")) return;
  state.historyBusy = true;
  renderServerHistory();
  try {
    await api(deckSessionUrl(sessionId), { method: "DELETE", headers: { "X-CSRF-Token": state.csrf } });
    state.serverHistory = state.serverHistory.filter((session) => String(session.id) !== String(sessionId));
    const isCurrent = String(state.sessionId) === String(sessionId) || String(state.viewingHistorySessionId) === String(sessionId);
    if (isCurrent) {
      state.savedServerSessionId = "";
      state.serverSession = null;
      state.sessionId = "";
      state.viewingHistorySessionId = "";
      state.rounds = [];
      state.currentRoundId = "";
      state.drawn = [];
      state.selectedCards = [];
      state.usedDeckIndexes = [];
      state.visualRounds = [];
      state.visualDeckKey = "";
      state.count = 0;
      clearAnswer();
      syncHistory();
      saveState();
    }
    renderAll();
    if (isCurrent) setReaderView("compose", { updateUrl: true, replace: true });
    $("#request-status").textContent = "ลบประวัติแล้ว · พร้อมเริ่มดูดวงใหม่";
  } catch (error) {
    $("#request-status").textContent = messageForError(error.code, error.requestId) || error.message;
  } finally {
    state.historyBusy = false;
    renderAll();
  }
}

async function deleteAllDeckHistory() {
  if (!hasAiAccess() || state.busy || state.historyBusy) return;
  if (!window.confirm("ลบประวัติการดูดวงทั้งหมดหรือไม่? การลบจะย้อนกลับไม่ได้")) return;
  state.historyBusy = true;
  renderServerHistory();
  try {
    await api("/api/ai/deck-sessions", { method: "DELETE", headers: { "X-CSRF-Token": state.csrf } });
    clearPrivateMemory();
    renderAll();
    $("#request-status").textContent = "ลบประวัติทั้งหมดแล้ว · พร้อมเริ่มดูดวงใหม่";
  } catch (error) {
    $("#request-status").textContent = messageForError(error.code, error.requestId) || error.message;
  } finally {
    state.historyBusy = false;
    renderAll();
  }
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

function clearAnswerFailure() {
  $("#ai-answer-error")?.remove();
}

function renderAnswerFailure() {
  const stage = $("#ai-answer-stage");
  if (!stage || !state.failedQuestion) return;
  let failure = $("#ai-answer-error");
  if (!failure) {
    failure = document.createElement("p");
    failure.id = "ai-answer-error";
    failure.className = "request-status answer-error";
    failure.setAttribute("role", "alert");
    failure.setAttribute("aria-live", "assertive");
    const answerBox = $("#ai-answer");
    if (answerBox) stage.insertBefore(failure, answerBox);
    else stage.append(failure);
  }
  failure.textContent = messageForError(state.failedErrorCode, state.failedRequestId);
  failure.hidden = false;
  stage.hidden = false;
  $("#ai-answer")?.replaceChildren();
  $("#request-status").textContent = failure.textContent;
}

function clearAnswer() {
  clearAnswerFailure();
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
  clearAnswerFailure();
  const reading = normalizeStructuredAnswer(structured, { ...round, answer: answer || round.answer });
  box.replaceChildren();
  const verdict = document.createElement("section");
  verdict.className = "answer-section answer-section--verdict";
  verdict.dataset.answerKey = "verdict";
  verdict.style.setProperty("--answer-delay", "0ms");
  verdict.append(createAnswerHeading("ฟันธงคำถามนี้", "01"));
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
  cardsSection.append(createAnswerHeading("อ่านไพ่ทีละใบ", "02"));
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
    appendCopy(cardSection, "แปลความหมาย", card.meaning);
    appendCopy(cardSection, "คำทำนาย", card.prediction);
    cardList.append(cardSection);
  });
  cardsSection.append(cardList);
  box.append(cardsSection);

  const overall = document.createElement("section");
  overall.className = "answer-section answer-section--overall";
  overall.dataset.answerKey = "overall";
  overall.style.setProperty("--answer-delay", `${(reading.cards.length + 2) * 110}ms`);
  overall.append(createAnswerHeading("สรุปคำทำนาย", "03"));
  const overallText = document.createElement("p");
  overallText.className = "answer-overall-text";
  overallText.textContent = reading.overall_prediction;
  overall.append(overallText);
  if (reading.safety_note) appendCopy(overall, "หมายเหตุ", reading.safety_note);
  box.append(overall);
  $("#ai-answer-stage").hidden = false;
  $("#request-status").textContent = "คำตอบพร้อมแล้ว · พิมพ์คำถามใหม่ด้านบน แล้วเลือกไพ่ชุดใหม่";
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
    requestId: textValue(round?.request_id || round?.requestId, 160),
    roundNumber: Number(round?.round_number || round?.roundNumber || index + 1),
    cards,
    selectedIndexes: Array.isArray(round?.selected_indexes)
      ? round.selected_indexes.map((slot) => Number(slot))
      : Array.isArray(round?.selectedIndexes) ? round.selectedIndexes.map((slot) => Number(slot)) : null,
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
  syncVisualDeckState();
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
  syncVisualDeckState();
  syncHistory();
  saveState();
}

function savedLocalSession() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY) || "null");
    state.savedServerSessionId = textValue(value?.serverSessionId, 120);
    state.savedVisualDeckKey = textValue(value?.visualDeckKey, 160);
    state.savedVisualDeckIndexes = normalizeDeckIndexes(value?.usedDeckIndexes);
    state.savedVisualRounds = normalizeVisualRounds(value?.visualRounds);
    if (!state.savedVisualDeckKey) {
      const visual = JSON.parse(localStorage.getItem(VISUAL_DECK_STORAGE_KEY) || "null");
      state.savedVisualDeckKey = textValue(visual?.key, 160);
      state.savedVisualDeckIndexes = normalizeDeckIndexes(visual?.indexes);
      state.savedVisualRounds = normalizeVisualRounds(visual?.rounds);
    }
    return normalizeLocalDeckSession(value?.localSession || value);
  } catch { return null; }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      serverSessionId: state.sessionId || state.savedServerSessionId,
      localSession: state.localSession,
      visualDeckKey: state.visualDeckKey || visualDeckKey(),
      usedDeckIndexes: normalizeDeckIndexes(state.usedDeckIndexes),
      visualRounds: normalizeVisualRounds(state.visualRounds),
    }));
  } catch { /* private browsing can disable storage */ }
}

function renderAll() {
  syncReaderViewFromLocation();
  renderProgress();
  renderServerHistory();
  renderCards();
  renderResultActions();
  renderDeckZone();
  renderMemory();
  renderAnswerFromCurrent();
  renderQuestionComposer();
  syncQuestion();
}

function renderAnswerFromCurrent() {
  const round = currentRound();
  if (round?.answer || round?.structured) renderAnswer(round.answer, round.structured, round);
  else if (round && hasAiAccess() && !isViewingHistory() && state.failedQuestion && normalizedQuestion(state.failedQuestion) === normalizedQuestion(round.question)) renderAnswerFailure();
  else if (round && hasAiAccess() && isViewingHistory() && round.status === "drawn") {
    clearAnswer();
    $("#ai-answer-stage")?.removeAttribute("hidden");
    $("#retry-ai-button")?.removeAttribute("hidden");
  } else if (!round || !hasAnswer()) clearAnswer();
}

function syncQuestion() {
  const question = currentQuestionValue();
  const answer = hasAnswer();
  const retry = $("#retry-ai-button");
  if (retry) retry.hidden = !(state.failedQuestion && !state.busy);
  if (!hasAiAccess()) {
    $("#request-status").textContent = isMemberMode() ? "บัญชีนี้ยังไม่ได้รับสิทธิ์ AI · เปิดไพ่ดูเองได้เลย" : "โหมดเปิดไพ่ฟรี · เข้าใช้งานเพื่อพิมพ์คำถามถาม AI";
  } else if (!question && !answer) {
    $("#request-status").textContent = "ขั้นที่ 1: พิมพ์คำถามก่อน แล้วจึงเลือกไพ่";
  } else if (answer && !question) {
    $("#request-status").textContent = "คำตอบพร้อมแล้ว · พิมพ์คำถามใหม่เพื่อเปิดไพ่รอบถัดไป";
  } else if (answer && duplicateCurrentQuestion(question)) {
    $("#request-status").textContent = "คำถามซ้ำกับรอบก่อน · พิมพ์คำถามใหม่ก่อนเปิดไพ่";
  } else if (!answer && !state.busy && !state.failedQuestion) {
    $("#request-status").textContent = question ? "คำถามพร้อมแล้ว · เลือกไพ่จากสำรับ" : "พิมพ์คำถามเพื่อเริ่มอ่าน";
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
  state.selectedCards = [];
  state.pendingDrawCount = 0;
  state.pendingDrawIntent = null;
  state.usedDeckIndexes = [];
  state.visualRounds = [];
  state.visualDeckKey = "";
  state.deckRotation = 0;
  state.count = 0;
  state.viewingHistorySessionId = "";
  state.historyBusy = false;
  state.failedQuestion = "";
  state.failedErrorCode = "";
  state.failedRequestId = "";
  state.fanPhase = "ready";
  state.selectedCards = [];
  state.count = 0;
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
  return createServerSessionForRequest(null);
}

async function createServerSessionForRequest(request) {
  const data = await api("/api/ai/deck-sessions", { method: "POST", headers: { "X-CSRF-Token": state.csrf }, body: JSON.stringify({ title: "คำถามจากไพ่" }) });
  if (request && !isCurrentRequest(request.version, request.identity)) return null;
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
  return loadServerReadingHistoryForRequest(null);
}

async function loadServerReadingHistoryForRequest(request) {
  if (request && !isCurrentRequest(request.version, request.identity)) return;
  if (!hasAiAccess()) {
    state.serverHistory = [];
    renderServerHistory();
    return;
  }
  const data = await api("/api/ai/deck-sessions");
  if (request && !isCurrentRequest(request.version, request.identity)) return;
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
    const historyRound = currentRound();
    if (historyRound && !hasAnswer() && historyRound.status === "drawn") {
      state.failedQuestion = historyRound.question;
      state.failedErrorCode = "AI_UNANSWERED_HISTORY";
      state.failedRequestId = "";
    }
    state.fanPhase = "revealed";
    renderAll();
    setReaderView("result", { updateUrl: true, replace: true });
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
  state.selectedCards = [];
  state.pendingDrawCount = 0;
  state.pendingDrawIntent = null;
  state.usedDeckIndexes = [];
  state.visualRounds = [];
  state.visualDeckKey = "";
  state.deckRotation = 0;
  state.count = 0;
  state.failedQuestion = "";
  state.failedErrorCode = "";
  state.failedRequestId = "";
  state.fanPhase = "ready";
  $("#ai-question").value = "";
  clearAnswer();
  syncHistory();
  setReaderView("compose", { updateUrl: true });
  saveState();
  renderAll();
  $("#request-status").textContent = "พร้อมเริ่มดูดวงใหม่ · พิมพ์คำถามแล้วเลือกไพ่จากสำรับ";
  setWitchStatus("พร้อมเริ่มดูดวงใหม่");
  if (hasAiAccess()) window.requestAnimationFrame(() => $("#ai-question")?.focus());
}

async function answerCurrentRound(roundId) {
  if (!hasAiAccess() || !state.sessionId || !roundId) return;
  const version = ++state.requestVersion;
  const identity = captureRequestIdentity();
  const round = state.rounds.find((item) => item.id === roundId);
  if (!round) return;
  state.busy = true;
  renderResultActions();
  setFanPhase("answering");
  state.failedQuestion = "";
  state.failedErrorCode = "";
  state.failedRequestId = "";
  clearAnswerFailure();
  setWitchStatus("กำลังอ่านคำบนไพ่และสรุปคำทำนาย...", "reading");
  $("#request-status").textContent = "กำลังอ่านไพ่ให้ตรงกับคำถาม...";
  renderProgress();
  try {
    const data = await api(deckSessionUrl(state.sessionId, "answer", roundId), { method: "POST", headers: { "X-CSRF-Token": state.csrf }, body: "{}" });
    if (!isCurrentRequest(version, identity)) return;
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
    void loadServerReadingHistoryForRequest({ version: state.requestVersion, identity: captureRequestIdentity() }).catch(() => {});
    $("#ai-question").value = "";
    renderQuestionComposer();
    $("#retry-ai-button").hidden = true;
    $("#ai-answer-title")?.focus?.({ preventScroll: false });
  } catch (error) {
    if (!isCurrentRequest(version, identity)) return;
    if (error.status === 401 || error.code === "ACCOUNT_AUTH_REQUIRED") {
      state.user = null;
      state.csrf = "";
      clearPrivateMemory();
      setReaderMode(null);
      setReaderView("compose", { updateUrl: true, replace: true });
      applyLocalSession(state.localSession);
      renderAll();
      $("#request-status").textContent = "เซสชันหมดอายุ กรุณาเข้าใช้งานใหม่";
    } else {
      state.failedQuestion = round.question;
      state.failedErrorCode = error.code || "";
      state.failedRequestId = error.requestId || "";
      $("#request-status").textContent = messageForError(error.code, error.requestId);
      $("#retry-ai-button").hidden = !["AI_TIMEOUT", "AI_UPSTREAM_ERROR", "AI_RATE_LIMITED", "EMPTY_AI_RESPONSE", "OFFLINE"].includes(error.code);
      setFanPhase("revealed");
      setWitchStatus("ยังอ่านคำทำนายไม่ได้ · กดลองอีกครั้ง");
      renderAnswerFailure();
    }
  } finally {
    if (version === state.requestVersion) {
      state.busy = false;
      renderProgress();
      renderMemory();
      renderResultActions();
      syncQuestion();
    }
  }
}

function goToReadingResult() {
  renderResultActions();
  setReaderView("result", { updateUrl: true, focus: true });
}

async function predictSelectedCards() {
  if (state.busy) return;
  const question = hasAiAccess() ? textValue($("#ai-question")?.value) : "";
  if (!state.selectedCards.length) {
    $("#request-status").textContent = hasAiAccess() ? "พิมพ์คำถาม แล้วคลิกไพ่จากสำรับอย่างน้อย 1 ใบ" : "คลิกไพ่จากสำรับอย่างน้อย 1 ใบก่อนกดทำนาย";
    if (hasAiAccess() && !question) $("#ai-question")?.focus();
    return;
  }
  if (hasAiAccess() && !question) {
    $("#request-status").textContent = "ขั้นที่ 1: พิมพ์คำถามก่อน แล้วจึงกดทำนาย";
    $("#ai-question")?.focus();
    return;
  }
  if (hasAiAccess() && duplicateCurrentQuestion(question)) {
    $("#request-status").textContent = "คำถามซ้ำกับรอบก่อน · พิมพ์คำถามใหม่ก่อนทำนาย";
    $("#ai-question")?.focus();
    return;
  }
  if ($("#draw-button").disabled) return;
  state.count = state.selectedCards.length;
  const selectedIndexes = state.selectedCards.map((item) => Number(item.deckIndex));
  const drawIntent = getDrawIntent(state.count, question, selectedIndexes);
  const drawRequestId = drawIntent.requestId;
  const version = ++state.requestVersion;
  const identity = captureRequestIdentity();
  state.pendingDrawCount = state.selectedCards.length;
  state.busy = true;
  setFanPhase("shuffling");
  $("#draw-button").classList.add("is-busy");
  setWitchStatus("กำลังสับไพ่...", "reading");
  $("#request-status").textContent = "กำลังสับไพ่ · รอสักครู่เพื่อดูผล";
  renderProgress();
  try {
    await sleep(650);
    if (!isCurrentRequest(version, identity)) return;
    let round;
    if (hasAiAccess()) {
      if (!state.sessionId) {
        const session = await createServerSessionForRequest({ version, identity });
        if (!isCurrentRequest(version, identity)) return;
        if (!session) return;
        identity.sessionId = textValue(state.sessionId, 120);
        drawIntent.sessionId = identity.sessionId;
      }
      const sessionId = textValue(state.sessionId, 120);
      if (!sessionId) {
        const error = new Error("ไม่พบรหัสสำรับไพ่ของบัญชีนี้");
        error.code = "SESSION_CREATE_FAILED";
        throw error;
      }
      const data = await api(deckSessionUrl(state.sessionId, "draw"), {
        method: "POST",
        headers: { "X-CSRF-Token": state.csrf },
        body: JSON.stringify({ count: drawIntent.count, question: drawIntent.question, request_id: drawRequestId, selected_indexes: drawIntent.selectedIndexes }),
      });
      if (!isCurrentRequest(version, identity)) return;
      applyServerSession(data.session);
      round = normalizeServerRound(data.round, state.rounds.length - 1);
      state.currentRoundId = round.id;
      state.drawn = [...round.cards];
      state.rounds = state.rounds.filter((item) => item.id !== round.id).concat(round);
      syncHistory();
      saveState();
    } else {
      const result = drawNextRound(state.localSession, drawIntent.count, "", () => randomId("round"), drawIntent.selectedIndexes);
      state.localSession = result.session;
      round = result.round;
      state.rounds = result.session.rounds.map((item) => ({ ...item }));
      state.currentRoundId = round.id;
      state.drawn = [...round.cards];
      syncHistory();
      saveState();
    }
    const committedVisualState = commitVisualRound({
      sessionKey: visualDeckKey(),
      usedIndexes: state.usedDeckIndexes,
      rounds: state.visualRounds,
    }, {
      requestId: drawRequestId,
      roundId: round.id,
      selectedIndexes: drawIntent.selectedIndexes,
      cards: round.cards,
    });
    state.pendingDrawIntent = null;
    state.pendingDrawCount = 0;
    state.usedDeckIndexes = committedVisualState.usedIndexes;
    state.visualRounds = committedVisualState.rounds;
    saveVisualDeckState();
    saveState();
    state.selectedCards = [];
    state.count = 0;
    clearAnswer();
    $("#ai-question").value = hasAiAccess() ? question : $("#ai-question").value;
    state.busy = false;
    $("#draw-button").classList.remove("is-busy");
    setFanPhase(hasAiAccess() ? "answering" : "revealed");
    renderProgress();
    renderCards();
    renderResultActions();
    renderMemory();
    goToReadingResult();
    if (hasAiAccess()) await answerCurrentRound(round.id);
  } catch (error) {
    if (!isCurrentRequest(version, identity)) return;
    state.busy = false;
    state.pendingDrawCount = 0;
    $("#draw-button").classList.remove("is-busy");
    setFanPhase(currentRound()?.cards?.length ? "revealed" : "ready");
    $("#request-status").textContent = messageForError(error.code, error.requestId) || error.message;
    setWitchStatus("ยังทำนายไม่ได้ · กดลองอีกครั้ง");
    renderProgress();
  }
}

const drawCards = predictSelectedCards;

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
  state.selectedCards = [];
  state.pendingDrawCount = 0;
  state.pendingDrawIntent = null;
  state.usedDeckIndexes = [];
  state.visualRounds = [];
  state.visualDeckKey = "";
  state.savedVisualDeckKey = "";
  state.savedVisualDeckIndexes = [];
  state.count = 0;
  state.deckRotation = 0;
  state.failedQuestion = "";
  state.failedErrorCode = "";
  state.failedRequestId = "";
  state.fanPhase = "ready";
  $("#ai-question").value = "";
  clearAnswer();
  syncHistory();
  state.busy = false;
  setReaderView("compose", { updateUrl: true });
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
  state.requestVersion += 1;
  state.busy = false;
  const localSession = state.localSession || createLocalDeckSession();
  state.user = null;
  state.csrf = "";
  clearPrivateMemory();
  applyLocalSession(localSession);
  setReaderMode(null);
  renderAll();
  setReaderView("compose", { updateUrl: true, replace: true });
  try { await api("/api/auth/logout", { method: "POST", body: "{}" }); } catch { /* local guest mode remains usable */ }
}

function handleQuestionInput(event) {
  const value = textValue(event.currentTarget?.value);
  if (value !== state.failedQuestion) {
    state.failedQuestion = "";
    state.failedErrorCode = "";
    state.failedRequestId = "";
    clearAnswerFailure();
  }
  if (state.pendingDrawIntent && value !== state.pendingDrawIntent.question) state.pendingDrawIntent = null;
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
$("#delete-all-history-button")?.addEventListener("click", () => { void deleteAllDeckHistory(); });
$("#retry-ai-button")?.addEventListener("click", retryAi);
$("#ai-question")?.addEventListener("input", handleQuestionInput);
$("#account-link")?.addEventListener("click", logoutMember);
$("#continue-reading-button")?.addEventListener("click", continueReading);
$("#result-reset-button")?.addEventListener("click", () => { void resetCards(); });
window.addEventListener("hashchange", syncReaderViewFromLocation);
window.addEventListener("popstate", syncReaderViewFromLocation);

initMotion();
setReaderMode(null);
state.localSession = savedLocalSession() || createLocalDeckSession();
applyLocalSession(state.localSession);
renderAll();
void loadSession();
