import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      if (!chunks.length) return resolve(null);
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export function createProposalsApiHandler({ dataDir = DEFAULT_DATA_DIR } = {}) {
  return async function proposalsApiHandler(req, res, next) {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/api/")) return next();

    try {
      const listMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/proposals$/);
      const oneMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/proposals\/([^/]+)$/);
      const draftMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/draft$/);

      if (listMatch) {
        const userId = decodeURIComponent(listMatch[1]);
        ensureUserDir(dataDir, userId);

        if (req.method === "POST") {
          const body = await readBody(req);
          if (!body?.snapshot) return send(res, 400, { error: "snapshot required" });
          const store = readJson(proposalsPath(dataDir, userId), { proposals: [] });
          const proposals = Array.isArray(store.proposals) ? store.proposals : [];
          const now = new Date().toISOString();
          const created = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
            userId,
            title: String(body.title || "").trim() || "Untitled proposal",
            status: body.status || "in_progress",
            snapshot: body.snapshot,
            createdAt: now,
            updatedAt: now,
          };
          proposals.push(created);
          writeJson(proposalsPath(dataDir, userId), { proposals });
          return send(res, 201, { proposal: created });
        }

        if (req.method === "GET") {
          const store = readJson(proposalsPath(dataDir, userId), { proposals: [] });
          let rows = Array.isArray(store.proposals) ? store.proposals : [];
          const status = url.searchParams.get("status");
          if (status) rows = rows.filter((p) => p.status === status);
          rows.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
          return send(res, 200, { proposals: rows });
        }
      }

      if (draftMatch) {
        const userId = decodeURIComponent(draftMatch[1]);
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
        ensureUserDir(dataDir, userId);
        const store = readJson(proposalsPath(dataDir, userId), { proposals: [] });
        const proposals = Array.isArray(store.proposals) ? store.proposals : [];

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
