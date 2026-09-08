// server/clickup.js
//
// ClickUp integration — mirrors server/hubspot.js. OFF by default.
// Enable with CLICKUP_ENABLED=true + CLICKUP_TOKEN + CLICKUP_LIST_ID in .env.
//
// Detects new "projects" (tasks in a ClickUp List) and keeps a local queue of
// incoming items a user can Accept / Dismiss inside the app.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { readJson, writeJson } from "./httpUtils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = "https://api.clickup.com/api/v2"; // auth header = RAW token, no "Bearer"

export const DEFAULT_CLICKUP_DATA_DIR = path.resolve(__dirname, "../data/clickup");

function token() {
  return String(process.env.CLICKUP_TOKEN || "").trim();
}
function listId() {
  return String(process.env.CLICKUP_LIST_ID || "").trim();
}
export function isClickUpConfigured() {
  const enabled = String(process.env.CLICKUP_ENABLED || "").trim().toLowerCase();
  if (!["true", "1", "yes"].includes(enabled)) return false;
  return Boolean(token()) && Boolean(listId());
}

async function clickupFetch(pathname, options = {}) {
  const res = await fetch(`${API}${pathname}`, {
    ...options,
    headers: { Authorization: token(), "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 429) {
    const err = new Error("ClickUp rate limit hit (429)");
    err.rateLimited = true;
    throw err;
  }
  if (!res.ok) {
    const msg = data.err || data.error || res.statusText;
    throw new Error(typeof msg === "string" ? msg : `ClickUp error (${res.status})`);
  }
  return data;
}

export async function getTask(taskId) {
  return clickupFetch(`/task/${encodeURIComponent(taskId)}`);
}

// ---- local queue storage --------------------------------------------------
function storePath(dataDir) {
  return path.join(dataDir, "incoming.json");
}
function loadStore(dataDir) {
  return readJson(storePath(dataDir), { projects: [], lastCreatedAt: 0 });
}
function saveStore(dataDir, store) {
  writeJson(storePath(dataDir), store);
}

export function listIncoming(dataDir, { status } = {}) {
  const store = loadStore(dataDir);
  const rows = Array.isArray(store.projects) ? store.projects : [];
  const filtered = status ? rows.filter((r) => r.status === status) : rows;
  return [...filtered].sort((a, b) => (b.clickupCreatedAt || 0) - (a.clickupCreatedAt || 0));
}

export function updateIncoming(dataDir, id, patch) {
  const store = loadStore(dataDir);
  const idx = (store.projects || []).findIndex((p) => p.id === id);
  if (idx < 0) return null;
  store.projects[idx] = { ...store.projects[idx], ...patch, updatedAt: new Date().toISOString() };
  saveStore(dataDir, store);
  return store.projects[idx];
}

// ---- polling --------------------------------------------------------------
export async function pollClickUp(dataDir) {
  if (!isClickUpConfigured()) return { added: 0, total: 0, skipped: "not_configured" };
  const store = loadStore(dataDir);
  const since = Number(store.lastCreatedAt || 0);

  const qs = new URLSearchParams({
    order_by: "created",
    reverse: "false",
    include_closed: "true",
    ...(since ? { date_created_gt: String(since) } : {}),
  });
  const data = await clickupFetch(`/list/${encodeURIComponent(listId())}/task?${qs.toString()}`);
  const tasks = Array.isArray(data.tasks) ? data.tasks : [];

  const known = new Set((store.projects || []).map((p) => p.id));
  let added = 0;
  let maxCreated = since;

  for (const t of tasks) {
    const createdAt = Number(t.date_created || 0);
    if (createdAt > maxCreated) maxCreated = createdAt;
    if (known.has(t.id)) continue;
    store.projects.push({
      id: t.id,
      name: t.name || "Untitled project",
      url: t.url || null,
      clickupCreatedAt: createdAt,
      clickupStatus: t.status?.status || null,
      customFields: Array.isArray(t.custom_fields) ? t.custom_fields : [],
      status: "pending",
      seenAt: new Date().toISOString(),
      acceptedBy: null,
      acceptedAt: null,
      proposalId: null,
    });
    added += 1;
  }

  store.lastCreatedAt = maxCreated;
  saveStore(dataDir, store);
  return { added, total: store.projects.length };
}

export function startClickUpPolling(dataDir, { intervalMs = 60_000 } = {}) {
  if (!isClickUpConfigured()) return () => {};
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      const { added } = await pollClickUp(dataDir);
      if (added) console.log(`[clickup] ${added} new project(s) queued`);
    } catch (err) {
      if (err.rateLimited) console.warn("[clickup] rate limited, retrying next tick");
      else console.warn("[clickup] poll failed:", err.message);
    }
  };
  tick();
  const handle = setInterval(tick, intervalMs);
  return () => {
    stopped = true;
    clearInterval(handle);
  };
}
