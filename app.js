const DECK = Array.from(
  { length: 78 },
  (_, index) => `tarot-cards/card-${String(index + 1).padStart(3, "0")}.webp`,
);
const STORAGE_KEY = "tarot-daily-deck-v1";
const MAX_HISTORY = 60;

const state = {
  count: 1,
  drawn: [],
  remaining: [],
  notice: "",
  history: [],
  activeHistoryId: null,
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
const copyButton = document.querySelector("#copy-button");
const copyStatus = document.querySelector("#copy-status");
const historySearch = document.querySelector("#history-search");
const clearHistoryButton = document.querySelector("#clear-history-button");
const historyCount = document.querySelector("#history-count");
const historyStatus = document.querySelector("#history-status");
const historyList = document.querySelector("#history-list");
const historyEmpty = document.querySelector("#history-empty");
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

function loadSavedState() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    if (!saved || !isValidDeckList(saved.remaining)) {
      return null;
    }

    return {
      remaining: saved.remaining,
      drawn: isValidDeckList(saved.drawn) ? saved.drawn.slice(0, 3) : [],
      notice: typeof saved.notice === "string" ? saved.notice : "",
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
  copyButton.disabled = state.drawn.length === 0;
}

function showHistoryEntry(entry) {
  state.activeHistoryId = entry.id;
  state.drawn = [...entry.cards];
  state.notice = "กำลังดูชุดไพ่ก่อนหน้า กดเปิดไพ่เพื่อสุ่มชุดใหม่";
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
  if (state.drawn.length === 0 || copyButton.classList.contains("is-busy")) {
    return;
  }

  copyButton.classList.add("is-busy");
  copyButton.disabled = true;
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
    copyButton.classList.remove("is-busy");
    copyButton.disabled = state.drawn.length === 0;
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
    return;
  }

  cardsGrid.classList.remove("is-empty");
  cardsGrid.replaceChildren(...state.drawn.map(createCard));
  resultCount.textContent = `${state.drawn.length} ใบที่เปิดได้`;
  resultMessage.textContent = state.notice || "ขอให้คำทำนายนี้นำพลังดี ๆ มาให้คุณ";
  updateCopyButton();
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
copyButton.addEventListener("click", copyResultImage);
historySearch.addEventListener("input", renderHistory);
clearHistoryButton.addEventListener("click", clearHistory);

const savedState = loadSavedState();
state.remaining = savedState?.remaining ?? shuffle(DECK);
state.drawn = savedState?.drawn ?? [];
state.notice = savedState?.notice ?? "";
state.history = savedState?.history ?? [];
updateProgress();
renderResult();
renderHistory();
