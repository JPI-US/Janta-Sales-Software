import http from "http";
import "./loadEnv.js";
import { createApiHandler } from "./apiHandler.js";
import { DEFAULT_DATA_DIR } from "./proposalsApi.js";
import { DEFAULT_AUTH_DATA_DIR } from "./auth/userStore.js";
import { applyCorsHeaders } from "./cors.js";

const port = Number(process.env.PORT || 3001);
const dataDir = process.env.PROPOSALS_DATA_DIR || DEFAULT_DATA_DIR;
const authDataDir = process.env.AUTH_DATA_DIR || DEFAULT_AUTH_DATA_DIR;
const handler = createApiHandler({ dataDir, authDataDir });

const server = http.createServer((req, res) => {
  applyCorsHeaders(req, res, { allowedOrigin: process.env.CORS_ORIGIN });
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  handler(req, res, () => {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Not found" }));
  });
});

server.listen(port, () => {
  console.log(`Proposals API listening on http://localhost:${port}`);
  console.log(`Data directory: ${dataDir}`);
});
