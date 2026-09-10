/**
 * jantaus.com traffic for the Media Dashboard.
 *
 * Reads the local rollups written by server/analytics/collectGa4.mjs rather than
 * calling a Google API at request time. Two reasons: BigQuery queries take
 * seconds and scan billable bytes, so a dashboard that queried it per page load
 * would be both slow and wasteful; and the local rollups keep history long past
 * GA4's 14-month UI limit.
 */
import {
  MEDIA_CHANNEL_WEBSITE,
  MEDIA_CHANNEL_META,
  setupHintForChannel,
} from "../../shared/mediaMetrics.js";
import { datesInRange, aggregateRollups } from "../../shared/analyticsRollup.js";
import { analyticsDir, readDaysInRange, readState } from "../analytics/rollupStore.js";

const meta = () => MEDIA_CHANNEL_META[MEDIA_CHANNEL_WEBSITE];

export function isWebsiteConfigured() {
  return Boolean(
    String(process.env.GA4_BQ_PROJECT_ID || "").trim() && String(process.env.GA4_BQ_DATASET || "").trim()
  );
}

function baseChannel(extra = {}) {
  const m = meta();
  return {
    key: MEDIA_CHANNEL_WEBSITE,
    label: m.label,
    provider: "Google Analytics 4 · BigQuery",
    accent: m.accent,
    configured: false,
    live: false,
    demo: false,
    error: null,
    kpis: [],
    trend: [],
    items: [],
    setupHint: null,
    ...extra,
  };
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

export async function fetchWebsiteChannel({ from, to }) {
  if (!isWebsiteConfigured()) {
    return baseChannel({ setupHint: setupHintForChannel(MEDIA_CHANNEL_WEBSITE) });
  }

  try {
    const dir = analyticsDir();
    const dates = datesInRange(from, to);
    const days = readDaysInRange(dir, dates);

    if (!days.length) {
      // Configured but nothing collected yet -- surface why rather than showing zeros.
      const state = readState(dir);
      const reason = state.lastError
        ? `Last collection failed: ${state.lastError}`
        : state.lastCollectedDate
          ? `No data in this range. Collected up to ${state.lastCollectedDate}.`
          : "Waiting for the first GA4 BigQuery export (about 24h after the tag goes live).";
      return baseChannel({ configured: true, error: reason, setupHint: null });
    }

    const summary = aggregateRollups(days);
    const { totals } = summary;

    return baseChannel({
      configured: true,
      live: true,
      kpis: [
        { key: "sessions", label: "Sessions", value: totals.sessions },
        { key: "users", label: "Users", value: totals.users },
        { key: "pageviews", label: "Pageviews", value: totals.pageviews },
        { key: "bounceRate", label: "Bounce rate", value: round(totals.bounceRate), format: "percent" },
      ],
      trend: summary.trend,
      items: summary.pages.map((page) => ({
        title: page.path,
        metric: `${page.views.toLocaleString()} views`,
        secondary: `${Math.round(page.avgEngagementSeconds)}s avg`,
      })),
    });
  } catch (err) {
    return baseChannel({
      configured: true,
      error: err.message || "Could not read website analytics",
      setupHint: setupHintForChannel(MEDIA_CHANNEL_WEBSITE),
    });
  }
}
