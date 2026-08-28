const $ = (selector) => document.querySelector(selector);
const state = { busy: false };

function showStatus(element, message, error = false) {
  element.textContent = message;
  element.classList.toggle("is-error", error);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) },
  });
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { throw new Error("เซิร์ฟเวอร์ส่งข้อมูลที่อ่านไม่ได้"); }
  if (!response.ok || data.ok === false) {
    const error = new Error(data.message || data.error || "ทำรายการไม่สำเร็จ");
    error.code = data.code || "REQUEST_FAILED";
    error.status = response.status;
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
  $("#auth-subtitle").textContent = login ? "ใช้ username และรหัสผ่านของคุณ" : "สร้างบัญชีเพื่อขอสิทธิ์ห้องถาม AI";
}

function redirectForUser(user) {
  window.location.assign(user?.role === "admin" ? "/admin/" : safeNextPath());
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
    showStatus(status, "เข้าสู่ระบบแล้ว กำลังพาไปห้องอ่านไพ่...");
    redirectForUser(data.user);
  } catch (error) {
    showStatus(status, error.message || "เข้าสู่ระบบไม่สำเร็จ", true);
  } finally {
    state.busy = false;
  }
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
    showStatus(status, "สมัครสำเร็จแล้ว รอผู้ดูแลอนุมัติ จากนั้นจึงเข้าสู่ระบบเพื่อถาม AI ได้");
    $("#login-username").value = $("#signup-username").value.trim();
    $("#signup-form").reset();
    setMode("login");
    showStatus($("#login-status"), "สมัครสำเร็จแล้ว รอผู้ดูแลอนุมัติก่อนเข้าสู่ระบบ");
  } catch (error) {
    showStatus(status, error.message || "สมัครสมาชิกไม่สำเร็จ", true);
  } finally {
    state.busy = false;
  }
});

const initialMode = new URLSearchParams(window.location.search).get("mode");
setMode(initialMode === "signup" ? "signup" : "login");
