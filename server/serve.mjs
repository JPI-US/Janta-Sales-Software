/**
 * Production-style server: static app (dist/) + proposals + auth + HubSpot API.
 * Same env vars as local dev — copy .env to the shared host when you deploy.
 */
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import "./loadEnv.js";
import { createApiHandler } from "./apiHandler.js";
import { DEFAULT_DATA_DIR } from "./proposalsApi.js";
import { DEFAULT_AUTH_DATA_DIR } from "./auth/userStore.js";
import { applyCorsHeaders } from "./cors.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");
const port = Number(process.env.PORT || 3001);
const dataDir = process.env.PROPOSALS_DATA_DIR || DEFAULT_DATA_DIR;
const authDataDir = process.env.AUTH_DATA_DIR || DEFAULT_AUTH_DATA_DIR;

const apiHandler = createApiHandler({ dataDir, authDataDir });

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  res.setHeader("Content-Type", type);
  res.end(fs.readFileSync(filePath));
}

// Same header set previously applied by the container's nginx (see nginx.conf history) —
// now that Node serves everything directly, these must be set here instead.
const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: https://server.arcgisonline.com; connect-src 'self' https://nominatim.openstreetmap.org https://photon.komoot.io; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
};

// Every method this app actually uses; anything else (TRACE/TRACK/CONNECT/etc.) is rejected.
const ALLOWED_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);

const server = http.createServer((req, res) => {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(key, value);
  applyCorsHeaders(req, res, { allowedOrigin: process.env.CORS_ORIGIN });

  if (!ALLOWED_METHODS.has(req.method)) {
    res.statusCode = 405;
    res.end();
    return;
  }

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  apiHandler(req, res, () => {
    if (!fs.existsSync(distDir)) {
      res.statusCode = 503;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Run npm run build first, then npm start");
      return;
    }

    const url = new URL(req.url || "/", `http://localhost`);
    let rel = decodeURIComponent(url.pathname);
    if (rel === "/") rel = "/index.html";
    const filePath = path.normalize(path.join(distDir, rel));
    if (!filePath.startsWith(distDir)) {
      res.statusCode = 403;
      res.end("Forbidden");
      return;
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      sendFile(res, filePath);
      return;
    }
    const index = path.join(distDir, "index.html");
    if (fs.existsSync(index)) sendFile(res, index);
    else {
      res.statusCode = 404;
      res.end("Not found");
    }
  });
});

server.listen(port, () => {
  console.log(`Janta Proposal Generator`);
  console.log(`  App:  http://localhost:${port}/`);
  console.log(`  Data: ${dataDir}`);
  console.log(`  Auth: ${authDataDir}`);
  console.log(`  HubSpot: ${process.env.HUBSPOT_ACCESS_TOKEN ? "configured" : "not configured (add HUBSPOT_ACCESS_TOKEN to .env)"}`);
});
