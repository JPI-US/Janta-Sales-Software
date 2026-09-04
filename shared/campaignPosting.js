export const POST_PLATFORMS = [
  {
    key: "meta",
    label: "Meta",
    color: "#1877F2",
    hint: "Best window: Wednesday or Friday, 11:30 AM–12:00 PM · 1–2× per week",
    defaultWeekday: 3,
    defaultTime: "11:30",
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    color: "#0A66C2",
    hint: "Best window: Tuesday or Thursday, 9:00–10:00 AM · 1–2× per week",
    defaultWeekday: 2,
    defaultTime: "09:00",
  },
];

export const MAX_POSTS_PER_PLATFORM = 2;
export const JANTA_SITE_ORIGIN = "https://jantaus.com";

function pad2(n) {
  return String(n).padStart(2, "0");
}

export function postPlatform(key) {
  return POST_PLATFORMS.find((p) => p.key === key) || null;
}

export function normalizePostTime(value, fallback = "09:00") {
  const m = String(value || fallback).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return fallback;
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const min = Math.min(59, Math.max(0, Number(m[2])));
  return `${pad2(h)}:${pad2(min)}`;
}

export function slugifyTrackPath(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^\/+/, "")
    .replace(/[^a-z0-9/_-]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function normalizeDestinationUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return `${JANTA_SITE_ORIGIN}/`;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      return u.toString();
    } catch {
      return `${JANTA_SITE_ORIGIN}/`;
    }
  }
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return `${JANTA_SITE_ORIGIN}${path}`;
}

export function makeTrackSlug(seed = "") {
  const base = slugifyTrackPath(seed) || "post";
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base}-${suffix}`.slice(0, 64);
}

export function newCampaignPost(platformKey, { destinationUrl, trackSlug } = {}) {
  const platform = postPlatform(platformKey) || POST_PLATFORMS[0];
  const destination = normalizeDestinationUrl(destinationUrl || `${JANTA_SITE_ORIGIN}/`);
  let slugSeed = "";
  try {
    slugSeed = new URL(destination).pathname.replace(/^\/+/, "") || platform.key;
  } catch {
    slugSeed = platform.key;
  }
  return {
    id: `post-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    platform: platform.key,
    weekday: platform.defaultWeekday,
    time: platform.defaultTime,
    destinationUrl: destination,
    trackSlug: trackSlug || makeTrackSlug(slugSeed),
    clicks: 0,
  };
}

export function normalizeCampaignPosts(posts) {
  const counts = { meta: 0, linkedin: 0 };
  const seenSlugs = new Set();
  const out = [];
  for (const raw of Array.isArray(posts) ? posts : []) {
    const platform = raw?.platform === "linkedin" ? "linkedin" : raw?.platform === "meta" ? "meta" : null;
    if (!platform) continue;
    if (counts[platform] >= MAX_POSTS_PER_PLATFORM) continue;
    const weekday = Number(raw.weekday);
    if (!Number.isFinite(weekday) || weekday < 0 || weekday > 6) continue;
    counts[platform] += 1;
    let trackSlug = slugifyTrackPath(raw.trackSlug) || makeTrackSlug(platform);
    while (seenSlugs.has(trackSlug)) trackSlug = makeTrackSlug(trackSlug);
    seenSlugs.add(trackSlug);
    const clicks = Number(raw.clicks);
    out.push({
      id: String(raw.id || `post-${out.length}`).slice(0, 48),
      platform,
      weekday,
      time: normalizePostTime(raw.time, postPlatform(platform).defaultTime),
      destinationUrl: normalizeDestinationUrl(raw.destinationUrl),
      trackSlug,
      clicks: Number.isFinite(clicks) && clicks >= 0 ? Math.round(clicks) : 0,
    });
  }
  return out;
}

export function trackingPathForSlug(slug) {
  const clean = slugifyTrackPath(slug);
  return clean ? `/r/${clean}` : null;
}
