/**
 * SQL against the GA4 BigQuery export, plus the pure transforms that turn the
 * result rows into a DayRollup.
 *
 * Every query names ONE day's table explicitly (events_YYYYMMDD). Never use an
 * events_* wildcard without a _TABLE_SUFFIX filter -- that scans the whole
 * export in a single query and is the only realistic way to burn through
 * BigQuery's free 1 TB/month allowance.
 */
import { emptyDayRollup } from "../../shared/analyticsRollup.js";

/** GA4 has no session id column; a session is (user_pseudo_id, ga_session_id). */
const SESSION_KEY =
  "CONCAT(user_pseudo_id, '-', CAST((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS STRING))";
const ENGAGEMENT_MS =
  "IFNULL((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'engagement_time_msec'), 0)";

export function dateToTableSuffix(date) {
  const clean = String(date).slice(0, 10).replace(/-/g, "");
  if (!/^\d{8}$/.test(clean)) throw new Error(`Invalid date for GA4 table: ${date}`);
  return clean;
}

export function tableFor({ projectId, dataset, date }) {
  if (!projectId) throw new Error("GA4_BQ_PROJECT_ID is not set");
  if (!dataset) throw new Error("GA4_BQ_DATASET is not set");
  return "`" + `${projectId}.${dataset}.events_${dateToTableSuffix(date)}` + "`";
}

export function totalsSql(target) {
  const table = tableFor(target);
  return `
SELECT
  COUNT(DISTINCT user_pseudo_id) AS users,
  COUNT(DISTINCT ${SESSION_KEY}) AS sessions,
  COUNTIF(event_name = 'page_view') AS pageviews,
  COUNT(DISTINCT IF(
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'session_engaged') = '1',
    ${SESSION_KEY}, NULL)) AS engaged_sessions,
  SUM(${ENGAGEMENT_MS}) / 1000 AS engagement_seconds
FROM ${table}`.trim();
}

export function pagesSql(target) {
  const table = tableFor(target);
  return `
SELECT
  (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') AS page_location,
  COUNT(*) AS views,
  SUM(${ENGAGEMENT_MS}) / 1000 AS engagement_seconds
FROM ${table}
WHERE event_name = 'page_view'
GROUP BY page_location
ORDER BY views DESC
LIMIT 25`.trim();
}

/**
 * Source/medium here is GA4's user-level first-touch attribution
 * (traffic_source), which is present on every export. Session-scoped
 * attribution lives in collected_traffic_source, which older exports lack.
 */
export function breakdownsSql(target) {
  const table = tableFor(target);
  return `
WITH sessions AS (
  SELECT DISTINCT
    ${SESSION_KEY} AS session_key,
    IFNULL(traffic_source.source, '(direct)') AS source,
    IFNULL(traffic_source.medium, '(none)') AS medium,
    IFNULL(geo.country, '(unknown)') AS country,
    IFNULL(device.category, '(unknown)') AS device
  FROM ${table}
)
SELECT 'source' AS dimension, CONCAT(source, ' / ', medium) AS value, COUNT(DISTINCT session_key) AS sessions
FROM sessions GROUP BY value
UNION ALL
SELECT 'country', country, COUNT(DISTINCT session_key) FROM sessions GROUP BY country
UNION ALL
SELECT 'device', device, COUNT(DISTINCT session_key) FROM sessions GROUP BY device`.trim();
}

export function eventsSql(target) {
  const table = tableFor(target);
  return `
SELECT event_name, COUNT(*) AS count
FROM ${table}
GROUP BY event_name
ORDER BY count DESC
LIMIT 40`.trim();
}

/** "https://jantaus.com/pricing?utm=x" -> "/pricing". Query strings are dropped. */
export function pathFromLocation(location) {
  const raw = String(location || "").trim();
  if (!raw) return "/";
  try {
    return new URL(raw).pathname || "/";
  } catch {
    const withoutQuery = raw.split("?")[0];
    const slash = withoutQuery.indexOf("/", withoutQuery.indexOf("//") + 2);
    return slash >= 0 ? withoutQuery.slice(slash) || "/" : "/";
  }
}

export function dayRollupFromResults({ date, totals = [], pages = [], breakdowns = [], events = [] }) {
  const rollup = emptyDayRollup(String(date).slice(0, 10));
  const t = totals[0] || {};
  rollup.totals = {
    sessions: Number(t.sessions) || 0,
    users: Number(t.users) || 0,
    pageviews: Number(t.pageviews) || 0,
    engagedSessions: Number(t.engaged_sessions) || 0,
    engagementSeconds: Math.round((Number(t.engagement_seconds) || 0) * 10) / 10,
  };

  // Several URLs can share a path once the query string is stripped.
  const byPath = new Map();
  for (const row of pages) {
    const path = pathFromLocation(row.page_location);
    const prev = byPath.get(path) || { path, views: 0, engagementSeconds: 0 };
    prev.views += Number(row.views) || 0;
    prev.engagementSeconds += Number(row.engagement_seconds) || 0;
    byPath.set(path, prev);
  }
  rollup.pages = [...byPath.values()].sort((a, b) => b.views - a.views).slice(0, 25);

  for (const row of breakdowns) {
    const sessions = Number(row.sessions) || 0;
    const value = row.value == null ? "(unknown)" : String(row.value);
    if (row.dimension === "source") rollup.sources.push({ source: value, sessions });
    else if (row.dimension === "country") rollup.countries.push({ country: value, sessions });
    else if (row.dimension === "device") rollup.devices.push({ category: value, sessions });
  }
  rollup.sources.sort((a, b) => b.sessions - a.sessions);
  rollup.countries.sort((a, b) => b.sessions - a.sessions);
  rollup.devices.sort((a, b) => b.sessions - a.sessions);

  rollup.events = events
    .map((row) => ({ name: String(row.event_name || "(unnamed)"), count: Number(row.count) || 0 }))
    .sort((a, b) => b.count - a.count);

  return rollup;
}
