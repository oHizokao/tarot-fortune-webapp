const state = { csrf: "", accessCode: "" };
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
  try { return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(`${value.replace(" ", "T")}Z`)); } catch { return value; }
}

function toggleDashboard(show) {
  $("#admin-login-card").hidden = show;
  $("#admin-dashboard").hidden = !show;
}

async function loadSettings() {
  const data = await api("/api/admin/settings");
  $("#openai-model").value = data.model || "";
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

function renderUsers(users) {
  const body = $("#users-table-body");
  body.replaceChildren();
  users.forEach((user) => {
    const row = document.createElement("tr");
    const identity = document.createElement("td");
    identity.textContent = user.name;
    const email = document.createElement("small");
    email.textContent = user.email;
    identity.append(email);
    const status = document.createElement("td");
    status.textContent = user.status === "active" ? "ใช้งาน" : user.status === "suspended" ? "ระงับ" : "หมดอายุ";
    const expiry = document.createElement("td");
    expiry.textContent = formatDate(user.access_expires_at);
    const actions = document.createElement("td");
    const actionWrap = document.createElement("div");
    actionWrap.className = "table-actions";
    actionWrap.append(actionButton("+24 ชม.", "extend", user.id, false, "24h"));
    actionWrap.append(actionButton(user.status === "suspended" ? "เปิดใช้งาน" : "ระงับ", user.status === "suspended" ? "reactivate" : "suspend", user.id));
    actionWrap.append(actionButton("สร้าง Code ใหม่", "generate_code", user.id));
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
  } catch (error) {
    showStatus($("#users-status"), error.message, true);
  }
}

$("#admin-login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = $("#admin-login-status");
  try {
    const data = await api("/api/admin/login", { method: "POST", body: JSON.stringify({ email: $("#admin-email").value.trim(), password: $("#admin-password").value }) });
    state.csrf = data.csrf_token || "";
    $("#admin-welcome").textContent = `เข้าสู่ระบบในชื่อ ${data.user?.name || "Admin"}`;
    toggleDashboard(true);
    await refreshAll();
  } catch (error) { showStatus(status, error.message, true); }
});

$("#settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = $("#settings-status");
  try {
    const data = await api("/api/admin/settings", { method: "POST", headers: { "X-CSRF-Token": state.csrf }, body: JSON.stringify({ openai_api_key: $("#openai-api-key").value.trim(), openai_model: $("#openai-model").value.trim(), use_card_images: $("#use-card-images").checked }) });
    $("#openai-api-key").value = "";
    $("#api-status-chip").textContent = data.configured ? "พร้อมใช้งาน" : "ยังไม่ตั้งค่า";
    $("#api-status-chip").classList.toggle("is-ready", Boolean(data.configured));
    showStatus(status, "บันทึก API settings แล้ว");
  } catch (error) { showStatus(status, error.message, true); }
});

$("#create-user-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = $("#create-user-status");
  try {
    const data = await api("/api/admin/create-user", { method: "POST", headers: { "X-CSRF-Token": state.csrf }, body: JSON.stringify({ name: $("#tester-name").value.trim(), email: $("#tester-email").value.trim(), duration: $("#tester-duration").value }) });
    state.accessCode = data.access_code || "";
    $("#new-access-code").textContent = state.accessCode;
    $("#new-code-output").hidden = false;
    $("#create-user-form").reset();
    showStatus(status, "สร้างผู้ใช้แล้ว — คัดลอก Code ให้ผู้ทดสอบตอนนี้");
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
  if (action === "delete" && !window.confirm("ลบ Beta user นี้หรือไม่? ประวัติ AI ของผู้ใช้นี้จะถูกลบตามฐานข้อมูล")) return;
  try {
    const data = await api("/api/admin/update-user", { method: "POST", headers: { "X-CSRF-Token": state.csrf }, body: JSON.stringify({ id: Number(button.dataset.id), action, duration: button.dataset.duration || "24h" }) });
    if (data.access_code) { state.accessCode = data.access_code; $("#new-access-code").textContent = state.accessCode; $("#new-code-output").hidden = false; showStatus($("#users-status"), "สร้าง Code ใหม่แล้ว — คัดลอกก่อนปิดหน้านี้"); }
    await refreshAll();
  } catch (error) { showStatus($("#users-status"), error.message, true); }
});

$("#refresh-users-button").addEventListener("click", refreshAll);
$("#admin-logout-button").addEventListener("click", async () => { try { await api("/api/admin/logout", { method: "POST", body: "{}" }); } finally { toggleDashboard(false); } });

$("#bootstrap-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = $("#bootstrap-status");
  try {
    const data = await api("/api/admin/bootstrap", {
      method: "POST",
      body: JSON.stringify({
        setup_secret: $("#bootstrap-secret").value,
        name: $("#bootstrap-name").value.trim(),
        email: $("#bootstrap-email").value.trim(),
        password: $("#bootstrap-password").value,
      }),
    });
    state.csrf = data.csrf_token || "";
    $("#admin-welcome").textContent = "เข้าสู่ระบบในชื่อ " + (data.user?.name || "Admin");
    toggleDashboard(true);
    await refreshAll();
  } catch (error) {
    showStatus(status, error.message, true);
  }
});

(async function boot() {
  try {
    const data = await api("/api/admin/me");
    state.csrf = data.csrf_token || "";
    $("#admin-welcome").textContent = `เข้าสู่ระบบในชื่อ ${data.user?.name || "Admin"}`;
    toggleDashboard(true);
    await refreshAll();
  } catch { toggleDashboard(false); }
})();
