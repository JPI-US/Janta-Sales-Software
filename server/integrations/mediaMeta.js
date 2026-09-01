import {
  MEDIA_CHANNEL_INSTAGRAM,
  MEDIA_CHANNEL_META,
  setupHintForChannel,
} from "../../shared/mediaMetrics.js";

function metaConfig() {
  const token = String(process.env.META_ACCESS_TOKEN || "").trim();
  const igId = String(process.env.META_IG_ACCOUNT_ID || "").trim();
  if (!token || !igId) return null;
  return { token, igId };
}

export function isInstagramConfigured() {
  return Boolean(metaConfig());
}

export async function fetchInstagramChannel({ from, to }) {
  const meta = MEDIA_CHANNEL_META[MEDIA_CHANNEL_INSTAGRAM];
  if (!isInstagramConfigured()) {
    return {
      key: MEDIA_CHANNEL_INSTAGRAM,
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
      setupHint: setupHintForChannel(MEDIA_CHANNEL_INSTAGRAM),
    };
  }

  const { token, igId } = metaConfig();
  const since = Math.floor(new Date(from).getTime() / 1000);
  const until = Math.floor(new Date(to).getTime() / 1000);
  const params = new URLSearchParams({
    metric: "impressions,reach,profile_views",
    period: "day",
    since: String(since),
    until: String(until),
    access_token: token,
  });

  try {
    const insightsRes = await fetch(
      `https://graph.facebook.com/v19.0/${igId}/insights?${params.toString()}`
    );
    if (!insightsRes.ok) {
      const errBody = await insightsRes.text().catch(() => "");
      throw new Error(errBody || `Meta insights failed (${insightsRes.status})`);
    }
    const insights = await insightsRes.json();
    const byMetric = Object.fromEntries(
      (insights.data || []).map((row) => [row.name, row.values || []])
    );

    const sumMetric = (name) =>
      (byMetric[name] || []).reduce((s, pt) => s + Number(pt.value || 0), 0);

    const impressions = sumMetric("impressions");
    const reach = sumMetric("reach");
    const profileViews = sumMetric("profile_views");

    const profileRes = await fetch(
      `https://graph.facebook.com/v19.0/${igId}?fields=followers_count,media.limit(5){caption,like_count,comments_count,insights.metric(impressions,reach)}&access_token=${token}`
    );
    const profile = profileRes.ok ? await profileRes.json() : { media: { data: [] } };
    const followers = profile.followers_count || 0;
    const media = profile.media?.data || [];
    let engagement = 0;
    for (const post of media) {
      engagement += (post.like_count || 0) + (post.comments_count || 0);
    }

    const trendDates = (byMetric.impressions || byMetric.reach || []).map((pt) => ({
      date: pt.end_time?.slice(0, 10) || "",
      label: pt.end_time?.slice(5, 10) || "",
      value: Number(pt.value || 0),
    }));

    return {
      key: MEDIA_CHANNEL_INSTAGRAM,
      label: meta.label,
      provider: "Meta",
      accent: meta.accent,
      configured: true,
      live: true,
      demo: false,
      error: null,
      kpis: [
        { key: "reach", label: "Reach", value: reach },
        { key: "impressions", label: "Impressions", value: impressions },
        { key: "engagement", label: "Engagement", value: engagement },
        { key: "followers", label: "Followers", value: followers },
        { key: "profileViews", label: "Profile views", value: profileViews },
      ],
      trend: trendDates,
      items: media.slice(0, 5).map((post) => ({
        title: (post.caption || "Post").slice(0, 60),
        metric: `${(post.like_count || 0).toLocaleString()} likes`,
        secondary: `${post.comments_count || 0} comments`,
      })),
      setupHint: null,
    };
  } catch (err) {
    return {
      key: MEDIA_CHANNEL_INSTAGRAM,
      label: meta.label,
      provider: meta.provider,
      accent: meta.accent,
      configured: true,
      live: false,
      demo: false,
      error: err.message || "Could not load Meta data",
      kpis: [],
      trend: [],
      items: [],
      setupHint: setupHintForChannel(MEDIA_CHANNEL_INSTAGRAM),
    };
  }
}
