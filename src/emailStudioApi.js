const API_BASE = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

function apiUrl(path) {
  return `${API_BASE}${path}`;
}

async function request(path, options = {}) {
  const res = await fetch(apiUrl(path), {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export async function fetchEmailStudioStore(userId) {
  const data = await request(`/api/users/${encodeURIComponent(userId)}/email-studio`);
  return data.store;
}

export async function saveEmailStudioStore(userId, store) {
  return request(`/api/users/${encodeURIComponent(userId)}/email-studio`, {
    method: "PUT",
    body: JSON.stringify({ store }),
  });
}

let persistTimer = null;

export function scheduleEmailStudioCloudSave(userId, store) {
  if (!userId || !store) return;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    saveEmailStudioStore(userId, store).catch(() => {});
  }, 800);
}

export async function logEmailCampaign(payload) {
  return request("/api/email/campaigns", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchEmailCampaigns({ days = 30 } = {}) {
  return request(`/api/email/campaigns?days=${days}`);
}

export async function fetchEmailClients() {
  return request("/api/email/clients");
}

export async function saveEmailClients(clients) {
  return request("/api/email/clients", {
    method: "PUT",
    body: JSON.stringify({ clients }),
  });
}

export async function fetchEmailAutomations() {
  return request("/api/email/automations");
}

export async function createEmailAutomation(payload) {
  return request("/api/email/automations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateEmailAutomation(id, payload) {
  return request(`/api/email/automations/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteEmailAutomation(id) {
  return request(`/api/email/automations/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function runEmailAutomation(id) {
  return request(`/api/email/automations/${encodeURIComponent(id)}/run`, {
    method: "POST",
  });
}

export async function processDueEmailAutomations() {
  return request("/api/email/automations/process-due", { method: "POST" });
}

export async function fetchEmailSendQueue({ status } = {}) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return request(`/api/email/queue${qs}`);
}

export async function patchEmailQueueItem(id, payload) {
  return request(`/api/email/queue/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
