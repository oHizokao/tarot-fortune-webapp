import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_TAROT_PROMPT, resolveTarotPrompt } from "../lib/vercel/settings.mjs";
import { composeTarotInstructions } from "../api/ai/tarot-chat.mjs";

test("tarot settings keep the original prompt when no custom prompt is saved", () => {
  assert.equal(resolveTarotPrompt("", ""), DEFAULT_TAROT_PROMPT);
  assert.match(DEFAULT_TAROT_PROMPT, /AI Tarot Reader/);
  assert.match(DEFAULT_TAROT_PROMPT, /คำบนไพ่/);
});

test("tarot settings prefer a saved prompt and fall back to the environment prompt", () => {
  assert.equal(resolveTarotPrompt("ช่วยอ่านแบบกระชับ", "ตั้งค่าจาก env"), "ช่วยอ่านแบบกระชับ");
  assert.equal(resolveTarotPrompt("", "ตั้งค่าจาก env"), "ตั้งค่าจาก env");
});

test("custom reading prompt never removes the permanent safety guardrails", () => {
  const instructions = composeTarotInstructions("ตอบสั้น ๆ และเชื่อมกับคำถามของผู้ใช้");

  assert.match(instructions, /ตอบสั้น ๆ และเชื่อมกับคำถามของผู้ใช้/);
  assert.match(instructions, /ห้ามทำให้ผู้ใช้หวาดกลัว/);
  assert.match(instructions, /ผู้ใช้เป็นคนตัดสินใจเอง/);
});
