const API_BASE = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

function apiUrl(path) {
  return `${API_BASE}${path}`;
}

async function request(path) {
  const res = await fetch(apiUrl(path), {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export async function fetchMediaOverview({ days = 30, from, to } = {}) {
  const params = new URLSearchParams();
  if (from && to) {
    params.set("from", from);
    params.set("to", to);
  } else {
    params.set("days", String(days));
  }
  return request(`/api/media/overview?${params}`);
}

export async function fetchMediaStatus() {
  return request("/api/media/status");
}
