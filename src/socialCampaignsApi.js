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

export async function fetchSocialCampaigns() {
  return request("/api/social/campaigns");
}

export async function createSocialCampaign(payload) {
  return request("/api/social/campaigns", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateSocialCampaign(id, payload) {
  return request(`/api/social/campaigns/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteSocialCampaign(id) {
  return request(`/api/social/campaigns/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
