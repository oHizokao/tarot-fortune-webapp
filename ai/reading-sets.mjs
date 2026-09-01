const CARD_FILE_PATTERN = /^card-(\d{3})\.webp$/;
const DECK_SIZE = 78;
const MAX_SET_SIZE = 3;

function isCardFile(value) {
  const match = String(value || "").match(CARD_FILE_PATTERN);
  if (!match) return false;
  const cardNumber = Number(match[1]);
  return cardNumber >= 1 && cardNumber <= DECK_SIZE;
}

function normalizeEntry(entry, index) {
  if (!entry || typeof entry !== "object" || !Array.isArray(entry.cards)) return null;
  const cards = entry.cards.map((card) => String(card));
  if (cards.length < 1 || cards.length > MAX_SET_SIZE || new Set(cards).size !== cards.length || !cards.every(isCardFile)) return null;
  const createdAt = Number(entry.createdAt);
  return {
    ...entry,
    id: String(entry.id || `legacy-set-${index + 1}`),
    createdAt: Number.isFinite(createdAt) ? createdAt : 0,
    cards,
  };
}

/**
 * History is stored newest-first. Add a stable chronological set number while
 * keeping that order so the newest set remains closest to the current reveal.
 */
export function groupReadingHistory(history) {
  const validEntries = (Array.isArray(history) ? history : []).map(normalizeEntry).filter(Boolean);
  return validEntries.map((entry, index) => ({
    ...entry,
    setNumber: validEntries.length - index,
    cardCount: entry.cards.length,
  }));
}
