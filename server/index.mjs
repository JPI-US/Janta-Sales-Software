import http from "http";
import "./loadEnv.js";
import { createProposalsApiHandler, DEFAULT_DATA_DIR } from "./proposalsApi.js";

const port = Number(process.env.PORT || 3001);
const dataDir = process.env.PROPOSALS_DATA_DIR || DEFAULT_DATA_DIR;
const handler = createProposalsApiHandler({ dataDir });

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
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
