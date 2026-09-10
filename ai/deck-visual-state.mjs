const DECK_SIZE = 78;

function normalizeIndexes(value) {
  if (!Array.isArray(value)) return [];
  return value.map((index) => Number(index));
}

function assertSelection(selectedIndexes, cards) {
  if (!Array.isArray(cards) || cards.length < 1 || cards.length > 3) {
    throw new Error("ต้องส่งไพ่ที่เปิด 1–3 ใบ");
  }
  if (!Array.isArray(selectedIndexes) || selectedIndexes.length !== cards.length) {
    throw new Error("ตำแหน่งไพ่ต้องตรงกับจำนวนไพ่ที่เปิด");
  }
  const indexes = normalizeIndexes(selectedIndexes);
  if (indexes.some((index) => !Number.isInteger(index) || index < 0 || index >= DECK_SIZE)) {
    throw new Error("ตำแหน่งไพ่ต้องอยู่ระหว่าง 0–77");
  }
  if (new Set(indexes).size !== indexes.length) {
    throw new Error("ตำแหน่งไพ่ต้องไม่ซ้ำกัน");
  }
  return indexes;
}

function normalizeState(value) {
  return {
    sessionKey: String(value?.sessionKey || ""),
    usedIndexes: [...new Set(normalizeIndexes(value?.usedIndexes))].sort((a, b) => a - b),
    rounds: Array.isArray(value?.rounds) ? value.rounds.map((round) => ({
      requestId: String(round?.requestId || ""),
      roundId: String(round?.roundId || ""),
      selectedIndexes: [...normalizeIndexes(round?.selectedIndexes)].sort((a, b) => a - b),
      cards: Array.isArray(round?.cards) ? [...round.cards] : [],
    })) : [],
  };
}

export function commitVisualRound(value, payload) {
  const state = normalizeState(value);
  const requestId = String(payload?.requestId || "");
  const roundId = String(payload?.roundId || "");
  const selectedIndexes = assertSelection(payload?.selectedIndexes, payload?.cards);
  if (!requestId || !roundId) throw new Error("ต้องมีรหัสคำขอและรหัสรอบไพ่");

  if (state.rounds.some((round) => round.requestId === requestId || round.roundId === roundId)) {
    return state;
  }

  const used = new Set(state.usedIndexes);
  if (selectedIndexes.some((index) => used.has(index))) {
    throw new Error("ตำแหน่งไพ่ถูกเปิดไปแล้ว");
  }

  return {
    ...state,
    usedIndexes: [...used, ...selectedIndexes].sort((a, b) => a - b),
    rounds: [...state.rounds, {
      requestId,
      roundId,
      selectedIndexes: [...selectedIndexes],
      cards: [...payload.cards],
    }],
  };
}

export function isValidVisualState(value) {
  const state = normalizeState(value);
  return state.usedIndexes.every((index) => Number.isInteger(index) && index >= 0 && index < DECK_SIZE)
    && new Set(state.usedIndexes).size === state.usedIndexes.length
    && state.rounds.every((round) => {
      try {
        assertSelection(round.selectedIndexes, round.cards);
        return true;
      } catch {
        return false;
      }
    });
}
