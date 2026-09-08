// src/clickupApi.js — frontend client, same style as src/hubspotApi.js
const API_BASE = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `Request failed (${res.status})`);
  return data;
}

export const getClickUpStatus = () => request("/api/clickup/status");
export const pollClickUp = () => request("/api/clickup/poll", { method: "POST" });
export const getIncomingProjects = (status = "pending") =>
  request(`/api/clickup/incoming${status ? `?status=${encodeURIComponent(status)}` : ""}`);
export const acceptProject = (id) =>
  request(`/api/clickup/incoming/${encodeURIComponent(id)}/accept`, { method: "POST", body: JSON.stringify({}) });
export const dismissProject = (id) =>
  request(`/api/clickup/incoming/${encodeURIComponent(id)}/dismiss`, { method: "POST", body: JSON.stringify({}) });
