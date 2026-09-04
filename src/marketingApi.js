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

export async function fetchMarketingSettings() {
  return request("/api/marketing/settings");
}

export async function saveMarketingSettings(meetingLinks) {
  return request("/api/marketing/settings", {
    method: "PUT",
    body: JSON.stringify({ meetingLinks }),
  });
}
