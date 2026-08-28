const state = { csrf: "", accessCode: "", defaultPrompt: "" };
const $ = (selector) => document.querySelector(selector);

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
    error.status = response.status;
    error.code = data.code || data.error || "REQUEST_FAILED";
    throw error;
  }
  return data;
}

function formatDate(value) {
  if (!value) return "—";
  try { return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(`${String(value).replace(" ", "T")}Z`)); } catch { return value; }
}

function toggleDashboard(show) {
  $("#admin-landing").hidden = show;
  $("#admin-auth").hidden = show;
  $("#admin-login-card").hidden = show;
  $("#admin-bootstrap-card").hidden = show;
  $("#admin-dashboard").hidden = !show;
}

async function loadSettings() {
  const data = await api("/api/admin/settings");
  $("#openai-model").value = data.model || "";
  state.defaultPrompt = data.default_prompt || "";
  $("#ai-prompt").value = data.prompt || state.defaultPrompt;
  $("#use-card-images").checked = Boolean(data.use_card_images);
  $("#api-status-chip").textContent = data.configured ? "พร้อมใช้งาน" : "ยังไม่ตั้งค่า";
  $("#api-status-chip").classList.toggle("is-ready", Boolean(data.configured));
}

async function loadUsage() {
  const data = await api("/api/admin/usage");
  const stats = data.stats || {};
  $("#stat-users").textContent = stats.active_beta_users ?? "—";
  $("#stat-requests").textContent = stats.total_requests ?? "—";
  $("#stat-success").textContent = stats.successful_requests ?? "—";
  $("#stat-tokens").textContent = Number(stats.input_tokens || 0) + Number(stats.output_tokens || 0);
}

function actionButton(label, action, id, danger = false, duration = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.dataset.action = action;
  button.dataset.id = id;
  if (duration) button.dataset.duration = duration;
  if (danger) button.classList.add("danger");
  return button;
}

function statusLabel(user) {
  if (user.status === "pending") return "รออนุมัติ";
  if (user.status === "suspended") return "ระงับ";
  if (user.status === "expired") return "หมดอายุ";
  return user.ai_enabled ? "ใช้งาน AI" : "สมาชิกทั่วไป";
}

function renderUsers(users) {
  const body = $("#users-table-body");
  body.replaceChildren();
  if (!users.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = "ยังไม่มีสมาชิกหรือ Tester";
    row.append(cell);
    body.append(row);
    return;
  }
  users.forEach((user) => {
    const row = document.createElement("tr");
    const identity = document.createElement("td");
    identity.textContent = `${user.name || "ไม่ระบุชื่อ"} · @${user.username || "—"}`;
    const email = document.createElement("small");
    email.textContent = user.email || "ไม่ได้ใส่อีเมล";
    identity.append(email);
    const status = document.createElement("td");
    status.textContent = `${user.role === "beta_user" ? "Beta" : "สมาชิก"} · ${statusLabel(user)}`;
    const expiry = document.createElement("td");
    expiry.textContent = user.ai_enabled ? formatDate(user.access_expires_at) : "ยังไม่มีสิทธิ์ AI";
    const actions = document.createElement("td");
    const actionWrap = document.createElement("div");
    actionWrap.className = "table-actions";
    if (user.status === "pending") actionWrap.append(actionButton("อนุมัติสมาชิก", "approve", user.id));
    if (user.status === "active" && !user.ai_enabled) actionWrap.append(actionButton("เปิด AI 24 ชม.", "grant_beta", user.id, false, "24h"));
    if (user.status === "active" && user.ai_enabled) {
      actionWrap.append(actionButton("ต่อ AI +24 ชม.", "extend", user.id, false, "24h"));
      actionWrap.append(actionButton("ปิดสิทธิ์ AI", "revoke", user.id));
    }
    if (user.status === "suspended") actionWrap.append(actionButton("เปิดใช้งาน", "reactivate", user.id));
    else if (user.status !== "pending") actionWrap.append(actionButton("ระงับ", "suspend", user.id));
    if (user.role === "beta_user") actionWrap.append(actionButton("สร้าง Code ใหม่", "generate_code", user.id));
    actionWrap.append(actionButton("ลบ", "delete", user.id, true));
    actions.append(actionWrap);
    row.append(identity, status, expiry, actions);
    body.append(row);
  });
}

async function loadUsers() {
  const data = await api("/api/admin/users");
  renderUsers(data.users || []);
}

async function refreshAll() {
  try {
    await Promise.all([loadUsers(), loadUsage(), loadSettings()]);
    showStatus($("#users-status"), "อัปเดตข้อมูลแล้ว");
  } catch (error) { showStatus($("#users-status"), error.message, true); }
}

$("#admin-login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = $("#admin-login-status");
  try {
    const data = await api("/api/admin/login", { method: "POST", body: JSON.stringify({ username: $("#admin-username").value.trim(), password: $("#admin-password").value }) });
    state.csrf = data.csrf_token || "";
    $("#admin-welcome").textContent = `เข้าสู่ระบบในชื่อ ${data.user?.name || data.user?.username || "Admin"}`;
    toggleDashboard(true);
    await refreshAll();
  } catch (error) { showStatus(status, error.message, true); }
});

$("#settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = $("#settings-status");
  try {
    const data = await api("/api/admin/settings", { method: "POST", headers: { "X-CSRF-Token": state.csrf }, body: JSON.stringify({ openai_api_key: $("#openai-api-key").value.trim(), openai_model: $("#openai-model").value.trim(), ai_prompt: $("#ai-prompt").value.trim(), use_card_images: $("#use-card-images").checked }) });
    $("#openai-api-key").value = "";
    state.defaultPrompt = data.default_prompt || state.defaultPrompt;
    $("#ai-prompt").value = data.prompt || state.defaultPrompt;
    $("#api-status-chip").textContent = data.configured ? "พร้อมใช้งาน" : "ยังไม่ตั้งค่า";
    $("#api-status-chip").classList.toggle("is-ready", Boolean(data.configured));
    showStatus(status, "บันทึก API และ Prompt แล้ว");
  } catch (error) { showStatus(status, error.message, true); }
});

const resetPromptButton = $("#reset-prompt-button");
if (resetPromptButton) resetPromptButton.addEventListener("click", () => {
  if (!state.defaultPrompt) return;
  $("#ai-prompt").value = state.defaultPrompt;
  showStatus($("#settings-status"), "คืนค่า Prompt ตั้งต้นแล้ว — กดบันทึกเพื่อใช้งาน");
});

$("#create-user-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = $("#create-user-status");
  try {
    const data = await api("/api/admin/create-user", { method: "POST", headers: { "X-CSRF-Token": state.csrf }, body: JSON.stringify({ username: $("#tester-username").value.trim(), name: $("#tester-name").value.trim(), email: $("#tester-email").value.trim(), duration: $("#tester-duration").value }) });
    state.accessCode = data.access_code || "";
    $("#new-access-code").textContent = state.accessCode;
    $("#new-code-output").hidden = false;
    $("#create-user-form").reset();
    showStatus(status, "สร้าง Beta แล้ว — คัดลอก Code ให้ผู้ทดสอบตอนนี้");
    await refreshAll();
  } catch (error) { showStatus(status, error.message, true); }
});

$("#copy-code-button").addEventListener("click", async () => {
  if (!state.accessCode) return;
  try { await navigator.clipboard.writeText(state.accessCode); showStatus($("#create-user-status"), "คัดลอก Access Code แล้ว"); } catch { showStatus($("#create-user-status"), state.accessCode); }
});

$("#users-table-body").addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (action === "delete" && !window.confirm("ลบผู้ใช้นี้หรือไม่? ประวัติ AI ของผู้ใช้นี้จะถูกลบตามฐานข้อมูล")) return;
  try {
    const data = await api("/api/admin/update-user", { method: "POST", headers: { "X-CSRF-Token": state.csrf }, body: JSON.stringify({ id: Number(button.dataset.id), action, duration: button.dataset.duration || "24h" }) });
    if (data.access_code) { state.accessCode = data.access_code; $("#new-access-code").textContent = data.access_code; $("#new-code-output").hidden = false; showStatus($("#users-status"), "สร้าง Code ใหม่แล้ว — คัดลอกก่อนปิดหน้านี้"); }
    await refreshAll();
  } catch (error) { showStatus($("#users-status"), error.message, true); }
});

$("#refresh-users-button").addEventListener("click", refreshAll);
$("#admin-logout-button").addEventListener("click", async () => { try { await api("/api/admin/logout", { method: "POST", body: "{}" }); } finally { toggleDashboard(false); } });

$("#bootstrap-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = $("#bootstrap-status");
  try {
    const data = await api("/api/admin/bootstrap", { method: "POST", body: JSON.stringify({ setup_secret: $("#bootstrap-secret").value, username: $("#bootstrap-username").value.trim(), name: $("#bootstrap-name").value.trim(), email: $("#bootstrap-email").value.trim(), password: $("#bootstrap-password").value }) });
    state.csrf = data.csrf_token || "";
    $("#admin-welcome").textContent = "เข้าสู่ระบบในชื่อ " + (data.user?.name || data.user?.username || "Admin");
    toggleDashboard(true);
    await refreshAll();
  } catch (error) { showStatus(status, error.message, true); }
});

(async function boot() {
  try {
    const data = await api("/api/admin/me");
    state.csrf = data.csrf_token || "";
    $("#admin-welcome").textContent = `เข้าสู่ระบบในชื่อ ${data.user?.name || data.user?.username || "Admin"}`;
    toggleDashboard(true);
    await refreshAll();
  } catch { toggleDashboard(false); }
})();
