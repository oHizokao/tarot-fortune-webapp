const DECK = Array.from(
  { length: 78 },
  (_, index) => `tarot-cards/card-${String(index + 1).padStart(3, "0")}.webp`,
);

const state = {
  count: 1,
  drawn: [],
};

const choiceButtons = [...document.querySelectorAll(".choice-button")];
const drawButton = document.querySelector("#draw-button");
const resetButton = document.querySelector("#reset-button");
const cardsGrid = document.querySelector("#cards-grid");
const emptyState = document.querySelector("#empty-state");
const resultCount = document.querySelector("#result-count");
const resultMessage = document.querySelector("#result-message");

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
    resultMessage.textContent = "คำทำนายเป็นแนวทาง ใช้หัวใจของคุณตัดสินใจเสมอ";
    return;
  }

  cardsGrid.classList.remove("is-empty");
  cardsGrid.replaceChildren(...state.drawn.map(createCard));
  resultCount.textContent = `${state.drawn.length} ใบที่เปิดได้`;
  resultMessage.textContent = "ขอให้คำทำนายนี้นำพลังดี ๆ มาให้คุณ";
}

function drawCards() {
  drawButton.classList.add("is-busy");
  drawButton.setAttribute("aria-busy", "true");

  window.setTimeout(() => {
    state.drawn = shuffle(DECK).slice(0, state.count);
    renderResult();
    drawButton.classList.remove("is-busy");
    drawButton.removeAttribute("aria-busy");
  }, 260);
}

function resetCards() {
  state.drawn = [];
  renderResult();
}

choiceButtons.forEach((button) => {
  button.addEventListener("click", () => setCount(Number(button.dataset.count)));
});

drawButton.addEventListener("click", drawCards);
resetButton.addEventListener("click", resetCards);
