/**
 * Production-style server: static app (dist/) + proposals + HubSpot API.
 * Same env vars as local dev — copy .env to the shared host when you deploy.
 */
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import "./loadEnv.js";
import { createProposalsApiHandler, DEFAULT_DATA_DIR } from "./proposalsApi.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");
const port = Number(process.env.PORT || 3001);
const dataDir = process.env.PROPOSALS_DATA_DIR || DEFAULT_DATA_DIR;

const apiHandler = createProposalsApiHandler({ dataDir });

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".ico": "image/x-icon",
};

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  res.setHeader("Content-Type", type);
  res.end(fs.readFileSync(filePath));
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
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
  console.log(`  HubSpot: ${process.env.HUBSPOT_ACCESS_TOKEN ? "configured" : "not configured (add HUBSPOT_ACCESS_TOKEN to .env)"}`);
});
