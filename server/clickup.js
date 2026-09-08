// server/clickup.js
//
// ClickUp integration — mirrors server/hubspot.js. OFF by default.
// Enable with CLICKUP_ENABLED=true + CLICKUP_TOKEN + CLICKUP_LIST_ID in .env.
//
// Detects new "projects" (tasks in a ClickUp List) and keeps a local queue of
// incoming items a user can Accept / Dismiss inside the app.

import path from "path";
import { fileURLToPath } from "url";
import { readJson, writeJson } from "./httpUtils.js";
import {
  findCustomField,
  readCustomFieldValue,
  extractPeopleFromField,
  ownerFieldName,
} from "./clickupProposalSeed.js";
import { isAdminUser } from "../shared/roles.js";

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

export const OWNER_BLOCK_MESSAGE =
  "Please contact an admin or update the Deal Owner in ClickUp.";

function normalizePerson(value) {
  return String(value || "").trim().toLowerCase();
}

export function extractTags(task) {
  return (Array.isArray(task?.tags) ? task.tags : [])
    .map((tag) => ({
      name: String(tag?.name || "").trim(),
      fg: tag?.tag_fg || null,
      bg: tag?.tag_bg || null,
    }))
    .filter((tag) => tag.name);
}

export function summarizeClickUpTask(task) {
  const fields = Array.isArray(task?.custom_fields) ? task.custom_fields : [];
  const ownerCf = findCustomField(fields, ownerFieldName());
  const sizeCf =
    findCustomField(fields, "Project Size (KW)") ||
    findCustomField(fields, "System Size (KW)") ||
    findCustomField(fields, "System Size");
  const typeCf = findCustomField(fields, "Project Type");
  const sizeVal = readCustomFieldValue(sizeCf);
  return {
    name: task?.name || "Untitled project",
    url: task?.url || null,
    clickupCreatedAt: Number(task?.date_created || 0),
    clickupStatus: task?.status?.status || null,
    customFields: fields,
    owners: extractPeopleFromField(ownerCf),
    tags: extractTags(task),
    projectType: readCustomFieldValue(typeCf) || null,
    systemSizeKw: sizeVal == null || sizeVal === "" ? null : String(sizeVal),
  };
}

export function ownersFromProject(project) {
  if (Array.isArray(project?.owners)) return project.owners;
  const ownerCf = findCustomField(project?.customFields, ownerFieldName());
  return extractPeopleFromField(ownerCf);
}

export function cardFieldsFromProject(project) {
  const fields = project?.customFields || [];
  const sizeCf =
    findCustomField(fields, "Project Size (KW)") ||
    findCustomField(fields, "System Size (KW)") ||
    findCustomField(fields, "System Size");
  const typeCf = findCustomField(fields, "Project Type");
  const sizeVal = project?.systemSizeKw ?? readCustomFieldValue(sizeCf);
  return {
    owners: ownersFromProject(project),
    tags: Array.isArray(project?.tags) ? project.tags : [],
    projectType: project?.projectType || readCustomFieldValue(typeCf) || null,
    systemSizeKw: sizeVal == null || sizeVal === "" ? null : String(sizeVal),
  };
}

export function userIsClickUpOwner(user, owners) {
  if (!user || !Array.isArray(owners) || owners.length === 0) return false;
  const email = normalizePerson(user.email);
  const name = normalizePerson(user.name);
  const username = normalizePerson(user.username);
  const emailLocal = email.includes("@") ? email.split("@")[0] : email;
  return owners.some((owner) => {
    const ownerEmail = normalizePerson(owner?.email);
    const ownerName = normalizePerson(owner?.username);
    if (email && ownerEmail && email === ownerEmail) return true;
    if (name && ownerName && name === ownerName) return true;
    if (username && ownerName && username === ownerName) return true;
    if (emailLocal && ownerName && emailLocal === ownerName) return true;
    return false;
  });
}

export function canUserTakeProject(user, owners) {
  if (isAdminUser(user)) return true;
  return userIsClickUpOwner(user, owners);
}

export function canUserDismissIncoming(user) {
  return isAdminUser(user);
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
  if (!Array.isArray(store.projects)) store.projects = [];

  const qs = new URLSearchParams({
    order_by: "created",
    reverse: "false",
    include_closed: "true",
  });
  const data = await clickupFetch(`/list/${encodeURIComponent(listId())}/task?${qs.toString()}`);
  const tasks = Array.isArray(data.tasks) ? data.tasks : [];

  const byId = new Map(store.projects.map((p) => [p.id, p]));
  let added = 0;
  let maxCreated = Number(store.lastCreatedAt || 0);

  for (const t of tasks) {
    const summary = summarizeClickUpTask(t);
    if (summary.clickupCreatedAt > maxCreated) maxCreated = summary.clickupCreatedAt;
    const existing = byId.get(t.id);
    if (!existing) {
      store.projects.push({
        id: t.id,
        ...summary,
        status: "pending",
        seenAt: new Date().toISOString(),
        acceptedBy: null,
        acceptedAt: null,
        proposalId: null,
      });
      added += 1;
      continue;
    }
    if (existing.status !== "pending") continue;
    existing.name = summary.name;
    existing.url = summary.url;
    existing.clickupCreatedAt = summary.clickupCreatedAt || existing.clickupCreatedAt;
    existing.clickupStatus = summary.clickupStatus;
    existing.customFields = summary.customFields;
    existing.owners = summary.owners;
    existing.tags = summary.tags;
    existing.projectType = summary.projectType;
    existing.systemSizeKw = summary.systemSizeKw;
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
