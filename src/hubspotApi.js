const API_BASE = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

function apiUrl(path) {
  return `${API_BASE}${path}`;
}

async function request(path, options = {}) {
  const res = await fetch(apiUrl(path), {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || `Request failed (${res.status})`);
  }
  return data;
}

export async function getHubSpotStatus() {
  return request("/api/hubspot/status");
}

export async function syncHubSpot(accountKey, userEmail) {
  return request(`/api/users/${encodeURIComponent(accountKey)}/hubspot/sync`, {
    method: "POST",
    body: JSON.stringify({ userEmail }),
  });
}

export async function dedupeProposalsCloud(accountKey) {
  return request(`/api/users/${encodeURIComponent(accountKey)}/proposals/dedupe`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}
