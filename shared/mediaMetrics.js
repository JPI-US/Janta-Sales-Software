export const MEDIA_CHANNEL_EMAIL = "email";
export const MEDIA_CHANNEL_WEBSITE = "website";
export const MEDIA_CHANNEL_INSTAGRAM = "instagram";
export const MEDIA_CHANNEL_LINKEDIN = "linkedin";

export const MEDIA_CHANNEL_ORDER = [
  MEDIA_CHANNEL_EMAIL,
  MEDIA_CHANNEL_WEBSITE,
  MEDIA_CHANNEL_INSTAGRAM,
  MEDIA_CHANNEL_LINKEDIN,
];

export const MEDIA_CHANNEL_META = {
  [MEDIA_CHANNEL_EMAIL]: {
    key: MEDIA_CHANNEL_EMAIL,
    label: "Email campaigns",
    shortLabel: "Email",
    provider: "Mailchimp / HubSpot",
    accent: "#E07A5F",
  },
  [MEDIA_CHANNEL_WEBSITE]: {
    key: MEDIA_CHANNEL_WEBSITE,
    label: "jantaus.com",
    shortLabel: "Website",
    provider: "Google Analytics · jantaus.com",
    accent: "#2A9D8F",
  },
  [MEDIA_CHANNEL_INSTAGRAM]: {
    key: MEDIA_CHANNEL_INSTAGRAM,
    label: "Instagram / Meta",
    shortLabel: "Instagram",
    provider: "Meta Graph API",
    accent: "#C13584",
  },
  [MEDIA_CHANNEL_LINKEDIN]: {
    key: MEDIA_CHANNEL_LINKEDIN,
    label: "LinkedIn",
    shortLabel: "LinkedIn",
    provider: "LinkedIn Marketing",
    accent: "#0A66C2",
  },
};

const MS_PER_DAY = 86400000;

export function getMediaPeriod(date = new Date(), { days = 30 } = {}) {
  const end = startOfDayUtc(date);
  const start = new Date(end.getTime() - (Math.max(1, days) - 1) * MS_PER_DAY);
  return {
    days,
    from: start.toISOString(),
    to: new Date(end.getTime() + MS_PER_DAY - 1).toISOString(),
    label: `Last ${days} days`,
  };
}

function startOfDayUtc(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
}

function listDaysInPeriod(fromIso, toIso) {
  const from = startOfDayUtc(fromIso);
  const to = startOfDayUtc(toIso);
  const keys = [];
  let cur = from.getTime();
  const end = to.getTime();
  while (cur <= end) {
    keys.push(new Date(cur).toISOString().slice(0, 10));
    cur += MS_PER_DAY;
  }
  return keys;
}

export function formatMediaNumber(value) {
  if (value == null || !Number.isFinite(value)) return "—";
  const n = Number(value);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(Math.round(n));
}

export function formatMediaPercent(value, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Number(value).toFixed(digits)}%`;
}

function seededNoise(seed, i) {
  const x = Math.sin(seed * 999 + i * 77.7) * 10000;
  return x - Math.floor(x);
}

function buildTrend(from, to, seed, base, variance = 0.22) {
  const days = listDaysInPeriod(from, to);
  return days.map((date, i) => {
    const wave = Math.sin((i / Math.max(days.length - 1, 1)) * Math.PI * 1.4 + seed);
    const jitter = seededNoise(seed, i) * variance;
    const value = Math.max(0, Math.round(base * (0.72 + wave * 0.18 + jitter)));
    return { date, label: date.slice(5), value };
  });
}

function demoKpis(channelKey) {
  const presets = {
    [MEDIA_CHANNEL_EMAIL]: [
      { key: "sent", label: "Emails sent", value: 24800 },
      { key: "opens", label: "Opens", value: 9120 },
      { key: "clicks", label: "Clicks", value: 1840 },
      { key: "openRate", label: "Open rate", value: 36.8, format: "percent" },
    ],
    [MEDIA_CHANNEL_WEBSITE]: [
      { key: "sessions", label: "Sessions", value: 14200 },
      { key: "users", label: "Users", value: 10850 },
      { key: "pageviews", label: "Pageviews", value: 38900 },
      { key: "bounceRate", label: "Bounce rate", value: 41.2, format: "percent" },
    ],
    [MEDIA_CHANNEL_INSTAGRAM]: [
      { key: "reach", label: "Reach", value: 52400 },
      { key: "impressions", label: "Impressions", value: 81200 },
      { key: "engagement", label: "Engagement", value: 4280 },
      { key: "followers", label: "Followers", value: 3180 },
    ],
    [MEDIA_CHANNEL_LINKEDIN]: [
      { key: "impressions", label: "Impressions", value: 28600 },
      { key: "clicks", label: "Clicks", value: 920 },
      { key: "engagement", label: "Engagement", value: 1640 },
      { key: "followers", label: "Followers", value: 5420 },
    ],
  };
  return presets[channelKey] || [];
}

function demoItems(channelKey) {
  const presets = {
    [MEDIA_CHANNEL_EMAIL]: [
      { title: "Q3 utility pipeline update", metric: "38.2% open", secondary: "412 clicks" },
      { title: "Commercial solar case study", metric: "31.5% open", secondary: "286 clicks" },
      { title: "Texas ITC reminder", metric: "29.1% open", secondary: "198 clicks" },
    ],
    [MEDIA_CHANNEL_WEBSITE]: [
      { title: "jantaus.com/", metric: "4,820 views", secondary: "2:14 avg time" },
      { title: "jantaus.com/contact", metric: "980 views", secondary: "18% conv. rate" },
      { title: "Home — More Power. Less Land.", metric: "3,140 views", secondary: "3:02 avg time" },
    ],
    [MEDIA_CHANNEL_INSTAGRAM]: [
      { title: "Tower install timelapse", metric: "12.4K reach", secondary: "842 likes" },
      { title: "Team site visit reel", metric: "9.8K reach", secondary: "612 likes" },
      { title: "Customer testimonial", metric: "6.1K reach", secondary: "388 likes" },
    ],
    [MEDIA_CHANNEL_LINKEDIN]: [
      { title: "Large utility RFP insights", metric: "8.2K impressions", secondary: "96 reactions" },
      { title: "Janta project milestone", metric: "5.4K impressions", secondary: "74 reactions" },
      { title: "Hiring: project engineer", metric: "3.1K impressions", secondary: "41 reactions" },
    ],
  };
  return presets[channelKey] || [];
}

export function buildDemoChannel(channelKey, period) {
  const meta = MEDIA_CHANNEL_META[channelKey];
  const seed = channelKey.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
  const kpis = demoKpis(channelKey);
  const primary = kpis[0]?.value || 1000;
  return {
    key: channelKey,
    label: meta.label,
    provider: meta.provider,
    accent: meta.accent,
    configured: false,
    live: false,
    demo: true,
    error: null,
    kpis,
    trend: buildTrend(period.from, period.to, seed, primary / 14),
    items: demoItems(channelKey),
    setupHint: setupHintForChannel(channelKey),
  };
}

export function setupHintForChannel(channelKey) {
  const hints = {
    [MEDIA_CHANNEL_EMAIL]: "Set MAILCHIMP_API_KEY and MAILCHIMP_SERVER_PREFIX in .env",
    [MEDIA_CHANNEL_WEBSITE]: "Set GA4_PROPERTY_ID and GA4_ACCESS_TOKEN in .env",
    [MEDIA_CHANNEL_INSTAGRAM]: "Set META_ACCESS_TOKEN and META_IG_ACCOUNT_ID in .env",
    [MEDIA_CHANNEL_LINKEDIN]: "Set LINKEDIN_ACCESS_TOKEN and LINKEDIN_ORG_ID in .env",
  };
  return hints[channelKey] || "Add API credentials to .env";
}

export function buildDemoMediaOverview(period) {
  const channels = Object.fromEntries(
    MEDIA_CHANNEL_ORDER.map((key) => [key, buildDemoChannel(key, period)])
  );
  return {
    period,
    channels,
    summary: summarizeMediaOverview(channels),
    anyLive: false,
    anyDemo: true,
  };
}

export function summarizeMediaOverview(channels) {
  const email = channels[MEDIA_CHANNEL_EMAIL];
  const website = channels[MEDIA_CHANNEL_WEBSITE];
  const instagram = channels[MEDIA_CHANNEL_INSTAGRAM];
  const linkedin = channels[MEDIA_CHANNEL_LINKEDIN];

  const kpi = (channel, key) => channel?.kpis?.find((row) => row.key === key)?.value ?? 0;

  return {
    totalReach:
      kpi(instagram, "reach") + kpi(linkedin, "impressions") + kpi(email, "sent"),
    totalClicks: kpi(email, "clicks") + kpi(linkedin, "clicks") + kpi(website, "sessions"),
    totalSessions: kpi(website, "sessions"),
    totalEngagement: kpi(instagram, "engagement") + kpi(linkedin, "engagement"),
  };
}

export function mergeChannelWithDemo(channelKey, period, liveChannel) {
  if (liveChannel?.live) return liveChannel;
  const demo = buildDemoChannel(channelKey, period);
  if (!liveChannel) return demo;
  return {
    ...demo,
    configured: liveChannel.configured,
    error: liveChannel.error,
    setupHint: liveChannel.setupHint || demo.setupHint,
    demo: !liveChannel.live,
  };
}
