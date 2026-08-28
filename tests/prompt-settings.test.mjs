import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_OPENAI_MODEL, DEFAULT_TAROT_PROMPT, resolveOpenAiModel, resolveTarotPrompt } from "../lib/vercel/settings.mjs";
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

test("OpenAI settings default to Luna when no model is configured", () => {
  assert.equal(DEFAULT_OPENAI_MODEL, "gpt-5.6-luna");
  assert.equal(resolveOpenAiModel("", ""), DEFAULT_OPENAI_MODEL);
  assert.equal(resolveOpenAiModel("gpt-custom", "gpt-from-env"), "gpt-custom");
  assert.equal(resolveOpenAiModel("", "gpt-from-env"), "gpt-from-env");
});

test("custom reading prompt never removes the permanent safety guardrails", () => {
  const instructions = composeTarotInstructions("ตอบสั้น ๆ และเชื่อมกับคำถามของผู้ใช้");

  assert.match(instructions, /ตอบสั้น ๆ และเชื่อมกับคำถามของผู้ใช้/);
  assert.match(instructions, /ห้ามทำให้ผู้ใช้หวาดกลัว/);
  assert.match(instructions, /ผู้ใช้เป็นคนตัดสินใจเอง/);
});

test("default tarot prompt explains how to handle follow-up memory", () => {
  assert.match(DEFAULT_TAROT_PROMPT, /บริบทการสนทนาก่อนหน้า/);
  assert.match(DEFAULT_TAROT_PROMPT, /คำถามตั้งต้น/);
  assert.match(DEFAULT_TAROT_PROMPT, /ไพ่ชุดเดิม/);
});
