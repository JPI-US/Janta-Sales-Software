import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import "./loadEnv.js";
import {
  isHubSpotConfigured,
  pushProposalToHubSpot,
  syncAccountWithHubSpot,
} from "./hubspot.js";
import { dedupeProposalList } from "../shared/proposalDedupe.js";
import { proposalStorageKey } from "../shared/proposalAccount.js";
import { readJson, writeJson, readBody, send } from "./httpUtils.js";
import { authenticateRequest } from "./auth/sessions.js";
import { DEFAULT_AUTH_DATA_DIR } from "./auth/userStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DATA_DIR = path.resolve(__dirname, "../data/cloud-proposals");

function userDir(dataDir, userId) {
  const safe = String(userId).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safe) throw new Error("Invalid userId");
  return path.join(dataDir, safe);
}

function proposalsPath(dataDir, userId) {
  return path.join(userDir(dataDir, userId), "proposals.json");
}

function draftPath(dataDir, userId) {
  return path.join(userDir(dataDir, userId), "draft.json");
}

function ensureUserDir(dataDir, userId) {
  const dir = userDir(dataDir, userId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function loadProposalsStore(dataDir, userId) {
  const fp = proposalsPath(dataDir, userId);
  const store = readJson(fp, { proposals: [] });
  const raw = Array.isArray(store.proposals) ? store.proposals : [];
  const deduped = dedupeProposalList(raw);
  if (deduped.length !== raw.length) {
    writeJson(fp, { proposals: deduped });
  }
  return deduped;
}

function upsertProposalRow(proposals, { userId, id, title, snapshot, status, existingIdx }) {
  const now = new Date().toISOString();
  const cleanTitle = String(title || "").trim() || "Untitled proposal";
  if (existingIdx >= 0) {
    const next = {
      ...proposals[existingIdx],
      title: cleanTitle,
      snapshot,
      status: status ?? proposals[existingIdx].status ?? "in_progress",
      updatedAt: now,
    };
    proposals[existingIdx] = next;
    return { proposal: next, created: false };
  }
  const created = {
    id: id || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    userId,
    title: cleanTitle,
    status: status || "in_progress",
    snapshot,
    createdAt: now,
    updatedAt: now,
  };
  proposals.push(created);
  return { proposal: created, created: true };
}

async function hubspotPushAfterSave(proposal, userEmail) {
  if (!isHubSpotConfigured() || !proposal) return proposal;
  try {
    const result = await pushProposalToHubSpot(proposal, { userEmail });
    if (result?.hubspotDealId) {
      proposal.hubspotDealId = result.hubspotDealId;
      if (proposal.snapshot) proposal.snapshot.hubspotDealId = result.hubspotDealId;
    }
  } catch (err) {
    console.warn("[hubspot] push after save:", err.message);
  }
  return proposal;
}

export function createProposalsApiHandler({ dataDir = DEFAULT_DATA_DIR, authDataDir = DEFAULT_AUTH_DATA_DIR } = {}) {
  return async function proposalsApiHandler(req, res, next) {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/api/")) return next();

    try {
      const session = await authenticateRequest(req, { dataDir: authDataDir });
      if (!session) return send(res, 401, { error: "Authentication required" });

      function assertOwnerOrAdmin(userId) {
        if (userId === proposalStorageKey(session.user) || session.user.isAdmin) return true;
        send(res, 403, { error: "Forbidden" });
        return false;
      }

      if (url.pathname === "/api/hubspot/status" && req.method === "GET") {
        return send(res, 200, { configured: isHubSpotConfigured() });
      }

      const listMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/proposals$/);
      const oneMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/proposals\/([^/]+)$/);
      const draftMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/draft$/);
      const hubspotSyncMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/hubspot\/sync$/);
      const dedupeMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/proposals\/dedupe$/);

      if (dedupeMatch && req.method === "POST") {
        const userId = decodeURIComponent(dedupeMatch[1]);
        if (!assertOwnerOrAdmin(userId)) return;
        ensureUserDir(dataDir, userId);
        const before = readJson(proposalsPath(dataDir, userId), { proposals: [] });
        const raw = Array.isArray(before.proposals) ? before.proposals : [];
        const next = dedupeProposalList(raw);
        writeJson(proposalsPath(dataDir, userId), { proposals: next });
        return send(res, 200, { removed: raw.length - next.length, remaining: next.length });
      }

      if (hubspotSyncMatch && req.method === "POST") {
        const userId = decodeURIComponent(hubspotSyncMatch[1]);
        if (!assertOwnerOrAdmin(userId)) return;
        const body = await readBody(req);
        const userEmail = String(body?.userEmail || "").trim();
        ensureUserDir(dataDir, userId);
        const store = readJson(proposalsPath(dataDir, userId), { proposals: [] });
        const proposals = Array.isArray(store.proposals) ? store.proposals : [];
        const result = await syncAccountWithHubSpot({ proposals, userId, userEmail });
        writeJson(proposalsPath(dataDir, userId), { proposals });
        return send(res, 200, result);
      }

      if (listMatch) {
        const userId = decodeURIComponent(listMatch[1]);
        if (!assertOwnerOrAdmin(userId)) return;
        ensureUserDir(dataDir, userId);

        if (req.method === "POST") {
          const body = await readBody(req);
          if (!body?.snapshot) return send(res, 400, { error: "snapshot required" });
          const proposals = loadProposalsStore(dataDir, userId);
          const requestedId = body.id ? String(body.id).trim() : "";
          const idx = requestedId ? proposals.findIndex((p) => p.id === requestedId) : -1;
          const { proposal, created } = upsertProposalRow(proposals, {
            userId,
            id: requestedId || undefined,
            title: body.title,
            snapshot: body.snapshot,
            status: body.status,
            existingIdx: idx,
          });
          const userEmail = String(body.userEmail || "").trim();
          await hubspotPushAfterSave(proposal, userEmail);
          writeJson(proposalsPath(dataDir, userId), { proposals });
          return send(res, created ? 201 : 200, { proposal });
        }

        if (req.method === "GET") {
          let rows = loadProposalsStore(dataDir, userId);
          const status = url.searchParams.get("status");
          if (status) rows = rows.filter((p) => p.status === status);
          rows.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
          return send(res, 200, { proposals: rows });
        }
      }

      if (draftMatch) {
        const userId = decodeURIComponent(draftMatch[1]);
        if (!assertOwnerOrAdmin(userId)) return;
        ensureUserDir(dataDir, userId);
        if (req.method === "GET") {
          const draft = readJson(draftPath(dataDir, userId), null);
          return send(res, 200, { draft });
        }
        if (req.method === "PUT") {
          const body = await readBody(req);
          writeJson(draftPath(dataDir, userId), {
            updatedAt: new Date().toISOString(),
            snapshot: body?.snapshot ?? null,
          });
          return send(res, 200, { ok: true });
        }
        if (req.method === "DELETE") {
          const fp = draftPath(dataDir, userId);
          if (fs.existsSync(fp)) fs.unlinkSync(fp);
          return send(res, 200, { ok: true });
        }
      }

      if (oneMatch) {
        const userId = decodeURIComponent(oneMatch[1]);
        const proposalId = decodeURIComponent(oneMatch[2]);
        if (!assertOwnerOrAdmin(userId)) return;
        ensureUserDir(dataDir, userId);
        const proposals = loadProposalsStore(dataDir, userId);

        if (req.method === "GET") {
          const row = proposals.find((p) => p.id === proposalId);
          if (!row) return send(res, 404, { error: "Not found" });
          return send(res, 200, { proposal: row });
        }

        if (req.method === "PUT") {
          const body = await readBody(req);
          const idx = proposals.findIndex((p) => p.id === proposalId);
          if (idx < 0) return send(res, 404, { error: "Not found" });
          const now = new Date().toISOString();
          const next = {
            ...proposals[idx],
            ...(body?.title != null ? { title: String(body.title).trim() || proposals[idx].title } : {}),
            ...(body?.snapshot != null ? { snapshot: body.snapshot } : {}),
            ...(body?.status != null ? { status: body.status } : {}),
            updatedAt: now,
          };
          proposals[idx] = next;
          const userEmail = String(body?.userEmail || "").trim();
          await hubspotPushAfterSave(next, userEmail);
          writeJson(proposalsPath(dataDir, userId), { proposals });
          return send(res, 200, { proposal: next });
        }

        if (req.method === "DELETE") {
          const next = proposals.filter((p) => p.id !== proposalId);
          if (next.length === proposals.length) return send(res, 404, { error: "Not found" });
          writeJson(proposalsPath(dataDir, userId), { proposals: next });
          return send(res, 200, { ok: true });
        }
      }

      return send(res, 405, { error: "Method not allowed" });
    } catch (err) {
      console.error("[proposals-api]", err);
      return send(res, 500, { error: err.message || "Server error" });
    }
  };
}

export function createProposalsApiMiddleware(options) {
  const handler = createProposalsApiHandler(options);
  return (req, res, next) => {
    handler(req, res, next).catch((err) => {
      console.error(err);
      send(res, 500, { error: "Server error" });
    });
  };
}
