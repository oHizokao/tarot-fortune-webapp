import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { DEFAULT_OPENAI_MODEL, DEFAULT_TAROT_PROMPT, TAROT_ANSWER_SCHEMA, TAROT_RESPONSE_FORMAT, resolveOpenAiModel, resolveTarotPrompt } from "../lib/vercel/settings.mjs";
import { composeTarotInstructions, parseTarotAnswer } from "../lib/vercel/openai.mjs";

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
  assert.match(instructions, /อ่านจากคำที่พิมพ์อยู่บนไพ่/);
  assert.match(instructions, /ห้ามสร้างชื่อไพ่/);
});

test("default tarot prompt explains how to handle follow-up memory", () => {
  assert.match(DEFAULT_TAROT_PROMPT, /บริบทการสนทนาก่อนหน้า/);
  assert.match(DEFAULT_TAROT_PROMPT, /คำถามตั้งต้น/);
  assert.match(DEFAULT_TAROT_PROMPT, /ไพ่ชุดเดิม/);
});

test("tarot instructions require a professional card-by-card answer format", () => {
  const instructions = composeTarotInstructions("ตอบด้วยน้ำเสียงอบอุ่น");

  assert.match(instructions, /ไพ่ใบที่/);
  assert.match(instructions, /ความหมายของไพ่/);
  assert.match(instructions, /คำทำนาย/);
  assert.doesNotMatch(instructions, /เชื่อมโยงกับคำถาม:/);
  assert.match(instructions, /สรุปคำตอบ/);
  assert.doesNotMatch(instructions, /คำแนะนำถัดไป:/);
  assert.match(instructions, /ห้ามใช้ Markdown/);
});

test("tarot instructions keep the current question as the answer anchor", () => {
  assert.match(DEFAULT_TAROT_PROMPT, /คำถามปัจจุบัน.*แกนหลัก/);
  assert.match(DEFAULT_TAROT_PROMPT, /ห้ามเปลี่ยนประเด็น/);
  assert.match(DEFAULT_TAROT_PROMPT, /ตอบคำถามปัจจุบันโดยตรง/);
  assert.match(TAROT_RESPONSE_FORMAT, /สรุปคำตอบ.*ตอบคำถามปัจจุบันโดยตรง/);
});

test("tarot output requires a direct verdict and structured card readings", () => {
  assert.match(DEFAULT_TAROT_PROMPT, /คำฟันธง/);
  assert.match(DEFAULT_TAROT_PROMPT, /ไม่เปลี่ยนคำทำนายให้เป็นคำแนะนำทั่วไป/);
  assert.match(TAROT_RESPONSE_FORMAT, /คำฟันธง/);
  assert.match(TAROT_RESPONSE_FORMAT, /คำทำนายโดยรวม/);
  assert.deepEqual(TAROT_ANSWER_SCHEMA.required, ["verdict", "cards", "overall_prediction", "safety_note"]);
  assert.equal(TAROT_ANSWER_SCHEMA.properties.cards.items.required.includes("prediction"), true);
});

test("parseTarotAnswer normalizes a direct tarot response and rejects missing verdicts", () => {
  const parsed = parseTarotAnswer(JSON.stringify({
    verdict: "ควรเดินหน้าต่อ",
    cards: [{ position: 1, name: "Growth", meaning: "การเติบโต", prediction: "เริ่มจากงานที่เปิดทางให้งานอื่น" }],
    overall_prediction: "คำทำนายโดยรวมคือให้ลงมือกับงานหลักก่อน",
    safety_note: "",
  }));
  assert.equal(parsed.verdict, "ควรเดินหน้าต่อ");
  assert.equal(parsed.cards[0].prediction, "เริ่มจากงานที่เปิดทางให้งานอื่น");
  assert.equal(parsed.overall_prediction, "คำทำนายโดยรวมคือให้ลงมือกับงานหลักก่อน");
  assert.throws(() => parseTarotAnswer(JSON.stringify({ verdict: "", cards: [], overall_prediction: "", safety_note: "" })), /คำตอบ/);
});

test("admin settings can explicitly reset the saved model to the fallback", async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const source = await fs.readFile(path.join(root, "lib/vercel", "routes", "admin.mjs"), "utf8");
  assert.match(source, /hasModel/);
  assert.match(source, /setPlainSetting\("openai_model", model\)/);
});
