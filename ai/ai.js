const DECK = Array.from({ length: 78 }, (_, index) => `card-${String(index + 1).padStart(3, "0")}.webp`);
const STORAGE_KEY = "tarot-daily-deck-v1";
const MAX_HISTORY = 60;
const state = { count: 1, drawn: [], remaining: [], history: [], user: null, csrf: "", backend: true, busy: false, requestVersion: 0, conversation: [] };
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

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !isValidCards(saved.remaining)) return { remaining: shuffle(DECK), drawn: [], history: [] };
    return { remaining: saved.remaining, drawn: isValidCards(saved.drawn) ? saved.drawn.slice(0, 3) : [], history: Array.isArray(saved.history) ? saved.history.slice(0, MAX_HISTORY) : [] };
  } catch { return { remaining: shuffle(DECK), drawn: [], history: [] }; }
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
  syncQuestion();
}

function clearAnswer() { state.conversation = []; $("#ai-answer").replaceChildren(); }

function drawCards() {
  if ($("#draw-button").disabled) return;
  state.busy = true;
  renderProgress();
  $("#draw-button").classList.add("is-busy");
  drawTimer = window.setTimeout(() => {
    const amount = Math.min(state.count, state.remaining.length);
    state.drawn = state.remaining.splice(0, amount);
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

function resetCards() {
  if (drawTimer !== null) {
    window.clearTimeout(drawTimer);
    drawTimer = null;
    $("#draw-button").classList.remove("is-busy");
  }
  state.requestVersion += 1;
  state.remaining = shuffle(DECK);
  state.drawn = [];
  state.history = [];
  state.busy = false;
  clearAnswer();
  saveState();
  renderProgress();
  renderCards();
  $("#request-status").textContent = "เริ่มสำรับใหม่แล้ว ไพ่ทั้ง 78 ใบพร้อมให้เปิด";
}

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: "same-origin", ...options, headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) } });
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { throw new Error("เซิร์ฟเวอร์ส่งข้อมูลที่อ่านไม่ได้"); }
  if (!response.ok || data.ok === false) { const error = new Error(data.message || data.error || "ทำรายการไม่สำเร็จ"); error.code = data.code || "REQUEST_FAILED"; error.status = response.status; throw error; }
  return data;
}

function setAccount(user, csrf = "") {
  state.user = user;
  state.csrf = csrf;
  const link = $("#account-link");
  const action = $("#account-action");
  if (!user) {
    link.textContent = "เข้าสู่ระบบ";
    link.href = "../login/?next=/ai/";
    action.textContent = "เข้าสู่ระบบ";
    action.href = "../login/?next=/ai/";
    $("#account-title").textContent = "เข้าสู่ระบบเพื่อส่งคำถามให้ AI";
    $("#account-message").textContent = state.backend ? "เปิดไพ่และพิมพ์คำถามได้เลย เมื่อพร้อมให้ AI ตอบให้เข้าสู่ระบบก่อน" : "โหมดเปิดไพ่ฟรีพร้อมใช้งาน แต่ยังไม่ได้เชื่อมต่อระบบสมาชิก";
    $("#ask-ai-button").disabled = true;
    return;
  }
  link.textContent = user.name || user.username || "บัญชีของฉัน";
  link.href = "#question-title";
  action.textContent = "ออกจากระบบ";
  action.href = "#question-title";
  $("#account-title").textContent = user.ai_enabled ? `พร้อมอ่านไพ่ให้ ${user.name || user.username}` : "บัญชีนี้ยังรอสิทธิ์ AI";
  $("#account-message").textContent = user.ai_enabled ? "พิมพ์คำถาม แล้วกดส่งให้ AI เชื่อมคำบนไพ่กับเรื่องของคุณ" : "บัญชีเข้าสู่ระบบแล้ว แต่ผู้ดูแลยังไม่ได้เปิดสิทธิ์ AI ให้บัญชีนี้";
  $("#ask-ai-button").disabled = !user.ai_enabled || !state.drawn.length || !$("#ai-question").value.trim();
}

async function loadSession() {
  try {
    const data = await api("/api/auth/me");
    state.backend = data.backend_configured !== false;
    setAccount(data.authenticated && data.user ? data.user : null, data.csrf_token || "");
  } catch { state.backend = false; setAccount(null); }
  syncQuestion();
}

function syncQuestion() {
  const hasQuestion = $("#ai-question").value.trim().length > 0;
  const button = $("#ask-ai-button");
  button.disabled = state.busy || !state.user?.ai_enabled || !state.drawn.length || !hasQuestion;
  if (!state.drawn.length) $("#request-status").textContent = "เปิดไพ่ก่อน แล้วพิมพ์คำถามได้เลย";
  else if (!state.user) $("#request-status").textContent = "เปิดไพ่แล้ว พิมพ์คำถามได้เลย — เข้าสู่ระบบเมื่ออยากให้ AI ตอบ";
  else if (!state.user.ai_enabled) $("#request-status").textContent = "บัญชีนี้ยังไม่ได้รับสิทธิ์ AI จากผู้ดูแล";
  else if (!state.busy && !$("#ai-answer").childElementCount) $("#request-status").textContent = hasQuestion ? "พร้อมเชื่อมคำบนไพ่กับคำถามของคุณ" : "พิมพ์คำถาม แล้วกดถาม AI Tarot Reader";
}

function renderAnswer(answer) {
  const box = $("#ai-answer");
  box.replaceChildren();
  String(answer).split(/\n{2,}|\n/).map((line) => line.trim()).filter(Boolean).forEach((line, index) => { const paragraph = document.createElement("p"); paragraph.className = "answer-line"; paragraph.style.setProperty("--answer-delay", `${index * 110}ms`); paragraph.textContent = line; box.append(paragraph); });
}

async function askAi() {
  if (!state.user?.ai_enabled || !state.drawn.length) return syncQuestion();
  const question = $("#ai-question").value.trim();
  if (!question) return syncQuestion();
  const version = ++state.requestVersion;
  state.busy = true;
  $("#ask-ai-button").disabled = true;
  $("#request-status").textContent = "กำลังอ่านคำบนไพ่และเชื่อมโยงกับคำถาม...";
  try {
    const data = await api("/api/ai/tarot-chat", { method: "POST", headers: { "X-CSRF-Token": state.csrf }, body: JSON.stringify({ question, cards: state.drawn, conversation: state.conversation.slice(-4) }) });
    if (version !== state.requestVersion) return;
    const answer = String(data.answer || data.output_text || "").trim();
    if (!answer) throw new Error("AI ไม่ได้ส่งคำตอบกลับมา ลองถามอีกครั้ง");
    state.conversation.push({ role: "user", content: question }, { role: "assistant", content: answer });
    renderAnswer(answer);
    $("#request-status").textContent = "คำตอบนี้เป็นแนวทางสะท้อนความคิด คุณเป็นคนตัดสินใจเองเสมอ";
  } catch (error) {
    if (error.status === 401 || error.code === "ACCOUNT_AUTH_REQUIRED") { setAccount(null); $("#request-status").textContent = "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่"; }
    else $("#request-status").textContent = error.message || "ระบบยังตอบไม่ได้ ลองใหม่อีกครั้ง";
  } finally { if (version === state.requestVersion) { state.busy = false; syncQuestion(); } }
}

$("#draw-button").addEventListener("click", drawCards);
$("#reset-button").addEventListener("click", resetCards);
choiceButtons.forEach((button) => button.addEventListener("click", () => setCount(Number(button.dataset.count))));
$("#ai-question").addEventListener("input", syncQuestion);
$("#ask-ai-button").addEventListener("click", askAi);
$("#account-action").addEventListener("click", async (event) => {
  if (!state.user) return;
  event.preventDefault();
  try { await api("/api/auth/logout", { method: "POST", body: "{}" }); } catch { /* the local UI can still sign out */ }
  state.requestVersion += 1;
  clearAnswer();
  setAccount(null);
  syncQuestion();
});

Object.assign(state, loadState());
renderProgress();
renderCards();
loadSession();
