// server/clickupApi.js
// Chained handler like proposalsApi.js. Mount in server/apiHandler.js.

import "./loadEnv.js";
import { send } from "./httpUtils.js";
import { authenticateRequest } from "./auth/sessions.js";
import { DEFAULT_AUTH_DATA_DIR } from "./auth/userStore.js";
import {
  DEFAULT_CLICKUP_DATA_DIR,
  isClickUpConfigured,
  pollClickUp,
  listIncoming,
  updateIncoming,
  getTask,
  summarizeClickUpTask,
  ownersFromProject,
  cardFieldsFromProject,
  canUserTakeProject,
  canUserDismissIncoming,
  OWNER_BLOCK_MESSAGE,
} from "./clickup.js";
import { buildProposalSeedFromTask, findLinkedContactId, contactRelationField } from "./clickupProposalSeed.js";

function publicProject(row, user) {
  const card = cardFieldsFromProject(row);
  const canAccept = canUserTakeProject(user, card.owners);
  const canDismiss = canUserDismissIncoming(user);
  return {
    id: row.id,
    name: row.name,
    url: row.url || null,
    clickupStatus: row.clickupStatus || null,
    clickupCreatedAt: row.clickupCreatedAt || 0,
    owners: card.owners,
    tags: card.tags,
    projectType: card.projectType,
    systemSizeKw: card.systemSizeKw,
    status: row.status,
    canAccept,
    canDismiss,
    blockReason: canAccept ? null : OWNER_BLOCK_MESSAGE,
  };
}

function findProject(dataDir, id) {
  return listIncoming(dataDir).find((p) => p.id === id) || null;
}

async function liveOwners(dataDir, id, fallback) {
  if (!isClickUpConfigured()) return { owners: fallback, task: null };
  try {
    const task = await getTask(id);
    const summary = summarizeClickUpTask(task);
    updateIncoming(dataDir, id, {
      name: summary.name,
      url: summary.url,
      clickupStatus: summary.clickupStatus,
      customFields: summary.customFields,
      owners: summary.owners,
      tags: summary.tags,
      projectType: summary.projectType,
      systemSizeKw: summary.systemSizeKw,
    });
    return { owners: summary.owners, task };
  } catch (err) {
    console.warn("[clickup] live fetch failed:", err.message);
    return { owners: fallback, task: null };
  }
}

export function createClickUpApiHandler({
  dataDir = DEFAULT_CLICKUP_DATA_DIR,
  authDataDir = DEFAULT_AUTH_DATA_DIR,
} = {}) {
  return async function clickupApiHandler(req, res, next) {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/api/clickup")) return next();

    const session = await authenticateRequest(req, { dataDir: authDataDir });
    if (!session) return send(res, 401, { error: "Authentication required" });
    const { pathname } = url;

    if (req.method === "GET" && pathname === "/api/clickup/status") {
      return send(res, 200, { configured: isClickUpConfigured(), listId: process.env.CLICKUP_LIST_ID || null });
    }

    if (req.method === "POST" && pathname === "/api/clickup/poll") {
      try {
        return send(res, 200, await pollClickUp(dataDir));
      } catch (err) {
        return send(res, err.rateLimited ? 429 : 502, { error: err.message });
      }
    }

    if (req.method === "GET" && pathname === "/api/clickup/incoming") {
      const status = url.searchParams.get("status") || undefined;
      const projects = listIncoming(dataDir, { status }).map((row) => publicProject(row, session.user));
      return send(res, 200, { projects });
    }

    const acceptMatch = pathname.match(/^\/api\/clickup\/incoming\/([^/]+)\/accept$/);
    if (req.method === "POST" && acceptMatch) {
      const id = decodeURIComponent(acceptMatch[1]);
      const existing = findProject(dataDir, id);
      if (!existing) return send(res, 404, { error: "Project not found" });

      const { owners, task } = await liveOwners(dataDir, id, ownersFromProject(existing));
      if (!canUserTakeProject(session.user, owners)) {
        return send(res, 403, { error: OWNER_BLOCK_MESSAGE });
      }

      const preparedBy = {
        name: session.user.name || session.user.username || null,
        email: session.user.email || null,
        phone: session.user.phone || null,
      };
      const updated = updateIncoming(dataDir, id, {
        status: "accepted",
        acceptedBy: preparedBy.email || preparedBy.name,
        acceptedAt: new Date().toISOString(),
      });
      if (!updated) return send(res, 404, { error: "Project not found" });

      let contactTask = null;
      try {
        if (task) {
          const contactId = findLinkedContactId(task, contactRelationField());
          if (contactId) contactTask = await getTask(contactId);
        }
      } catch (err) {
        console.warn("[clickup] accept contact fetch failed:", err.message);
      }
      const seedSource = task || { name: updated.name, custom_fields: updated.customFields || [] };
      const proposalSeed = buildProposalSeedFromTask(seedSource, { preparedBy, contactTask });
      return send(res, 200, { project: publicProject(updated, session.user), proposalSeed });
    }

    const dismissMatch = pathname.match(/^\/api\/clickup\/incoming\/([^/]+)\/dismiss$/);
    if (req.method === "POST" && dismissMatch) {
      const id = decodeURIComponent(dismissMatch[1]);
      const existing = findProject(dataDir, id);
      if (!existing) return send(res, 404, { error: "Project not found" });
      if (!canUserDismissIncoming(session.user)) {
        return send(res, 403, { error: "Only an admin can dismiss incoming projects." });
      }
      const updated = updateIncoming(dataDir, id, {
        status: "dismissed",
        dismissedBy: session.user.email || session.user.username || session.user.id,
        dismissedAt: new Date().toISOString(),
      });
      if (!updated) return send(res, 404, { error: "Project not found" });
      return send(res, 200, { project: publicProject(updated, session.user) });
    }

    return send(res, 404, { error: "Not found" });
  };
}
