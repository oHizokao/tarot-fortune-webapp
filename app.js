const DECK = Array.from(
  { length: 78 },
  (_, index) => `tarot-cards/card-${String(index + 1).padStart(3, "0")}.webp`,
);
const STORAGE_KEY = "tarot-daily-deck-v1";

const state = {
  count: 1,
  drawn: [],
  remaining: [],
  notice: "",
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
let drawTimer = null;

function isValidDeckList(list) {
  return (
    Array.isArray(list) &&
    list.length <= DECK.length &&
    new Set(list).size === list.length &&
    list.every((card) => DECK.includes(card))
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

function createCard(fileName, position) {
  const card = document.createElement("article");
  card.className = "result-card";
  card.style.animationDelay = `${position * 110}ms`;
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
    return;
  }

  cardsGrid.classList.remove("is-empty");
  cardsGrid.replaceChildren(...state.drawn.map(createCard));
  resultCount.textContent = `${state.drawn.length} ใบที่เปิดได้`;
  resultMessage.textContent = state.notice || "ขอให้คำทำนายนี้นำพลังดี ๆ มาให้คุณ";
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
  state.notice = "เริ่มสำรับใหม่แล้ว ไพ่ทั้ง 78 ใบพร้อมให้เปิดอีกครั้ง";
  saveState();
  updateProgress();
  renderResult();
}

choiceButtons.forEach((button) => {
  button.addEventListener("click", () => setCount(Number(button.dataset.count)));
});

drawButton.addEventListener("click", drawCards);
resetButton.addEventListener("click", resetCards);

const savedState = loadSavedState();
state.remaining = savedState?.remaining ?? shuffle(DECK);
state.drawn = savedState?.drawn ?? [];
state.notice = savedState?.notice ?? "";
updateProgress();
renderResult();
