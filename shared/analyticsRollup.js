/**
 * Shape of the daily website-analytics rollups written by
 * server/analytics/collectGa4.mjs and read by server/integrations/mediaWebsite.js.
 *
 * One file per month so a year of history is 12 small files:
 *   { month: "2026-09", days: { "2026-09-11": <DayRollup>, ... } }
 *
 * A DayRollup is deliberately a superset of what the dashboard renders today --
 * the raw events stay in BigQuery, so rollups can always be rebuilt with more
 * fields, but only for dates the collector has run over.
 */

export const ROLLUP_VERSION = 1;

export function emptyDayRollup(date) {
  return {
    v: ROLLUP_VERSION,
    date,
    totals: {
      sessions: 0,
      users: 0,
      pageviews: 0,
      engagedSessions: 0,
      engagementSeconds: 0,
    },
    pages: [],
    sources: [],
    countries: [],
    devices: [],
    events: [],
  };
}

export function monthKeyFor(date) {
  return String(date).slice(0, 7);
}

/** Inclusive list of YYYY-MM-DD strings between two ISO dates. */
export function datesInRange(from, to) {
  const start = new Date(`${String(from).slice(0, 10)}T00:00:00Z`);
  const end = new Date(`${String(to).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  const out = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    out.push(new Date(t).toISOString().slice(0, 10));
    if (out.length > 800) break; // guard against a bad range
  }
  return out;
}

function addInto(map, key, amount) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + (Number(amount) || 0));
}

function topN(map, valueKey, n, extra = null) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, value]) => {
      const row = { [valueKey]: value };
      if (extra) Object.assign(row, extra(key, value));
      return row;
    });
}

/**
 * Folds a list of day rollups into one period summary.
 *
 * Sessions and users are summed across days. Daily unique users double-count
 * anyone visiting on more than one day, so this is "daily users summed", not
 * distinct users over the period -- computing the latter needs the raw events.
 */
export function aggregateRollups(days) {
  const rows = (days || []).filter(Boolean);
  const totals = { sessions: 0, users: 0, pageviews: 0, engagedSessions: 0, engagementSeconds: 0 };
  const pageViews = new Map();
  const pageSeconds = new Map();
  const sources = new Map();
  const countries = new Map();
  const devices = new Map();
  const events = new Map();
  const trend = [];

  for (const day of rows) {
    for (const key of Object.keys(totals)) totals[key] += Number(day.totals?.[key]) || 0;
    for (const p of day.pages || []) {
      addInto(pageViews, p.path, p.views);
      addInto(pageSeconds, p.path, p.engagementSeconds);
    }
    for (const s of day.sources || []) addInto(sources, s.source, s.sessions);
    for (const c of day.countries || []) addInto(countries, c.country, c.sessions);
    for (const d of day.devices || []) addInto(devices, d.category, d.sessions);
    for (const e of day.events || []) addInto(events, e.name, e.count);
    trend.push({
      date: day.date,
      label: String(day.date).slice(5),
      value: Number(day.totals?.sessions) || 0,
    });
  }

  trend.sort((a, b) => (a.date < b.date ? -1 : 1));

  // GA4 reports bounce rate as the inverse of engagement rate.
  const bounceRate = totals.sessions ? (1 - totals.engagedSessions / totals.sessions) * 100 : 0;
  const avgEngagementSeconds = totals.sessions ? totals.engagementSeconds / totals.sessions : 0;

  return {
    days: rows.length,
    totals: { ...totals, bounceRate, avgEngagementSeconds },
    trend,
    pages: topN(pageViews, "views", 5, (path) => ({
      path,
      avgEngagementSeconds: pageViews.get(path) ? (pageSeconds.get(path) || 0) / pageViews.get(path) : 0,
    })),
    sources: topN(sources, "sessions", 10, (source) => ({ source })),
    countries: topN(countries, "sessions", 10, (country) => ({ country })),
    devices: topN(devices, "sessions", 5, (category) => ({ category })),
    events: topN(events, "count", 15, (name) => ({ name })),
  };
}
