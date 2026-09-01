import {
  MEDIA_CHANNEL_WEBSITE,
  MEDIA_CHANNEL_META,
  setupHintForChannel,
} from "../../shared/mediaMetrics.js";

function gaConfig() {
  const propertyId = String(process.env.GA4_PROPERTY_ID || "").trim();
  const token = String(process.env.GA4_ACCESS_TOKEN || "").trim();
  if (!propertyId || !token) return null;
  return { propertyId, token };
}

export function isWebsiteConfigured() {
  return Boolean(gaConfig());
}

export async function fetchWebsiteChannel({ from, to }) {
  const meta = MEDIA_CHANNEL_META[MEDIA_CHANNEL_WEBSITE];
  if (!isWebsiteConfigured()) {
    return {
      key: MEDIA_CHANNEL_WEBSITE,
      label: meta.label,
      provider: meta.provider,
      accent: meta.accent,
      configured: false,
      live: false,
      demo: false,
      error: null,
      kpis: [],
      trend: [],
      items: [],
      setupHint: setupHintForChannel(MEDIA_CHANNEL_WEBSITE),
    };
  }

  const { propertyId, token } = gaConfig();
  const body = {
    dateRanges: [{ startDate: from.slice(0, 10), endDate: to.slice(0, 10) }],
    metrics: [
      { name: "sessions" },
      { name: "totalUsers" },
      { name: "screenPageViews" },
      { name: "bounceRate" },
    ],
    dimensions: [{ name: "date" }],
  };

  try {
    const res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(errBody || `GA4 request failed (${res.status})`);
    }
    const data = await res.json();
    const rows = data?.rows || [];
    let sessions = 0;
    let users = 0;
    let pageviews = 0;
    let bounceSum = 0;
    const trend = [];

    for (const row of rows) {
      const dateRaw = row.dimensionValues?.[0]?.value || "";
      const date =
        dateRaw.length === 8
          ? `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`
          : dateRaw;
      const daySessions = Number(row.metricValues?.[0]?.value || 0);
      sessions += daySessions;
      users += Number(row.metricValues?.[1]?.value || 0);
      pageviews += Number(row.metricValues?.[2]?.value || 0);
      bounceSum += Number(row.metricValues?.[3]?.value || 0);
      trend.push({ date, label: date.slice(5), value: daySessions });
    }

    const bounceRate = rows.length ? (bounceSum / rows.length) * 100 : 0;

    const pagesBody = {
      dateRanges: [{ startDate: from.slice(0, 10), endDate: to.slice(0, 10) }],
      metrics: [{ name: "screenPageViews" }, { name: "averageSessionDuration" }],
      dimensions: [{ name: "pagePath" }],
      limit: 5,
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
    };
    const pagesRes = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(pagesBody),
      }
    );
    const pagesData = pagesRes.ok ? await pagesRes.json() : { rows: [] };

    return {
      key: MEDIA_CHANNEL_WEBSITE,
      label: meta.label,
      provider: "Google Analytics 4",
      accent: meta.accent,
      configured: true,
      live: true,
      demo: false,
      error: null,
      kpis: [
        { key: "sessions", label: "Sessions", value: sessions },
        { key: "users", label: "Users", value: users },
        { key: "pageviews", label: "Pageviews", value: pageviews },
        { key: "bounceRate", label: "Bounce rate", value: bounceRate, format: "percent" },
      ],
      trend,
      items: (pagesData.rows || []).map((row) => ({
        title: row.dimensionValues?.[0]?.value || "/",
        metric: `${Number(row.metricValues?.[0]?.value || 0).toLocaleString()} views`,
        secondary: `${Math.round(Number(row.metricValues?.[1]?.value || 0))}s avg`,
      })),
      setupHint: null,
    };
  } catch (err) {
    return {
      key: MEDIA_CHANNEL_WEBSITE,
      label: meta.label,
      provider: meta.provider,
      accent: meta.accent,
      configured: true,
      live: false,
      demo: false,
      error: err.message || "Could not load GA4 data",
      kpis: [],
      trend: [],
      items: [],
      setupHint: setupHintForChannel(MEDIA_CHANNEL_WEBSITE),
    };
  }
}
