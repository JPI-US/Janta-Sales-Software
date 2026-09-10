/**
 * Reads and writes the analytics rollups on disk. Flat JSON, matching how the
 * rest of the app stores data -- see shared/analyticsRollup.js for the shape.
 *
 * Lives inside the proposals data directory so it sits in the janta-data volume
 * and needs no extra mount:
 *   <data>/analytics/raw/YYYY-MM-DD.json    verbatim BigQuery responses
 *   <data>/analytics/rollup/YYYY-MM.json    one file per month
 *   <data>/analytics/state.json             collector watermark
 */
import path from "path";
import { fileURLToPath } from "url";
import { readJson, writeJson } from "../httpUtils.js";
import { monthKeyFor } from "../../shared/analyticsRollup.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function analyticsDir() {
  const explicit = String(process.env.ANALYTICS_DATA_DIR || "").trim();
  if (explicit) return explicit;
  const base = String(process.env.PROPOSALS_DATA_DIR || "").trim();
  if (base) return path.join(base, "..", "analytics");
  return path.resolve(__dirname, "../../data/analytics");
}

const monthPath = (dir, month) => path.join(dir, "rollup", `${month}.json`);
const rawPath = (dir, date) => path.join(dir, "raw", `${date}.json`);
const statePath = (dir) => path.join(dir, "state.json");

export function readMonth(dir, month) {
  return readJson(monthPath(dir, month), { month, days: {} });
}

/** Replaces the entry for that date; re-running a day is idempotent. */
export function writeDayRollup(dir, rollup) {
  const date = String(rollup.date).slice(0, 10);
  const month = monthKeyFor(date);
  const store = readMonth(dir, month);
  if (!store.days || typeof store.days !== "object") store.days = {};
  store.days[date] = rollup;
  store.month = month;
  store.updatedAt = new Date().toISOString();
  writeJson(monthPath(dir, month), store);
  return store;
}

export function readDayRollup(dir, date) {
  const clean = String(date).slice(0, 10);
  return readMonth(dir, monthKeyFor(clean)).days?.[clean] || null;
}

export function readDaysInRange(dir, dates) {
  const byMonth = new Map();
  const out = [];
  for (const date of dates) {
    const month = monthKeyFor(date);
    if (!byMonth.has(month)) byMonth.set(month, readMonth(dir, month));
    const day = byMonth.get(month).days?.[date];
    if (day) out.push(day);
  }
  return out;
}

export function archiveRaw(dir, date, payload) {
  writeJson(rawPath(dir, String(date).slice(0, 10)), {
    date: String(date).slice(0, 10),
    fetchedAt: new Date().toISOString(),
    ...payload,
  });
}

export function readState(dir) {
  return readJson(statePath(dir), { lastCollectedDate: null, lastRunAt: null, lastError: null });
}

export function writeState(dir, patch) {
  writeJson(statePath(dir), { ...readState(dir), ...patch });
}
