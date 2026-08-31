import { messageForError } from "../lib/client/error-copy.js";

const DECK = Array.from({ length: 78 }, (_, index) => `card-${String(index + 1).padStart(3, "0")}.webp`);
const STORAGE_KEY = "tarot-daily-ai-reading-v2";
const MAX_HISTORY = 60;
const state = { count: 1, drawn: [], remaining: [], history: [], memory: null, readingId: "", user: null, csrf: "", backend: true, busy: false, requestVersion: 0, failedQuestion: "" };
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

function emptySavedState() { return { remaining: shuffle(DECK), drawn: [], history: [] }; }

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !isValidCards(saved.remaining)) return emptySavedState();
    return { remaining: saved.remaining, drawn: isValidCards(saved.drawn) ? saved.drawn.slice(0, 3) : [], history: Array.isArray(saved.history) ? saved.history.slice(0, MAX_HISTORY) : [] };
  } catch { return emptySavedState(); }
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ remaining: state.remaining, drawn: state.drawn, history: state.history })); } catch { /* private browsing can disable storage */ }
}

function setCount(count) {
  state.count = count;
  choiceButtons.forEach((button) => { const selected = Number(button.dataset.count) === count; button.classList.toggle("is-selected", selected); button.setAttribute("aria-pressed", String(selected)); });
}

function renderProgress() {
  const opened = DECK.length - state.remaining.length;
  const percent = Math.round((opened / DECK.length) * 100);
  $("#remaining-count").textContent = state.remaining.length;
  $("#opened-count").textContent = opened;
  $("#progress-bar").style.width = `${percent}%`;
  $(".progress-track").setAttribute("aria-valuenow", String(opened));
  const empty = state.remaining.length === 0;
  $("#draw-button").disabled = empty || state.busy;
  $("#reset-button").disabled = state.busy;
  choiceButtons.forEach((button) => { button.disabled = state.busy; });
  $("#draw-label").textContent = empty ? "สำรับหมดแล้ว" : "เปิดไพ่ให้ฉัน";
  $("#deck-message").textContent = empty ? "เปิดครบทั้ง 78 ใบแล้ว กดล้างคำทำนายเพื่อเริ่มรอบใหม่" : `เปิดแล้ว ${opened} ใบ · เหลืออีก ${state.remaining.length} ใบ`;
}

function getNumber(file) { return file.match(/card-(\d{3})/)?.[1] || "—"; }

function renderCards() {
  const grid = $("#cards-grid");
  if (!state.drawn.length) {
    grid.classList.add("is-empty");
    grid.innerHTML = '<div class="empty-card"><span>?</span><p>ตั้งใจนึกถึงคำถาม<br />แล้วกดเปิดไพ่</p></div>';
    $("#spread-count").textContent = "ยังไม่ได้เปิด";
    $("#reading-note").textContent = "คำตอบจาก AI จะอ้างอิงเฉพาะคำที่อยู่บนไพ่ชุดนี้";
    renderMemory();
    syncQuestion();
    return;
  }
  grid.classList.remove("is-empty");
  grid.replaceChildren(...state.drawn.map((file, index) => {
    const card = document.createElement("article");
    card.className = "tarot-card-card";
    card.style.setProperty("--card-delay", `${index * 180}ms`);
    const image = document.createElement("img");
    image.src = `../tarot-cards/${file}`;
    image.alt = `ไพ่ทำนายใบที่ ${index + 1}`;
    image.loading = "eager";
    const meta = document.createElement("div");
    meta.className = "card-meta";
    meta.textContent = `CARD ${getNumber(file)} · ไพ่ใบที่ ${index + 1}`;
    card.append(image, meta);
    return card;
  }));
  $("#spread-count").textContent = `${state.drawn.length} ใบที่เปิดได้`;
  $("#reading-note").textContent = "ไพ่ชุดนี้พร้อมให้คุณพิมพ์คำถาม แล้วให้ AI เชื่อมคำบนไพ่กับเรื่องของคุณ";
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
  const hasSpread = state.drawn.length > 0;
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
}

function clearAnswer() { $("#ai-answer").replaceChildren(); }

function restoreSavedMemoryAnswer() {
  const latest = [...memoryMessages()].reverse().find((message) => message.role === "assistant");
  if (latest?.content) renderAnswer(latest.content);
}

function clearPrivateMemory() {
  state.memory = null;
  state.readingId = "";
  clearAnswer();
  renderMemory();
}

function drawCards() {
  if ($("#draw-button").disabled) return;
  state.busy = true;
  renderProgress();
  $("#draw-button").classList.add("is-busy");
  drawTimer = window.setTimeout(() => {
    const amount = Math.min(state.count, state.remaining.length);
    state.drawn = state.remaining.splice(0, amount);
    state.memory = null;
    state.readingId = "";
    if (amount) state.history.unshift({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, createdAt: Date.now(), cards: [...state.drawn] });
    state.history = state.history.slice(0, MAX_HISTORY);
    state.busy = false;
    clearAnswer();
    saveState();
    renderProgress();
    renderCards();
    $("#draw-button").classList.remove("is-busy");
    drawTimer = null;
  }, 420);
}

async function closeServerReading() {
  if (!state.readingId || !state.user?.ai_enabled) return;
  try { await api(`/api/ai/readings/${encodeURIComponent(state.readingId)}/close`, { method: "POST", headers: { "X-CSRF-Token": state.csrf }, body: "{}" }); } catch { /* local reset must remain usable if the network is unavailable */ }
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
  state.history = [];
  state.memory = null;
  state.readingId = "";
  state.busy = false;
  $("#ai-question").value = "";
  clearAnswer();
  saveState();
  renderProgress();
  renderCards();
  $("#request-status").textContent = "เริ่มสำรับใหม่แล้ว ไพ่ทั้ง 78 ใบพร้อมให้เปิด · Memory เดิมถูกปิดแล้ว";
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
  const link = $("#account-link");
  const action = $("#account-action");
  if (!user) {
    link.textContent = "เข้าใช้งาน";
    link.href = "../login/?next=/ai/";
    action.textContent = "เข้าใช้งาน";
    action.href = "../login/?next=/ai/";
    $("#account-title").textContent = "เข้าใช้งานเพื่อส่งคำถามให้ AI";
    $("#account-message").textContent = state.backend ? "เปิดไพ่และพิมพ์คำถามได้เลย เมื่อพร้อมให้ AI ตอบให้เข้าใช้งานก่อน" : "โหมดเปิดไพ่ฟรีพร้อมใช้งาน แต่ยังไม่ได้เชื่อมต่อระบบสมาชิก";
    $("#ask-ai-button").disabled = true;
    return;
  }
  link.textContent = user.name || user.username || "บัญชีของฉัน";
  link.href = "#question-title";
  action.textContent = "ออกจากระบบ";
  action.href = "#question-title";
  $("#account-title").textContent = user.must_change_password ? "กรุณาเปลี่ยนรหัสผ่านก่อน" : user.ai_enabled ? `พร้อมอ่านไพ่ให้ ${user.name || user.username}` : "บัญชีนี้ยังรอสิทธิ์ AI";
  $("#account-message").textContent = user.must_change_password ? "รหัสผ่านชั่วคราวต้องเปลี่ยนที่หน้าเข้าใช้งานก่อน จึงจะใช้ AI ได้" : user.ai_enabled ? "พิมพ์คำถาม แล้วกดส่งให้ AI เชื่อมคำบนไพ่กับเรื่องของคุณ" : "บัญชีเข้าใช้งานแล้ว แต่ผู้ดูแลยังไม่ได้เปิดสิทธิ์ AI ให้บัญชีนี้";
  $("#ask-ai-button").disabled = !user.ai_enabled || Boolean(user.must_change_password) || !state.drawn.length || !$("#ai-question").value.trim();
}

async function loadServerReadingForSpread() {
  if (!state.user?.ai_enabled || !state.drawn.length) return;
  const data = await api("/api/ai/readings");
  const match = (data.readings || []).find((reading) => JSON.stringify(reading.cards) === JSON.stringify(state.drawn) && reading.status === "active");
  if (!match) return;
  const detail = await api(`/api/ai/readings/${encodeURIComponent(match.id)}`);
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
}

function syncQuestion() {
  const hasQuestion = $("#ai-question").value.trim().length > 0;
  const button = $("#ask-ai-button");
  button.disabled = state.busy || !state.user?.ai_enabled || Boolean(state.user?.must_change_password) || !state.drawn.length || !hasQuestion;
  if (!state.drawn.length) $("#request-status").textContent = "เปิดไพ่ก่อน แล้วพิมพ์คำถามได้เลย";
  else if (!state.user) $("#request-status").textContent = "เปิดไพ่แล้ว พิมพ์คำถามได้เลย — เข้าใช้งานเมื่ออยากให้ AI ตอบ";
  else if (state.user.must_change_password) $("#request-status").textContent = "เปลี่ยนรหัสผ่านก่อนจึงจะถาม AI ได้";
  else if (!state.user.ai_enabled) $("#request-status").textContent = "บัญชีนี้ยังไม่ได้รับสิทธิ์ AI จากผู้ดูแล";
  else if (!state.busy && !$("#ai-answer").childElementCount) $("#request-status").textContent = hasQuestion ? "พร้อมเชื่อมคำบนไพ่กับคำถามของคุณ" : "พิมพ์คำถาม แล้วกดถาม AI Tarot Reader";
}

function renderAnswer(answer) {
  const box = $("#ai-answer");
  box.replaceChildren();
  String(answer).split(/\n{2,}|\n/).map((line) => line.trim()).filter(Boolean).forEach((line, index) => { const paragraph = document.createElement("p"); paragraph.className = "answer-line"; paragraph.style.setProperty("--answer-delay", `${index * 110}ms`); paragraph.textContent = line; box.append(paragraph); });
}

async function ensureReading() {
  if (state.readingId) return;
  const data = await api("/api/ai/readings", { method: "POST", headers: { "X-CSRF-Token": state.csrf }, body: JSON.stringify({ cards: state.drawn, title: "คำถามจากชุดไพ่" }) });
  state.readingId = data.reading?.id || "";
  state.memory = data.reading || null;
  if (!state.readingId) throw new Error("สร้างชุดไพ่สำหรับ Memory ไม่สำเร็จ");
}

async function askAi() {
  if (!state.user?.ai_enabled || state.user.must_change_password || !state.drawn.length) return syncQuestion();
  const question = $("#ai-question").value.trim() || state.failedQuestion;
  if (!question || state.busy) return syncQuestion();
  const version = ++state.requestVersion;
  state.busy = true;
  $("#ask-ai-button").disabled = true;
  $("#request-status").textContent = "กำลังอ่านคำบนไพ่และเชื่อมโยงกับคำถาม...";
  try {
    await ensureReading();
    const data = await api(`/api/ai/readings/${encodeURIComponent(state.readingId)}/messages`, { method: "POST", headers: { "X-CSRF-Token": state.csrf }, body: JSON.stringify({ question }) });
    if (version !== state.requestVersion) return;
    state.memory = data.reading || state.memory;
    renderAnswer(String(data.answer || "").trim());
    renderMemory();
    $("#ai-question").value = "";
    state.failedQuestion = "";
    $("#retry-ai-button").hidden = true;
    $("#ai-answer-title")?.focus?.({ preventScroll: false });
    $("#request-status").textContent = "คำตอบนี้เป็นแนวทางสะท้อนความคิด คุณเป็นคนตัดสินใจเองเสมอ";
  } catch (error) {
    if (error.status === 401 || error.code === "ACCOUNT_AUTH_REQUIRED") { setAccount(null); clearPrivateMemory(); $("#request-status").textContent = "เซสชันหมดอายุ กรุณาเข้าใช้งานใหม่"; }
    else { state.failedQuestion = question; $("#retry-ai-button").hidden = !["AI_TIMEOUT", "AI_UPSTREAM_ERROR", "EMPTY_AI_RESPONSE", "OFFLINE"].includes(error.code); $("#request-status").textContent = messageForError(error.code, error.requestId); }
  } finally { if (version === state.requestVersion) { state.busy = false; syncQuestion(); } }
}

$("#draw-button").addEventListener("click", drawCards);
$("#reset-button").addEventListener("click", resetCards);
$("#new-reading-button").addEventListener("click", resetCards);
choiceButtons.forEach((button) => button.addEventListener("click", () => setCount(Number(button.dataset.count))));
$("#ai-question").addEventListener("input", syncQuestion);
$("#ask-ai-button").addEventListener("click", askAi);
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
