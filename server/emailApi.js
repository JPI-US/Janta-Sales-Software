import fs from "fs";
import path from "path";
import { proposalStorageKey } from "../shared/proposalAccount.js";
import { readJson, writeJson, readBody, send } from "./httpUtils.js";
import { authenticateRequest } from "./auth/sessions.js";
import { DEFAULT_DATA_DIR } from "./proposalsApi.js";
import { normalizeCampaignPosts } from "../shared/campaignPosting.js";
import { isAdminUser } from "../shared/roles.js";

function userDir(dataDir, userId) {
  const safe = String(userId).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safe) throw new Error("Invalid userId");
  return path.join(dataDir, safe);
}

function studioPath(dataDir, userId) {
  return path.join(userDir(dataDir, userId), "email-studio.json");
}

function campaignsPath(dataDir, userId) {
  return path.join(userDir(dataDir, userId), "email-campaigns.json");
}

function clientsPath(dataDir, userId) {
  return path.join(userDir(dataDir, userId), "email-clients.json");
}

function automationsPath(dataDir, userId) {
  return path.join(userDir(dataDir, userId), "email-automations.json");
}

function queuePath(dataDir, userId) {
  return path.join(userDir(dataDir, userId), "email-send-queue.json");
}

function newId(prefix = "") {
  return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadStudioStore(dataDir, userId) {
  return readJson(studioPath(dataDir, userId), { version: 3, folders: [], templates: [], pins: [], collapsed: [], modules: [] });
}

function loadCampaigns(dataDir, userId) {
  const store = readJson(campaignsPath(dataDir, userId), { campaigns: [] });
  return Array.isArray(store.campaigns) ? store.campaigns : [];
}

function saveCampaigns(dataDir, userId, campaigns) {
  writeJson(campaignsPath(dataDir, userId), { campaigns });
}

function loadClients(dataDir, userId) {
  const store = readJson(clientsPath(dataDir, userId), { clients: [] });
  return Array.isArray(store.clients) ? store.clients : [];
}

function saveClients(dataDir, userId, clients) {
  writeJson(clientsPath(dataDir, userId), { clients });
}

function loadAutomations(dataDir, userId) {
  const store = readJson(automationsPath(dataDir, userId), { automations: [] });
  return Array.isArray(store.automations) ? store.automations : [];
}

function saveAutomations(dataDir, userId, automations) {
  writeJson(automationsPath(dataDir, userId), { automations });
}

function loadQueue(dataDir, userId) {
  const store = readJson(queuePath(dataDir, userId), { queue: [] });
  return Array.isArray(store.queue) ? store.queue : [];
}

function saveQueue(dataDir, userId, queue) {
  writeJson(queuePath(dataDir, userId), { queue: queue.slice(0, 2000) });
}

function loadAllCampaigns(dataDir) {
  const root = dataDir || DEFAULT_DATA_DIR;
  if (!fs.existsSync(root)) return [];
  const rows = [];
  for (const dir of fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    const fp = path.join(root, dir.name, "email-campaigns.json");
    if (!fs.existsSync(fp)) continue;
    const store = readJson(fp, { campaigns: [] });
    for (const c of store.campaigns || []) {
      rows.push({ ...c, userId: c.userId || dir.name });
    }
  }
  return rows;
}

function parseTimeHm(value, fallback = "09:00") {
  const m = String(value || fallback).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return { h: 9, min: 0 };
  return { h: Math.min(23, Math.max(0, Number(m[1]))), min: Math.min(59, Math.max(0, Number(m[2]))) };
}

function computeNextRunAt(schedule, fromDate = new Date()) {
  if (!schedule?.enabled) return null;
  const freq = schedule.frequency || "once";
  const { h, min } = parseTimeHm(schedule.time);
  const base = new Date(fromDate);
  base.setSeconds(0, 0);

  if (freq === "once") {
    if (schedule.nextRunAt) {
      const at = new Date(schedule.nextRunAt);
      return Number.isNaN(at.getTime()) ? null : at.toISOString();
    }
    const next = new Date(base);
    next.setHours(h, min, 0, 0);
    if (next.getTime() <= base.getTime()) next.setDate(next.getDate() + 1);
    return next.toISOString();
  }

  const next = new Date(base);
  next.setHours(h, min, 0, 0);
  if (next.getTime() <= base.getTime()) next.setDate(next.getDate() + 1);

  if (freq === "weekly") {
    const target = Number(schedule.weekday);
    const want = Number.isFinite(target) ? ((target % 7) + 7) % 7 : 1;
    let guard = 0;
    while (next.getDay() !== want && guard < 8) {
      next.setDate(next.getDate() + 1);
      guard += 1;
    }
  }

  return next.toISOString();
}

function normalizeAutomation(body = {}, existing = null) {
  const now = new Date().toISOString();
  const schedule = {
    enabled: Boolean(body.schedule?.enabled ?? existing?.schedule?.enabled ?? false),
    frequency: body.schedule?.frequency || existing?.schedule?.frequency || "once",
    time: body.schedule?.time || existing?.schedule?.time || "09:00",
    weekday: Number.isFinite(Number(body.schedule?.weekday))
      ? Number(body.schedule.weekday)
      : (existing?.schedule?.weekday ?? 1),
    nextRunAt: body.schedule?.nextRunAt ?? existing?.schedule?.nextRunAt ?? null,
  };
  if (schedule.enabled && !schedule.nextRunAt) {
    schedule.nextRunAt = computeNextRunAt(schedule);
  }
  return {
    id: existing?.id || newId("auto-"),
    name: String(body.name ?? existing?.name ?? "Untitled campaign").slice(0, 120),
    templateId: body.templateId ?? existing?.templateId ?? null,
    subject: String(body.subject ?? existing?.subject ?? "").slice(0, 200),
    preheader: String(body.preheader ?? existing?.preheader ?? "").slice(0, 200),
    clientIds: Array.isArray(body.clientIds)
      ? body.clientIds.map(String)
      : Array.isArray(existing?.clientIds)
        ? existing.clientIds
        : [],
    status: ["draft", "active", "paused", "completed"].includes(body.status)
      ? body.status
      : existing?.status || "draft",
    schedule,
    posts: normalizeCampaignPosts(body.posts ?? existing?.posts),
    sender: {
      name: String(body.sender?.name ?? existing?.sender?.name ?? "").slice(0, 120),
      title: String(body.sender?.title ?? existing?.sender?.title ?? "").slice(0, 120),
      email: String(body.sender?.email ?? existing?.sender?.email ?? "").slice(0, 200),
      calendarLink: String(body.sender?.calendarLink ?? existing?.sender?.calendarLink ?? "").slice(0, 500),
    },
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    lastRunAt: existing?.lastRunAt || null,
  };
}

function enqueueAutomation(dataDir, userId, automation, clients) {
  const queue = loadQueue(dataDir, userId);
  const clientMap = Object.fromEntries(clients.map((c) => [c.id, c]));
  const pendingKeys = new Set(
    queue.filter((q) => q.status === "pending" && q.automationId === automation.id).map((q) => q.clientId),
  );
  const created = [];
  for (const clientId of automation.clientIds || []) {
    if (pendingKeys.has(clientId)) continue;
    const client = clientMap[clientId];
    if (!client?.email) continue;
    const row = {
      id: newId("q-"),
      automationId: automation.id,
      automationName: automation.name,
      clientId,
      clientEmail: client.email,
      clientName: client.name || client.firstName || client.email,
      company: client.company || "",
      firstName: client.firstName || "",
      subject: automation.subject || "",
      preheader: automation.preheader || "",
      templateId: automation.templateId,
      status: "pending",
      createdAt: new Date().toISOString(),
      sentAt: null,
    };
    queue.unshift(row);
    created.push(row);
  }
  if (created.length) saveQueue(dataDir, userId, queue);
  return created;
}

function processDueAutomations(dataDir, userId) {
  const automations = loadAutomations(dataDir, userId);
  const clients = loadClients(dataDir, userId);
  const now = Date.now();
  let ran = 0;
  const updated = automations.map((auto) => {
    if (auto.status !== "active" || !auto.schedule?.enabled) return auto;
    const dueAt = auto.schedule.nextRunAt ? new Date(auto.schedule.nextRunAt).getTime() : NaN;
    if (!Number.isFinite(dueAt) || dueAt > now) return auto;
    enqueueAutomation(dataDir, userId, auto, clients);
    ran += 1;
    const next = { ...auto, lastRunAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    if (auto.schedule.frequency === "once") {
      next.status = "completed";
      next.schedule = { ...auto.schedule, enabled: false, nextRunAt: null };
    } else {
      next.schedule = {
        ...auto.schedule,
        nextRunAt: computeNextRunAt(auto.schedule, new Date(now + 60000)),
      };
    }
    return next;
  });
  if (ran) saveAutomations(dataDir, userId, updated);
  return { processed: ran, automations: updated };
}

export { loadAllCampaigns };

export function createEmailApiHandler({ dataDir = DEFAULT_DATA_DIR, authDataDir } = {}) {
  return async function emailApiHandler(req, res, next) {
    const url = new URL(req.url, "http://localhost");
    const studioApiMatch = /^\/api\/users\/[^/]+\/email-studio$/.test(url.pathname);
    const emailApiMatch = url.pathname.startsWith("/api/email");
    if (!emailApiMatch && !studioApiMatch) {
      return next();
    }

    try {
      const session = await authenticateRequest(req, { dataDir: authDataDir });
      if (!session) return send(res, 401, { error: "Authentication required" });

      const accountKey = proposalStorageKey(session.user);
      const studioMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/email-studio$/);
      const automationMatch = url.pathname.match(/^\/api\/email\/automations(?:\/([^/]+)(\/run)?)?$/);
      const queueItemMatch = url.pathname.match(/^\/api\/email\/queue\/([^/]+)$/);

      function assertOwnerOrAdmin(userId) {
        if (userId === accountKey || isAdminUser(session.user)) return true;
        send(res, 403, { error: "Forbidden" });
        return false;
      }

      fs.mkdirSync(userDir(dataDir, accountKey), { recursive: true });

      if (studioMatch) {
        const userId = decodeURIComponent(studioMatch[1]);
        if (req.method === "GET") {
          return send(res, 200, { store: loadStudioStore(dataDir, userId) });
        }
        if (!assertOwnerOrAdmin(userId)) return;
        if (req.method === "PUT") {
          const body = await readBody(req);
          const store = body?.store && typeof body.store === "object" ? body.store : body;
          writeJson(studioPath(dataDir, userId), store);
          return send(res, 200, { ok: true });
        }
        return send(res, 405, { error: "Method not allowed" });
      }

      if (url.pathname === "/api/email/clients") {
        if (req.method === "GET") {
          return send(res, 200, { clients: loadClients(dataDir, accountKey) });
        }
        if (req.method === "PUT") {
          const body = await readBody(req);
          const incoming = Array.isArray(body?.clients) ? body.clients : [];
          const now = new Date().toISOString();
          const clients = incoming.slice(0, 5000).map((c) => ({
            id: String(c.id || newId("cli-")),
            firstName: String(c.firstName || "").slice(0, 80),
            name: String(c.name || "").slice(0, 120),
            email: String(c.email || "")
              .trim()
              .slice(0, 200),
            company: String(c.company || "").slice(0, 120),
            tags: Array.isArray(c.tags) ? c.tags.map((t) => String(t).slice(0, 40)).slice(0, 12) : [],
            notes: String(c.notes || "").slice(0, 500),
            createdAt: c.createdAt || now,
            updatedAt: now,
          }));
          saveClients(dataDir, accountKey, clients);
          return send(res, 200, { clients });
        }
        return send(res, 405, { error: "Method not allowed" });
      }

      if (url.pathname === "/api/email/automations/process-due" && req.method === "POST") {
        const result = processDueAutomations(dataDir, accountKey);
        return send(res, 200, result);
      }

      if (automationMatch) {
        const automationId = automationMatch[1];
        const isRun = Boolean(automationMatch[2]);

        if (!automationId && req.method === "GET") {
          return send(res, 200, { automations: loadAutomations(dataDir, accountKey) });
        }

        if (!automationId && req.method === "POST") {
          const body = await readBody(req);
          const automations = loadAutomations(dataDir, accountKey);
          const row = normalizeAutomation(body);
          automations.unshift(row);
          saveAutomations(dataDir, accountKey, automations.slice(0, 200));
          return send(res, 201, { automation: row });
        }

        if (automationId && req.method === "PUT") {
          const body = await readBody(req);
          const automations = loadAutomations(dataDir, accountKey);
          const idx = automations.findIndex((a) => a.id === automationId);
          if (idx < 0) return send(res, 404, { error: "Automation not found" });
          const row = normalizeAutomation(body, automations[idx]);
          automations[idx] = row;
          saveAutomations(dataDir, accountKey, automations);
          return send(res, 200, { automation: row });
        }

        if (automationId && req.method === "DELETE") {
          const automations = loadAutomations(dataDir, accountKey).filter((a) => a.id !== automationId);
          saveAutomations(dataDir, accountKey, automations);
          return send(res, 200, { ok: true });
        }

        if (automationId && isRun && req.method === "POST") {
          const automations = loadAutomations(dataDir, accountKey);
          const automation = automations.find((a) => a.id === automationId);
          if (!automation) return send(res, 404, { error: "Automation not found" });
          const clients = loadClients(dataDir, accountKey);
          const created = enqueueAutomation(dataDir, accountKey, automation, clients);
          const idx = automations.findIndex((a) => a.id === automationId);
          automations[idx] = {
            ...automation,
            lastRunAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          saveAutomations(dataDir, accountKey, automations);
          return send(res, 200, { created, count: created.length });
        }

        return send(res, 405, { error: "Method not allowed" });
      }

      if (url.pathname === "/api/email/queue") {
        if (req.method === "GET") {
          const status = url.searchParams.get("status");
          let queue = loadQueue(dataDir, accountKey);
          if (status) queue = queue.filter((q) => q.status === status);
          return send(res, 200, { queue });
        }
        return send(res, 405, { error: "Method not allowed" });
      }

      if (queueItemMatch && req.method === "PATCH") {
        const queueId = queueItemMatch[1];
        const body = await readBody(req);
        const queue = loadQueue(dataDir, accountKey);
        const idx = queue.findIndex((q) => q.id === queueId);
        if (idx < 0) return send(res, 404, { error: "Queue item not found" });
        if (body.status === "sent" || body.status === "skipped" || body.status === "pending") {
          queue[idx].status = body.status;
          if (body.status === "sent") queue[idx].sentAt = new Date().toISOString();
        }
        saveQueue(dataDir, accountKey, queue);
        return send(res, 200, { item: queue[idx] });
      }

      if (url.pathname === "/api/email/campaigns" && req.method === "GET") {
        const days = Math.min(90, Math.max(7, Number(url.searchParams.get("days") || 30)));
        const cutoff = Date.now() - days * 86400000;
        const campaigns = loadAllCampaigns(dataDir).filter((c) => new Date(c.copiedAt || 0).getTime() >= cutoff);
        return send(res, 200, { campaigns });
      }

      if (url.pathname === "/api/email/campaigns" && req.method === "POST") {
        const body = await readBody(req);
        const userId = accountKey;
        const campaigns = loadCampaigns(dataDir, userId);
        const row = {
          id: newId(),
          userId,
          templateId: body?.templateId || null,
          title: String(body?.title || "Untitled email").slice(0, 200),
          subject: String(body?.subject || body?.title || "").slice(0, 200),
          kind: body?.kind || "custom",
          copiedAt: new Date().toISOString(),
          sentAt: body?.sentAt || null,
        };
        campaigns.unshift(row);
        saveCampaigns(dataDir, userId, campaigns.slice(0, 500));
        return send(res, 201, { campaign: row });
      }

      return send(res, 404, { error: "Not found" });
    } catch (err) {
      console.error("[email-api]", err);
      return send(res, 500, { error: err.message || "Server error" });
    }
  };
}
