import {
  MEDIA_CHANNEL_EMAIL,
  MEDIA_CHANNEL_META,
  setupHintForChannel,
} from "../../shared/mediaMetrics.js";

function mailchimpConfig() {
  const apiKey = String(process.env.MAILCHIMP_API_KEY || "").trim();
  if (!apiKey) return null;
  const dc =
    String(process.env.MAILCHIMP_SERVER_PREFIX || "").trim() ||
    (apiKey.includes("-") ? apiKey.split("-").pop() : "");
  if (!dc) return null;
  return { apiKey, dc };
}

async function mailchimpFetch(path) {
  const cfg = mailchimpConfig();
  if (!cfg) return null;
  const res = await fetch(`https://${cfg.dc}.api.mailchimp.com/3.0${path}`, {
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body || `Mailchimp request failed (${res.status})`);
  }
  return res.json();
}

function inRange(iso, from, to) {
  const t = new Date(iso).getTime();
  return t >= new Date(from).getTime() && t <= new Date(to).getTime();
}

function mergeStudioCampaigns(channel, studioCampaigns, { from, to }) {
  const rows = (studioCampaigns || []).filter((c) => inRange(c.copiedAt, from, to));
  if (!rows.length) return channel;

  const studioCount = rows.length;
  const byDay = new Map();
  for (const row of rows) {
    const day = String(row.copiedAt || "").slice(0, 10);
    byDay.set(day, (byDay.get(day) || 0) + 1);
  }
  const studioTrend = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, label: date.slice(5), value }));

  const studioItems = rows.slice(0, 5).map((r) => ({
    title: r.title || "Email",
    metric: "Copied to send",
    secondary: new Date(r.copiedAt).toLocaleDateString(),
  }));

  const baseKpis = channel.kpis || [];
  const sentKpi = baseKpis.find((k) => k.key === "sent");
  const sentValue = (sentKpi?.value || 0) + studioCount;

  const mergedKpis = [
    { key: "sent", label: "Emails sent / copied", value: sentValue },
    ...baseKpis.filter((k) => k.key !== "sent"),
    { key: "studioCopies", label: "Studio copies", value: studioCount },
  ];

  const mergedTrend = [...(channel.trend || []), ...studioTrend].sort((a, b) =>
    String(a.date).localeCompare(String(b.date))
  );

  const provider = channel.live
    ? `${channel.provider} + Email Studio`
    : "Email Studio";

  return {
    ...channel,
    configured: true,
    live: true,
    demo: false,
    provider,
    kpis: mergedKpis,
    trend: mergedTrend.length ? mergedTrend : studioTrend,
    items: [...studioItems, ...(channel.items || [])].slice(0, 6),
    setupHint: channel.setupHint,
  };
}

export function isEmailConfigured() {
  return Boolean(mailchimpConfig());
}

export async function fetchEmailChannel({ from, to, studioCampaigns = [] }) {
  const meta = MEDIA_CHANNEL_META[MEDIA_CHANNEL_EMAIL];
  const empty = {
    key: MEDIA_CHANNEL_EMAIL,
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
    setupHint: setupHintForChannel(MEDIA_CHANNEL_EMAIL),
  };

  let channel = empty;

  if (isEmailConfigured()) {
    try {
      const data = await mailchimpFetch("/reports?count=50");
      const reports = (data?.reports || []).filter((r) => inRange(r.send_time, from, to));
      let sent = 0;
      let opens = 0;
      let clicks = 0;
      for (const r of reports) {
        sent += r.emails_sent || 0;
        opens += r.opens || 0;
        clicks += r.clicks || 0;
      }
      const openRate = sent > 0 ? (opens / sent) * 100 : 0;
      const clickRate = sent > 0 ? (clicks / sent) * 100 : 0;

      channel = {
        key: MEDIA_CHANNEL_EMAIL,
        label: meta.label,
        provider: "Mailchimp",
        accent: meta.accent,
        configured: true,
        live: reports.length > 0,
        demo: false,
        error: null,
        kpis: [
          { key: "sent", label: "Emails sent", value: sent },
          { key: "opens", label: "Opens", value: opens },
          { key: "clicks", label: "Clicks", value: clicks },
          { key: "openRate", label: "Open rate", value: openRate, format: "percent" },
          { key: "clickRate", label: "Click rate", value: clickRate, format: "percent" },
        ],
        trend: reports.slice(0, 14).map((r) => ({
          date: String(r.send_time || "").slice(0, 10),
          label: String(r.campaign_title || "Campaign").slice(0, 12),
          value: r.emails_sent || 0,
        })),
        items: reports.slice(0, 5).map((r) => ({
          title: r.campaign_title || "Campaign",
          metric: `${((r.open_rate || 0) * 100).toFixed(1)}% open`,
          secondary: `${r.clicks || 0} clicks`,
        })),
        setupHint: null,
      };
    } catch (err) {
      channel = {
        ...empty,
        configured: true,
        error: err.message || "Could not load Mailchimp data",
      };
    }
  }

  return mergeStudioCampaigns(channel, studioCampaigns, { from, to });
}
