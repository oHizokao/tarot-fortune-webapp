import assert from "node:assert/strict";
import test from "node:test";

test("customer errors are actionable", async () => {
  const { messageForError } = await import("../lib/client/error-copy.js");
  assert.equal(messageForError("DAILY_LIMIT_REACHED"), "วันนี้ใช้สิทธิ์ถาม AI ครบแล้ว กรุณาลองใหม่พรุ่งนี้หรือติดต่อผู้ดูแล");
  assert.equal(messageForError("AI_TIMEOUT"), "AI ใช้เวลานานกว่าปกติ คำถามยังไม่ถูกนับสิทธิ์ กดลองอีกครั้งได้");
});

test("unknown errors never expose upstream response details", async () => {
  const { messageForError } = await import("../lib/client/error-copy.js");
  assert.equal(messageForError("UNKNOWN", "req-123"), "ระบบขัดข้องชั่วคราว กรุณาลองอีกครั้ง · รหัสอ้างอิง req-123");
  assert.doesNotMatch(messageForError("UNKNOWN", "req-123"), /stack|upstream|secret/i);
});
