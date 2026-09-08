// server/clickupApi.js
// Chained handler like proposalsApi.js. Mount in server/apiHandler.js.

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
} from "./clickup.js";
import { buildProposalSeedFromTask, findLinkedContactId, contactRelationField } from "./clickupProposalSeed.js";

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
      return send(res, 200, { projects: listIncoming(dataDir, { status }) });
    }

    const acceptMatch = pathname.match(/^\/api\/clickup\/incoming\/([^/]+)\/accept$/);
    if (req.method === "POST" && acceptMatch) {
      const id = decodeURIComponent(acceptMatch[1]);
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

      let task = null;
      let contactTask = null;
      try {
        if (isClickUpConfigured()) {
          task = await getTask(id);
          const contactId = findLinkedContactId(task, contactRelationField());
          if (contactId) contactTask = await getTask(contactId);
        }
      } catch (err) {
        console.warn("[clickup] accept fetch failed:", err.message);
      }
      const seedSource = task || { name: updated.name, custom_fields: updated.customFields || [] };
      const proposalSeed = buildProposalSeedFromTask(seedSource, { preparedBy, contactTask });
      return send(res, 200, { project: updated, proposalSeed });
    }

    const dismissMatch = pathname.match(/^\/api\/clickup\/incoming\/([^/]+)\/dismiss$/);
    if (req.method === "POST" && dismissMatch) {
      const id = decodeURIComponent(dismissMatch[1]);
      const updated = updateIncoming(dataDir, id, {
        status: "dismissed",
        dismissedBy: session.user.email || session.user.username || session.user.id,
        dismissedAt: new Date().toISOString(),
      });
      if (!updated) return send(res, 404, { error: "Project not found" });
      return send(res, 200, { project: updated });
    }

    return send(res, 404, { error: "Not found" });
  };
}
