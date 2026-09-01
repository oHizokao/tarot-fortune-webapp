import { messageForError } from "../lib/client/error-copy.js";
import { groupReadingHistory } from "./reading-sets.mjs";

const DECK = Array.from({ length: 78 }, (_, index) => `card-${String(index + 1).padStart(3, "0")}.webp`);
const STORAGE_KEY = "tarot-daily-ai-reading-v2";
const MAX_HISTORY = 60;
const state = { count: 1, drawn: [], openedCards: [], remaining: [], history: [], memory: null, readingId: "", user: null, csrf: "", backend: true, busy: false, requestVersion: 0, failedQuestion: "", failedErrorCode: "", failedRequestId: "", activeQuestion: "" };
const $ = (selector) => document.querySelector(selector);
const choiceButtons = [...document.querySelectorAll(".choice-button")];
let drawTimer = null;

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
  }
  return result;
}

function isValidCards(cards) {
  return Array.isArray(cards) && cards.length <= DECK.length && new Set(cards).size === cards.length && cards.every((card) => DECK.includes(card));
}

function emptySavedState() { return { remaining: shuffle(DECK), drawn: [], openedCards: [], history: [] }; }

function deriveOpenedCards(remaining) { return DECK.filter((card) => !remaining.includes(card)); }

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !isValidCards(saved.remaining)) return emptySavedState();
    const drawn = isValidCards(saved.drawn) ? saved.drawn.slice(0, 3) : [];
    const openedCards = isValidCards(saved.openedCards)
      ? saved.openedCards.filter((card) => !saved.remaining.includes(card))
      : deriveOpenedCards(saved.remaining);
    const history = groupReadingHistory(saved.history)
      .slice(0, MAX_HISTORY)
      .map(({ setNumber, cardCount, ...entry }) => entry);
    return { remaining: saved.remaining, drawn, openedCards, history };
  } catch { return emptySavedState(); }
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ remaining: state.remaining, drawn: state.drawn, openedCards: state.openedCards, history: state.history })); } catch { /* private browsing can disable storage */ }
}

function setCount(count) {
  state.count = count;
  choiceButtons.forEach((button) => { const selected = Number(button.dataset.count) === count; button.classList.toggle("is-selected", selected); button.setAttribute("aria-pressed", String(selected)); });
}

function hasQuestion() { return $("#ai-question").value.trim().length > 0; }

function hasAnswer() { return Boolean($("#ai-answer")?.childElementCount); }

function hasAiAccess() { return Boolean(state.user?.ai_enabled && !state.user?.must_change_password); }

function isMemberMode() { return Boolean(state.user); }

function activeCards() { return isMemberMode() ? state.drawn : state.openedCards; }

function setReaderMode(user) {
  const member = Boolean(user);
  const app = $("#ai-reader-app");
  if (app) app.dataset.readerMode = member ? "member" : "guest";
  document.querySelectorAll(".member-only").forEach((element) => { element.hidden = !member; });
  const guestBanner = $("#guest-mode-banner");
  if (guestBanner) guestBanner.hidden = member;
  const copy = member
    ? {
      brand: "WITCH AI READER",
      eyebrow: "A QUESTION · A SPREAD · A KINDER NEXT STEP",
      primary: "ให้แม่มดช่วยอ่าน",
      secondary: "สิ่งที่ไพ่อยากบอก",
      description: "พิมพ์เรื่องที่อยู่ในใจ เลือกจำนวนไพ่ แล้วดูการเปิดไพ่ทีละใบ ก่อนรับคำสะท้อนที่เชื่อมจากคำบนไพ่กับคำถามของคุณ",
      spread: "เลือกตามความรู้สึกในตอนนี้ แล้วแม่มดจะเปิดไพ่ให้ทีละใบ",
      cards: "แม่มดกำลังเปิดไพ่",
      seal: "ASK\nGENTLY",
    }
    : {
      brand: "FREE CARD READER",
      eyebrow: "FREE READING · NO LOGIN",
      primary: "เปิดไพ่ด้วยตัวเอง",
      secondary: "ให้ไพ่เล่าเรื่องของคุณ",
      description: "เลือกจำนวนไพ่ เปิดทีละใบ แล้วอ่านภาพและคำบนไพ่ด้วยสัญชาตญาณของคุณเอง ไม่ต้องสมัครสมาชิก",
      spread: "เลือก 1, 2 หรือ 3 ใบ แล้วเปิดไพ่เพื่ออ่านด้วยตัวเอง",
      cards: "ไพ่ของคุณ",
      seal: "FREE\nREADING",
    };
  $("#brand-mode-label")?.replaceChildren(document.createTextNode(copy.brand));
  $("#hero-eyebrow")?.replaceChildren(document.createTextNode(copy.eyebrow));
  $("#hero-title-primary")?.replaceChildren(document.createTextNode(copy.primary));
  $("#hero-title-secondary")?.replaceChildren(document.createTextNode(copy.secondary));
  $("#hero-description")?.replaceChildren(document.createTextNode(copy.description));
  $("#spread-description")?.replaceChildren(document.createTextNode(copy.spread));
  $("#cards-title")?.replaceChildren(document.createTextNode(copy.cards));
  $("#hero-seal-label")?.replaceChildren(document.createTextNode(copy.seal));
  $("#spread-kicker")?.replaceChildren(document.createTextNode(member ? "02 / YOUR SPREAD" : "01 / CHOOSE CARDS"));
  $("#reveal-kicker")?.replaceChildren(document.createTextNode(member ? "03 / THE REVEAL" : "02 / YOUR REVEAL"));
  const stepNumbers = member ? { question: "01", spread: "02", draw: "03", answer: "04" } : { spread: "01", draw: "02" };
  Object.entries(stepNumbers).forEach(([step, number]) => { $(`#flow-number-${step}`)?.replaceChildren(document.createTextNode(number)); });
}

function setWitchStatus(message, mode = "") {
  const element = $("#witch-status");
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("is-reading", mode === "reading");
  element.classList.toggle("is-ready", mode === "ready");
}

function renderFlow() {
  const hasSpread = activeCards().length > 0;
  const answered = hasAnswer();
  const aiMode = hasAiAccess();
  const current = aiMode
    ? !hasQuestion() ? "question" : !hasSpread ? "spread" : answered ? "answer" : "draw"
    : !hasSpread ? "spread" : "draw";
  const steps = [
    ["question", aiMode && hasQuestion()],
    ["spread", hasSpread],
    ["draw", hasSpread],
    ["answer", aiMode && answered],
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
  const opened = DECK.length - state.remaining.length;
  const percent = Math.round((opened / DECK.length) * 100);
  $("#remaining-count").textContent = state.remaining.length;
  $("#opened-count").textContent = opened;
  $("#progress-bar").style.width = `${percent}%`;
  $(".progress-track").setAttribute("aria-valuenow", String(opened));
  const empty = state.remaining.length === 0;
  const hasSpread = activeCards().length > 0;
  const aiMode = hasAiAccess();
  const locksSpread = isMemberMode() && hasSpread;
  const questionReady = !aiMode || hasQuestion();
  $("#draw-button").disabled = empty || state.busy || locksSpread || !questionReady;
  $("#reset-button").disabled = state.busy;
  choiceButtons.forEach((button) => { button.disabled = state.busy || locksSpread; });
  const nextCount = Math.min(state.count, state.remaining.length);
  $("#draw-label").textContent = empty
    ? "สำรับหมดแล้ว"
    : locksSpread
      ? "ชุดนี้เปิดแล้ว"
      : !isMemberMode() && hasSpread
        ? `เปิดเพิ่ม ${nextCount} ใบ`
        : aiMode ? questionReady ? "จับไพ่ให้ฉัน" : "พิมพ์คำถามก่อน" : "เปิดไพ่ให้ฉัน";
  $("#deck-message").textContent = empty
    ? "เปิดครบทั้ง 78 ใบแล้ว กดล้างไพ่เพื่อเริ่มรอบใหม่"
    : hasSpread
      ? isMemberMode() ? aiMode ? `เปิดแล้ว ${opened} ใบ · ถามต่อจากชุดนี้ได้ หรือกดล้างไพ่เพื่อเริ่มเรื่องใหม่` : `เปิดแล้ว ${opened} ใบ · อ่านความหมายจากไพ่ชุดนี้ได้เลย` : `เปิดแล้ว ${opened} ใบ · กดเปิดเพิ่มได้เลย ไพ่จะไม่ซ้ำกัน`
      : aiMode
        ? questionReady
          ? `คำถามพร้อมแล้ว · กดจับไพ่เพื่อเริ่มอ่าน (เหลือ ${state.remaining.length} ใบ)`
          : "ขั้นที่ 1: พิมพ์คำถามก่อน แล้วจึงจับไพ่"
        : `พร้อมเปิดไพ่ · เหลือ ${state.remaining.length} ใบในสำรับนี้`;
  if (empty) setWitchStatus("เปิดครบทั้งสำรับแล้ว · เริ่มใหม่ได้เลย");
  else if (hasSpread && state.busy) setWitchStatus("แม่มดกำลังอ่านไพ่...", "reading");
  else if (hasSpread && hasAnswer()) setWitchStatus("คำตอบพร้อมแล้ว · ถามต่อได้", "ready");
  else if (hasSpread) setWitchStatus(isMemberMode() && aiMode ? "ไพ่เปิดแล้ว · รอคำตอบ" : !isMemberMode() ? "ไพ่เปิดแล้ว · เปิดเพิ่มได้เลย" : "ไพ่เปิดแล้ว · อ่านได้เลย");
  else if (aiMode && questionReady) setWitchStatus("คำถามพร้อมแล้ว · กดเปิดไพ่");
  else if (aiMode) setWitchStatus("รอคำถามของคุณ");
  else setWitchStatus("พร้อมเปิดไพ่");
  renderFlow();
}

function getNumber(file) { return file.match(/card-(\d{3})/)?.[1] || "—"; }

function createCardElement(file, index, animatedFrom, imageIndex = index) {
  const card = document.createElement("article");
  card.className = "tarot-card-card";
  card.dataset.cardFile = file;
  card.style.setProperty("--card-delay", `${Math.min(2, Math.max(0, index - animatedFrom)) * 180}ms`);
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
  try {
    return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
  } catch { return "เวลาไม่ระบุ"; }
}

function createReadingSetElement(entry, setIndex, cardOffset) {
  const readingSet = document.createElement("section");
  readingSet.className = "reading-set";
  readingSet.dataset.setId = entry.id;
  readingSet.setAttribute("data-set-id", entry.id);
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
  titleState.textContent = setIndex === 0 ? "ชุดล่าสุด" : "เปิดก่อนหน้านี้";
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
  const animatedFrom = setIndex === 0 ? Math.max(0, entry.cardCount - state.count) : entry.cardCount;
  entry.cards.forEach((file, cardIndex) => cardsGrid.append(createCardElement(file, cardIndex, animatedFrom, cardOffset + cardIndex)));

  const setHint = document.createElement("p");
  setHint.className = "reading-set-hint";
  setHint.textContent = setIndex === 0 && hasAiAccess()
    ? "คำตอบ AI จะอ่านจากไพ่ชุดล่าสุดนี้"
    : `ชุดนี้มีไพ่ ${entry.cardCount} ใบ · ไพ่ไม่ซ้ำกับชุดอื่นในรอบสำรับ`;

  readingSet.append(heading, cardsGrid, setHint);
  return readingSet;
}

function renderCards() {
  const setsContainer = $("#reading-sets");
  const readingSets = groupReadingHistory(state.history);
  if (!readingSets.length) {
    setsContainer.dataset.setCount = "0";
    setsContainer.classList.add("is-empty");
    setsContainer.innerHTML = hasAiAccess()
      ? '<div class="empty-card"><span>?</span><p>พิมพ์คำถามให้ชัดเจนก่อน<br />แล้วจึงกดจับไพ่</p></div>'
      : '<div class="empty-card"><span>?</span><p>เลือกจำนวนไพ่<br />แล้วกดเปิดไพ่</p></div>';
    $("#spread-count").textContent = "ยังไม่ได้เปิด";
    $("#reading-note").textContent = hasAiAccess() ? "คำตอบจาก AI จะอ้างอิงเฉพาะคำที่อยู่บนไพ่ชุดนี้" : "เปิดไพ่แล้วอ่านภาพและคำบนไพ่ด้วยตัวเองได้เลย";
    setWitchStatus(hasAiAccess() ? "รอคำถามของคุณ" : "พร้อมเปิดไพ่");
    renderMemory();
    syncQuestion();
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
  $("#spread-count").textContent = isMemberMode() ? `ชุดล่าสุด · ${readingSets[0].cardCount} ใบ` : `${readingSets.length} ชุด · ${totalCards} ใบ`;
  $("#reading-note").textContent = hasAiAccess()
    ? "แต่ละชุดแสดงแยกกัน · คำตอบ AI จะอ้างอิงเฉพาะชุดล่าสุด"
    : `เปิดแล้ว ${readingSets.length} ชุด · อ่านภาพและคำบนไพ่ของแต่ละชุดได้เลย`;
  setWitchStatus(state.busy ? "แม่มดกำลังอ่านไพ่..." : hasAiAccess() ? "ไพ่เปิดแล้ว · รอคำตอบ" : "ไพ่เปิดแล้ว · อ่านได้เลย", state.busy ? "reading" : "");
  renderMemory();
  syncQuestion();
}

function memoryMessages() { return Array.isArray(state.memory?.messages) ? state.memory.messages : []; }

function renderMemory() {
  const title = $("#memory-title");
  const message = $("#memory-message");
  const action = $("#new-reading-button");
  const status = $("#memory-status");
  if (!title || !message || !action || !status) return;
  const messages = memoryMessages();
  const turns = Math.floor(messages.filter((item) => item.role === "assistant").length);
  const hasSpread = activeCards().length > 0;
  action.disabled = !hasSpread || state.busy;
  status.classList.toggle("is-active", turns > 0);
  if (!hasSpread) {
    title.textContent = "Memory ของชุดไพ่ยังว่าง";
    message.textContent = "หลังเปิดไพ่ชุดใหม่ คำถามแรกจะกลายเป็นคำถามตั้งต้น";
  } else if (!turns) {
    title.textContent = "พร้อมจำคำถามของชุดนี้";
    message.textContent = state.user?.ai_enabled ? "ถามครั้งแรกแล้วระบบจะจำบริบทไว้บนบัญชีของคุณ เพื่อถามต่อจากไพ่ชุดเดิมได้" : "เมื่อเข้าใช้งานและได้รับสิทธิ์ AI แล้ว ระบบจะจำบริบทไว้บนบัญชีของคุณ";
  } else {
    const firstQuestion = String(messages.find((item) => item.role === "user")?.content || "").slice(0, 90);
    title.textContent = "Memory พร้อม · ถามต่อจากคำถามเดิมได้";
    message.textContent = `คำถามตั้งต้น: “${firstQuestion}${firstQuestion.length >= 90 ? "…" : ""}” · ถ้าเป็นเรื่องใหม่ให้กดล้างไพ่`;
  }
  renderFlow();
}

function clearAnswer() { $("#ai-answer").replaceChildren(); }

function restoreSavedMemoryAnswer() {
  const latest = [...memoryMessages()].reverse().find((message) => message.role === "assistant");
  if (latest?.content) renderAnswer(latest.content);
}

function clearPrivateMemory() {
  state.memory = null;
  state.readingId = "";
  state.activeQuestion = "";
  state.failedQuestion = "";
  state.failedErrorCode = "";
  state.failedRequestId = "";
  clearAnswer();
  renderMemory();
}

function drawCards() {
  const question = $("#ai-question").value.trim();
  if (hasAiAccess() && !question) {
    $("#request-status").textContent = "ขั้นที่ 1: พิมพ์คำถามก่อน แล้วจึงกดจับไพ่";
    $("#ai-question").focus();
    renderFlow();
    return;
  }
  if ($("#draw-button").disabled) return;
  state.activeQuestion = question;
  state.failedQuestion = "";
  state.failedErrorCode = "";
  state.failedRequestId = "";
  state.busy = true;
  setWitchStatus("แม่มดกำลังสับไพ่...", "reading");
  renderProgress();
  $("#draw-button").classList.add("is-busy");
  drawTimer = window.setTimeout(() => {
    const amount = Math.min(state.count, state.remaining.length);
    const nextCards = state.remaining.splice(0, amount);
    state.drawn = nextCards;
    state.openedCards = [...state.openedCards, ...nextCards];
    state.memory = null;
    state.readingId = "";
    if (amount) state.history.unshift({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, createdAt: Date.now(), cards: [...nextCards] });
    state.history = state.history.slice(0, MAX_HISTORY);
    state.busy = false;
    clearAnswer();
    saveState();
    renderProgress();
    renderCards();
    $("#draw-button").classList.remove("is-busy");
    drawTimer = null;
    if (hasAiAccess() && question) {
      setWitchStatus("แม่มดกำลังอ่านไพ่...", "reading");
      void askAi(question);
    } else {
      setWitchStatus("ไพ่เปิดแล้ว · อ่านคำบนไพ่ได้เลย", "ready");
      syncQuestion();
    }
  }, 420);
}

async function closeServerReading() {
  if (!state.readingId || !state.user?.ai_enabled) return;
  try { await api(`/api/ai/tarot-chat?reading_id=${encodeURIComponent(state.readingId)}&action=close`, { method: "POST", headers: { "X-CSRF-Token": state.csrf }, body: "{}" }); } catch { /* local reset must remain usable if the network is unavailable */ }
}

function resetCards() {
  if (drawTimer !== null) {
    window.clearTimeout(drawTimer);
    drawTimer = null;
    $("#draw-button").classList.remove("is-busy");
  }
  closeServerReading();
  state.requestVersion += 1;
  state.remaining = shuffle(DECK);
  state.drawn = [];
  state.openedCards = [];
  state.history = [];
  state.memory = null;
  state.readingId = "";
  state.activeQuestion = "";
  state.failedQuestion = "";
  state.failedErrorCode = "";
  state.failedRequestId = "";
  state.busy = false;
  $("#ai-question").value = "";
  clearAnswer();
  saveState();
  renderProgress();
  renderCards();
  $("#request-status").textContent = "เริ่มสำรับใหม่แล้ว ไพ่ทั้ง 78 ใบพร้อมให้เปิด · Memory เดิมถูกปิดแล้ว";
  setWitchStatus("สำรับใหม่พร้อมแล้ว");
  renderMemory();
}

async function api(url, options = {}) {
  const headers = { Accept: "application/json", "X-Client-Request-Id": crypto.randomUUID?.() || String(Date.now()), ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) };
  let response;
  try { response = await fetch(url, { credentials: "same-origin", ...options, headers }); }
  catch (error) { const offline = new Error("ตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่"); offline.code = navigator.onLine === false ? "OFFLINE" : "AI_UPSTREAM_ERROR"; offline.cause = error; throw offline; }
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { throw new Error("เซิร์ฟเวอร์ส่งข้อมูลที่อ่านไม่ได้"); }
  if (!response.ok || data.ok === false) { const error = new Error(data.message || data.error || "ทำรายการไม่สำเร็จ"); error.code = data.code || "REQUEST_FAILED"; error.status = response.status; error.requestId = data.request_id || response.headers.get("x-request-id") || ""; throw error; }
  return data;
}

function setAccount(user, csrf = "") {
  state.user = user;
  state.csrf = csrf;
  setReaderMode(user);
  const link = $("#account-link");
  const action = $("#account-action");
  if (!user) {
    link.textContent = "เข้าใช้งาน";
    link.href = "../login/?next=/ai/";
    action.textContent = "เข้าใช้งาน";
    action.href = "../login/?next=/ai/";
    $("#account-title").textContent = "เข้าใช้งานเพื่อส่งคำถามให้ AI";
    $("#account-message").textContent = state.backend ? "พิมพ์คำถามก่อน แล้วกดจับไพ่ได้ฟรี เมื่ออยากรับคำตอบจาก AI ให้เข้าใช้งาน" : "โหมดเปิดไพ่ฟรีพร้อมใช้งาน แต่ยังไม่ได้เชื่อมต่อระบบสมาชิก";
    $("#ask-ai-button").disabled = true;
    renderProgress();
    renderCards();
    return;
  }
  link.textContent = user.name || user.username || "บัญชีของฉัน";
  link.href = "#question-title";
  action.textContent = "ออกจากระบบ";
  action.href = "#question-title";
  $("#account-title").textContent = user.must_change_password ? "กรุณาเปลี่ยนรหัสผ่านก่อน" : user.ai_enabled ? `พร้อมอ่านไพ่ให้ ${user.name || user.username}` : "บัญชีนี้ยังรอสิทธิ์ AI";
  $("#account-message").textContent = user.must_change_password ? "รหัสผ่านชั่วคราวต้องเปลี่ยนที่หน้าเข้าใช้งานก่อน จึงจะใช้ AI ได้" : user.ai_enabled ? "พิมพ์คำถามก่อน แล้วกดจับไพ่ ระบบจะอ่านคำตอบให้โดยอัตโนมัติ และจำบริบทไว้ถามต่อ" : "บัญชีเข้าใช้งานแล้ว แต่ผู้ดูแลยังไม่ได้เปิดสิทธิ์ AI ให้บัญชีนี้";
  renderProgress();
  renderCards();
}

async function loadServerReadingForSpread() {
  if (!state.user?.ai_enabled || !state.drawn.length) return;
  const data = await api("/api/ai/readings");
  const match = (data.readings || []).find((reading) => JSON.stringify(reading.cards) === JSON.stringify(state.drawn) && reading.status === "active");
  if (!match) return;
  const detail = await api(`/api/ai/tarot-chat?reading_id=${encodeURIComponent(match.id)}`);
  state.readingId = detail.reading?.id || "";
  state.memory = detail.reading || null;
  renderMemory();
  restoreSavedMemoryAnswer();
}

async function loadSession() {
  try {
    const data = await api("/api/auth/me");
    state.backend = data.backend_configured !== false;
    const authenticated = Boolean(data.authenticated && data.user);
    setAccount(authenticated ? data.user : null, data.csrf_token || "");
    if (authenticated) {
      try { await loadServerReadingForSpread(); } catch { /* the draw and question UI must still work if history is temporarily unavailable */ }
    } else clearPrivateMemory();
  } catch { state.backend = false; setAccount(null); clearPrivateMemory(); }
  syncQuestion();
  if (state.user?.ai_enabled && !state.user.must_change_password && state.drawn.length && hasQuestion() && !hasAnswer()) void askAi();
}

function syncQuestion() {
  const question = $("#ai-question").value.trim();
  const questionReady = hasQuestion();
  const spreadReady = state.drawn.length > 0;
  const answered = hasAnswer();
  const aiMode = hasAiAccess();
  const button = $("#ask-ai-button");
  button.disabled = state.busy || !aiMode || !spreadReady || !questionReady;
  button.querySelector("span")?.replaceChildren(document.createTextNode(answered ? "ถามต่อจากชุดเดิม" : "รับคำตอบจาก AI"));
  if (!aiMode) {
    if (state.user && !state.user.ai_enabled) $("#request-status").textContent = "บัญชีนี้ยังไม่ได้รับสิทธิ์ AI จากผู้ดูแล · เปิดไพ่ดูเองได้เลย";
    else if (state.user?.must_change_password) $("#request-status").textContent = "เปลี่ยนรหัสผ่านก่อนจึงจะถาม AI ได้ · เปิดไพ่ดูเองได้เลย";
    else $("#request-status").textContent = "โหมดเปิดไพ่ฟรี · เข้าใช้งานเพื่อพิมพ์คำถามถาม AI";
  } else if (!questionReady && answered) $("#request-status").textContent = "คำตอบพร้อมแล้ว · พิมพ์คำถามต่อเพื่ออ้างอิงไพ่ชุดเดิม";
  else if (!questionReady && !spreadReady) $("#request-status").textContent = "ขั้นที่ 1: พิมพ์คำถามก่อน แล้วจึงกดจับไพ่";
  else if (!spreadReady) $("#request-status").textContent = "คำถามพร้อมแล้ว · กดจับไพ่เพื่อเริ่มอ่าน";
  else if (!state.user) $("#request-status").textContent = "จับไพ่แล้ว · เข้าใช้งานเพื่อรับคำตอบจาก AI";
  else if (state.user.must_change_password) $("#request-status").textContent = "เปลี่ยนรหัสผ่านก่อนจึงจะถาม AI ได้";
  else if (!state.user.ai_enabled) $("#request-status").textContent = "บัญชีนี้ยังไม่ได้รับสิทธิ์ AI จากผู้ดูแล";
  else if (!state.busy && !answered) {
    const failedQuestionIsCurrent = Boolean(state.failedQuestion) && question === state.failedQuestion;
    $("#request-status").textContent = failedQuestionIsCurrent
      ? messageForError(state.failedErrorCode, state.failedRequestId)
      : questionReady ? "กำลังเตรียมคำตอบจากคำบนไพ่..." : "พิมพ์คำถามเพื่อรับคำตอบ";
  }
  else if (!state.busy && answered && questionReady) $("#request-status").textContent = "คำถามนี้จะเชื่อมกับ Memory ของไพ่ชุดเดิม";
  renderProgress();
  renderFlow();
}

function renderAnswer(answer) {
  const box = $("#ai-answer");
  box.replaceChildren();
  String(answer).split(/\n{2,}|\n/).map((line) => line.trim()).filter(Boolean).forEach((line, index) => { const paragraph = document.createElement("p"); paragraph.className = "answer-line"; paragraph.style.setProperty("--answer-delay", `${index * 110}ms`); paragraph.textContent = line; box.append(paragraph); });
  setWitchStatus("คำตอบพร้อมแล้ว · ถามต่อจากชุดเดิมได้", "ready");
}

async function ensureReading() {
  if (state.readingId) return;
  const data = await api("/api/ai/readings", { method: "POST", headers: { "X-CSRF-Token": state.csrf }, body: JSON.stringify({ cards: state.drawn, title: "คำถามจากชุดไพ่" }) });
  state.readingId = data.reading?.id || "";
  state.memory = data.reading || null;
  if (!state.readingId) throw new Error("สร้างชุดไพ่สำหรับ Memory ไม่สำเร็จ");
}

async function askAi(questionOverride = "") {
  if (!state.user?.ai_enabled || state.user.must_change_password || !state.drawn.length) return syncQuestion();
  const question = String(questionOverride || $("#ai-question").value.trim() || state.failedQuestion).trim();
  if (!question || state.busy) return syncQuestion();
  const version = ++state.requestVersion;
  state.busy = true;
  setWitchStatus("แม่มดกำลังอ่านคำบนไพ่...", "reading");
  $("#ask-ai-button").disabled = true;
  $("#request-status").textContent = "กำลังอ่านคำบนไพ่และเชื่อมโยงกับคำถาม...";
  try {
    await ensureReading();
    if (version !== state.requestVersion) return;
    const data = await api(`/api/ai/tarot-chat?reading_id=${encodeURIComponent(state.readingId)}&action=message`, { method: "POST", headers: { "X-CSRF-Token": state.csrf }, body: JSON.stringify({ question }) });
    if (version !== state.requestVersion) return;
    state.memory = data.reading || state.memory;
    renderAnswer(String(data.answer || "").trim());
    renderMemory();
    $("#ai-question").value = "";
    state.failedQuestion = "";
    state.failedErrorCode = "";
    state.failedRequestId = "";
    $("#retry-ai-button").hidden = true;
    $("#ai-answer-title")?.focus?.({ preventScroll: false });
    $("#request-status").textContent = "คำตอบนี้เป็นแนวทางสะท้อนความคิด คุณเป็นคนตัดสินใจเองเสมอ";
  } catch (error) {
    if (error.status === 401 || error.code === "ACCOUNT_AUTH_REQUIRED") { setAccount(null); clearPrivateMemory(); $("#request-status").textContent = "เซสชันหมดอายุ กรุณาเข้าใช้งานใหม่"; }
    else { state.failedQuestion = question; state.failedErrorCode = error.code || ""; state.failedRequestId = error.requestId || ""; $("#retry-ai-button").hidden = !["AI_TIMEOUT", "AI_UPSTREAM_ERROR", "AI_RATE_LIMITED", "EMPTY_AI_RESPONSE", "OFFLINE"].includes(error.code); $("#request-status").textContent = messageForError(error.code, error.requestId); setWitchStatus("ยังอ่านคำตอบไม่ได้ · กดลองอีกครั้ง"); }
  } finally { if (version === state.requestVersion) { state.busy = false; renderMemory(); syncQuestion(); } }
}

$("#draw-button").addEventListener("click", drawCards);
$("#reset-button").addEventListener("click", resetCards);
$("#new-reading-button").addEventListener("click", resetCards);
choiceButtons.forEach((button) => button.addEventListener("click", () => setCount(Number(button.dataset.count))));
$("#ai-question").addEventListener("input", () => {
  if ($("#ai-question").value.trim() !== state.failedQuestion) {
    state.failedQuestion = "";
    state.failedErrorCode = "";
    state.failedRequestId = "";
  }
  syncQuestion();
});
$("#ask-ai-button").addEventListener("click", () => askAi());
$("#retry-ai-button").addEventListener("click", () => askAi());
$("#account-action").addEventListener("click", async (event) => {
  if (!state.user) return;
  event.preventDefault();
  try { await api("/api/auth/logout", { method: "POST", body: "{}" }); } catch { /* the local UI can still sign out */ }
  state.requestVersion += 1;
  clearPrivateMemory();
  setAccount(null);
  syncQuestion();
});

Object.assign(state, loadState());
renderProgress();
renderCards();
renderMemory();
loadSession();
