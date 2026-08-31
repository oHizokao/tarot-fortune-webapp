const COPY = {
  ACCOUNT_AUTH_REQUIRED: "กรุณาเข้าใช้งานก่อนถาม AI",
  ACCOUNT_PENDING: "บัญชีของคุณกำลังรอผู้ดูแลอนุมัติ",
  ACCOUNT_UNAVAILABLE: "บัญชีนี้ยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแล",
  BETA_ACCESS_EXPIRED: "สิทธิ์ AI ของคุณหมดอายุแล้ว กรุณาติดต่อผู้ดูแล",
  BETA_ACCESS_SUSPENDED: "บัญชีนี้ถูกระงับชั่วคราว กรุณาติดต่อผู้ดูแล",
  AI_ACCESS_REQUIRED: "บัญชีเข้าใช้งานแล้ว แต่ยังไม่ได้รับสิทธิ์ AI",
  PASSWORD_CHANGE_REQUIRED: "กรุณาเปลี่ยนรหัสผ่านก่อนใช้งาน AI",
  CSRF_FAILED: "เซสชันความปลอดภัยเปลี่ยนแล้ว กรุณารีเฟรชหน้าแล้วลองใหม่",
  RATE_LIMITED: "ลองบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่",
  DAILY_LIMIT_REACHED: "วันนี้ใช้สิทธิ์ถาม AI ครบแล้ว กรุณาลองใหม่พรุ่งนี้หรือติดต่อผู้ดูแล",
  AI_TIMEOUT: "AI ใช้เวลานานกว่าปกติ คำถามยังไม่ถูกนับสิทธิ์ กดลองอีกครั้งได้",
  AI_UPSTREAM_ERROR: "AI ยังไม่พร้อมชั่วคราว กดลองใหม่อีกครั้งได้",
  OPENAI_NOT_CONFIGURED: "ระบบ AI ยังไม่ได้ตั้งค่า กรุณาติดต่อผู้ดูแล",
  MODEL_UNAVAILABLE: "โมเดล AI ยังไม่พร้อม กรุณาติดต่อผู้ดูแล",
  INVALID_QUESTION: "พิมพ์คำถามให้ชัดเจนไม่เกิน 2,000 ตัวอักษร",
  READING_CLOSED: "ชุดไพ่นี้ปิดแล้ว กรุณาเปิดชุดใหม่เพื่อถามต่อ",
  OFFLINE: "ดูเหมือนอินเทอร์เน็ตหลุด ตรวจการเชื่อมต่อแล้วลองใหม่",
};

export function messageForError(code, requestId = "") {
  const message = COPY[String(code || "")] || "ระบบขัดข้องชั่วคราว กรุณาลองอีกครั้ง";
  const reference = String(requestId || "").trim();
  return reference && !COPY[String(code || "")] ? `${message} · รหัสอ้างอิง ${reference}` : message;
}
