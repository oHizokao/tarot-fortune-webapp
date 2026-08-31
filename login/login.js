import { messageForError } from "../lib/client/error-copy.js";

const $ = (selector) => document.querySelector(selector);
const state = { busy: false, csrf: "" };

function showStatus(element, message, error = false) {
  element.textContent = message;
  element.classList.toggle("is-error", error);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: { Accept: "application/json", "X-Client-Request-Id": crypto.randomUUID?.() || String(Date.now()), ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) },
  });
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { throw new Error("เซิร์ฟเวอร์ส่งข้อมูลที่อ่านไม่ได้"); }
  if (!response.ok || data.ok === false) {
    const error = new Error(data.message || data.error || "ทำรายการไม่สำเร็จ");
    error.code = data.code || "REQUEST_FAILED";
    error.status = response.status;
    error.requestId = data.request_id || response.headers.get("x-request-id") || "";
    throw error;
  }
  return data;
}

function safeNextPath() {
  const value = new URLSearchParams(window.location.search).get("next") || "/ai/";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/ai/";
}

function setMode(mode) {
  const login = mode === "login";
  $("#login-tab").classList.toggle("is-active", login);
  $("#signup-tab").classList.toggle("is-active", !login);
  $("#login-tab").setAttribute("aria-selected", String(login));
  $("#signup-tab").setAttribute("aria-selected", String(!login));
  $("#login-panel").hidden = !login;
  $("#signup-panel").hidden = login;
  $("#auth-subtitle").textContent = login ? "ใช้ username และรหัสผ่านเพื่อเข้าใช้งาน" : "สร้างบัญชีเพื่อขอสิทธิ์ห้องถาม AI";
}

function redirectForUser() {
  window.location.assign(safeNextPath());
}

function showChangePassword(user, csrf) {
  state.csrf = csrf || state.csrf;
  $("#login-panel").hidden = true;
  $("#signup-panel").hidden = true;
  $("#change-password-panel").hidden = false;
  $("#auth-title").textContent = "ตั้งรหัสผ่านใหม่ก่อนใช้งาน";
  $("#auth-subtitle").textContent = `บัญชี ${user?.name || user?.username || "ของคุณ"} ต้องเปลี่ยนรหัสผ่าน`;
  $("#current-password").focus();
}

$("#login-tab").addEventListener("click", () => setMode("login"));
$("#signup-tab").addEventListener("click", () => setMode("signup"));

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.busy) return;
  state.busy = true;
  const status = $("#login-status");
  showStatus(status, "กำลังตรวจสอบบัญชี...");
  try {
    const data = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ username: $("#login-username").value.trim(), password: $("#login-password").value }) });
    state.csrf = data.csrf_token || "";
    if (data.user?.must_change_password) showChangePassword(data.user, state.csrf);
    else { showStatus(status, "เข้าใช้งานสำเร็จ กำลังพาไปห้องอ่านไพ่..."); redirectForUser(); }
  } catch (error) {
    showStatus(status, messageForError(error.code, error.requestId), true);
  } finally {
    state.busy = false;
  }
});

$("#change-password-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.busy) return;
  if ($("#new-password").value !== $("#new-password-confirm").value) { showStatus($("#change-password-status"), "รหัสผ่านใหม่สองช่องไม่ตรงกัน", true); return; }
  state.busy = true;
  try {
    const data = await api("/api/auth/change-password", { method: "POST", headers: { "X-CSRF-Token": state.csrf }, body: JSON.stringify({ current_password: $("#current-password").value, new_password: $("#new-password").value }) });
    state.csrf = data.csrf_token || state.csrf;
    showStatus($("#change-password-status"), "เปลี่ยนรหัสผ่านแล้ว กำลังพาไปห้องอ่านไพ่...");
    window.setTimeout(redirectForUser, 350);
  } catch (error) { showStatus($("#change-password-status"), error.message || "เปลี่ยนรหัสผ่านไม่สำเร็จ", true); }
  finally { state.busy = false; }
});

$("#signup-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.busy) return;
  const password = $("#signup-password").value;
  if (password !== $("#signup-password-confirm").value) {
    showStatus($("#signup-status"), "รหัสผ่านสองช่องไม่ตรงกัน", true);
    return;
  }
  state.busy = true;
  const status = $("#signup-status");
  showStatus(status, "กำลังสร้างบัญชี...");
  try {
    await api("/api/auth/register", { method: "POST", body: JSON.stringify({ username: $("#signup-username").value.trim(), name: $("#signup-name").value.trim(), email: $("#signup-email").value.trim(), password }) });
    showStatus(status, "สมัครสำเร็จแล้ว รอผู้ดูแลอนุมัติ จากนั้นจึงเข้าใช้งานเพื่อถาม AI ได้");
    $("#login-username").value = $("#signup-username").value.trim();
    $("#signup-form").reset();
    setMode("login");
    showStatus($("#login-status"), "สมัครสำเร็จแล้ว รอผู้ดูแลอนุมัติก่อนเข้าใช้งาน");
  } catch (error) {
    showStatus(status, messageForError(error.code, error.requestId), true);
  } finally {
    state.busy = false;
  }
});

const initialMode = new URLSearchParams(window.location.search).get("mode");
setMode(initialMode === "signup" ? "signup" : "login");

(async function restoreSession() {
  try {
    const data = await api("/api/auth/me");
    if (data.authenticated && data.user?.must_change_password) showChangePassword(data.user, data.csrf_token || "");
  } catch { /* signed-out visitors stay on the normal login form */ }
})();
