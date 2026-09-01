import {
  MEDIA_CHANNEL_LINKEDIN,
  MEDIA_CHANNEL_META,
  setupHintForChannel,
} from "../../shared/mediaMetrics.js";

function linkedInConfig() {
  const token = String(process.env.LINKEDIN_ACCESS_TOKEN || "").trim();
  const orgId = String(process.env.LINKEDIN_ORG_ID || "").trim();
  if (!token || !orgId) return null;
  return { token, orgId };
}

export function isLinkedInConfigured() {
  return Boolean(linkedInConfig());
}

export async function fetchLinkedInChannel({ from, to }) {
  const meta = MEDIA_CHANNEL_META[MEDIA_CHANNEL_LINKEDIN];
  if (!isLinkedInConfigured()) {
    return {
      key: MEDIA_CHANNEL_LINKEDIN,
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
      setupHint: setupHintForChannel(MEDIA_CHANNEL_LINKEDIN),
    };
  }

  const { token, orgId } = linkedInConfig();
  const orgUrn = encodeURIComponent(`urn:li:organization:${orgId}`);
  const startMs = new Date(from).getTime();
  const endMs = new Date(to).getTime();

  try {
    const statsUrl = `https://api.linkedin.com/v2/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${orgUrn}&timeIntervals.timeGranularityType=DAY&timeIntervals.timeRange.start=${startMs}&timeIntervals.timeRange.end=${endMs}`;
    const statsRes = await fetch(statsUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Restli-Protocol-Version": "2.0.0",
      },
    });
    if (!statsRes.ok) {
      const errBody = await statsRes.text().catch(() => "");
      throw new Error(errBody || `LinkedIn stats failed (${statsRes.status})`);
    }
    const statsData = await statsRes.json();
    const elements = statsData.elements || [];

    let impressions = 0;
    let clicks = 0;
    let engagement = 0;
    const trend = [];

    for (const el of elements) {
      const total = el.totalShareStatistics || {};
      impressions += total.impressionCount || 0;
      clicks += total.clickCount || 0;
      engagement += total.likeCount || 0;
      engagement += total.commentCount || 0;
      engagement += total.shareCount || 0;
      if (el.timeRange?.start != null) {
        trend.push({
          date: new Date(el.timeRange.start).toISOString().slice(0, 10),
          label: new Date(el.timeRange.start).toISOString().slice(5, 10),
          value: total.impressionCount || 0,
        });
      }
    }

    const followerRes = await fetch(
      `https://api.linkedin.com/v2/organizationalEntityFollowerStatistics?q=organizationalEntity&organizationalEntity=${orgUrn}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Restli-Protocol-Version": "2.0.0",
        },
      }
    );
    let followers = 0;
    if (followerRes.ok) {
      const followerData = await followerRes.json();
      followers = followerData.elements?.[0]?.followerCounts?.organicFollowerCount || 0;
    }

    return {
      key: MEDIA_CHANNEL_LINKEDIN,
      label: meta.label,
      provider: "LinkedIn",
      accent: meta.accent,
      configured: true,
      live: true,
      demo: false,
      error: null,
      kpis: [
        { key: "impressions", label: "Impressions", value: impressions },
        { key: "clicks", label: "Clicks", value: clicks },
        { key: "engagement", label: "Engagement", value: engagement },
        { key: "followers", label: "Followers", value: followers },
      ],
      trend,
      items: [],
      setupHint: null,
    };
  } catch (err) {
    return {
      key: MEDIA_CHANNEL_LINKEDIN,
      label: meta.label,
      provider: meta.provider,
      accent: meta.accent,
      configured: true,
      live: false,
      demo: false,
      error: err.message || "Could not load LinkedIn data",
      kpis: [],
      trend: [],
      items: [],
      setupHint: setupHintForChannel(MEDIA_CHANNEL_LINKEDIN),
    };
  }
}
