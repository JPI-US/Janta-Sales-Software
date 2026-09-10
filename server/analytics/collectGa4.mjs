#!/usr/bin/env node
/**
 * Pulls one day of GA4 data out of BigQuery and writes it to the local rollups.
 *
 *   node server/analytics/collectGa4.mjs              # yesterday (UTC)
 *   node server/analytics/collectGa4.mjs 2026-09-11   # a specific day
 *   node server/analytics/collectGa4.mjs 2026-09-01 2026-09-11   # inclusive range
 *
 * Env: GA4_BQ_PROJECT_ID, GA4_BQ_DATASET, GA4_BQ_LOCATION,
 *      GOOGLE_APPLICATION_CREDENTIALS (path to the service-account JSON).
 *
 * The raw BigQuery responses are archived before anything is parsed, so a bad
 * transform can be fixed and replayed without re-querying. Re-running a date
 * overwrites that date only.
 */
import "../loadEnv.js";
import { loadServiceAccount, getAccessToken } from "./googleAuth.js";
import { runQuery } from "./bigquery.js";
import {
  totalsSql,
  pagesSql,
  breakdownsSql,
  eventsSql,
  dayRollupFromResults,
} from "./ga4Queries.js";
import { analyticsDir, archiveRaw, writeDayRollup, readState, writeState } from "./rollupStore.js";
import { datesInRange } from "../../shared/analyticsRollup.js";

function yesterdayUtc() {
  return new Date(Date.now() - 86400000).toISOString().slice(0, 10);
}

function requireEnv() {
  const projectId = String(process.env.GA4_BQ_PROJECT_ID || "").trim();
  const dataset = String(process.env.GA4_BQ_DATASET || "").trim();
  const location = String(process.env.GA4_BQ_LOCATION || "US").trim() || "US";
  const missing = [];
  if (!projectId) missing.push("GA4_BQ_PROJECT_ID");
  if (!dataset) missing.push("GA4_BQ_DATASET");
  if (missing.length) {
    throw new Error(`Missing required env: ${missing.join(", ")}`);
  }
  return { projectId, dataset, location };
}

export async function collectDay({
  date,
  projectId,
  dataset,
  location,
  accessToken,
  dir,
  runQueryImpl = runQuery,
}) {
  const target = { projectId, dataset, date };
  const run = (query) => runQueryImpl({ projectId, query, location, accessToken });

  // Four small single-day queries. Each scans one events_YYYYMMDD table.
  const [totals, pages, breakdowns, events] = await Promise.all([
    run(totalsSql(target)),
    run(pagesSql(target)),
    run(breakdownsSql(target)),
    run(eventsSql(target)),
  ]);

  archiveRaw(dir, date, { totals, pages, breakdowns, events });
  const rollup = dayRollupFromResults({ date, totals, pages, breakdowns, events });
  writeDayRollup(dir, rollup);
  return rollup;
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const dates =
    args.length >= 2 ? datesInRange(args[0], args[1]) : [args[0] ? args[0].slice(0, 10) : yesterdayUtc()];
  if (!dates.length) throw new Error("No dates to collect");

  const { projectId, dataset, location } = requireEnv();
  const dir = analyticsDir();
  const account = loadServiceAccount();
  const accessToken = await getAccessToken(account);

  console.log(`[ga4] project=${projectId} dataset=${dataset} location=${location}`);
  console.log(`[ga4] writing to ${dir}`);

  let collected = 0;
  let missing = 0;
  for (const date of dates) {
    try {
      const rollup = await collectDay({ date, projectId, dataset, location, accessToken, dir });
      collected += 1;
      console.log(
        `[ga4] ${date}: ${rollup.totals.sessions} sessions, ${rollup.totals.users} users, ${rollup.totals.pageviews} pageviews`
      );
    } catch (err) {
      // A missing table is normal: the export has no table for days before the
      // link was created, and today's table does not exist until tomorrow.
      if (err.notFound) {
        missing += 1;
        console.warn(`[ga4] ${date}: no export table yet (skipped)`);
        continue;
      }
      writeState(dir, { lastRunAt: new Date().toISOString(), lastError: `${date}: ${err.message}` });
      throw err;
    }
  }

  const last = dates[dates.length - 1];
  const previous = readState(dir).lastCollectedDate;
  writeState(dir, {
    lastCollectedDate: collected && (!previous || last > previous) ? last : previous,
    lastRunAt: new Date().toISOString(),
    lastError: null,
  });

  console.log(`[ga4] done: ${collected} day(s) collected, ${missing} skipped`);
  if (!collected && missing) {
    console.warn(
      "[ga4] Nothing collected. If the BigQuery link is new, wait for the first events_YYYYMMDD table to appear (about 24h after the tag goes live)."
    );
  }
}

// Only run when invoked directly, so the module stays importable from tests.
if (process.argv[1] && process.argv[1].endsWith("collectGa4.mjs")) {
  main().catch((err) => {
    console.error(`[ga4] ${err.message}`);
    process.exit(1);
  });
}
