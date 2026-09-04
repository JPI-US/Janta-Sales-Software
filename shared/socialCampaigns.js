import {
  JANTA_SITE_ORIGIN,
  slugifyTrackPath,
  trackingPathForSlug,
} from "./campaignPosting.js";

export const SOCIAL_CAMPAIGN_STATUSES = ["draft", "active", "paused", "completed"];
export const SOCIAL_CAMPAIGN_GOALS = [
  {
    id: "visits",
    label: "Visits / traction",
    hint: "Tracking link sends people to jantaus.com homepage. Counts site visits from your posts.",
  },
  {
    id: "conversions",
    label: "Conversions",
    hint: "Tracking link sends people straight to your social meeting booking page. A booked meeting is a conversion.",
  },
];

function newId(prefix = "soc-") {
  return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function ymd(value) {
  const s = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
}

function count(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

export function slugFromCampaignName(name) {
  return slugifyTrackPath(name).replace(/\//g, "-").slice(0, 64) || "campaign";
}

/** Unique track slug from name; prefers existing slug when still available. */
export function resolveCampaignTrackSlug(name, existingSlug, usedSlugs = []) {
  const preferred = slugFromCampaignName(name);
  const existing = slugifyTrackPath(existingSlug).replace(/\//g, "-");
  const taken = new Set((usedSlugs || []).filter(Boolean));

  if (preferred && !taken.has(preferred)) return preferred;
  if (existing && !taken.has(existing)) return existing;

  let slug = preferred || "campaign";
  let i = 2;
  while (taken.has(slug)) {
    slug = `${preferred || "campaign"}-${i}`.slice(0, 64);
    i += 1;
  }
  return slug;
}

export function emptySocialCampaign() {
  const today = new Date();
  const start = today.toISOString().slice(0, 10);
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + 27);
  return {
    name: "",
    goal: "visits",
    platforms: ["meta", "linkedin"],
    startDate: start,
    endDate: endDate.toISOString().slice(0, 10),
    budget: 0,
    valueProp: "",
    status: "draft",
    trackSlug: "",
    stats: { clicks: 0, meetings: 0 },
  };
}

function legacyClicksFromPosts(posts) {
  if (!Array.isArray(posts)) return 0;
  return posts.reduce((sum, p) => sum + (Number(p.clicks) || 0), 0);
}

function legacySlugFromPosts(posts, name) {
  const first = Array.isArray(posts) ? posts.find((p) => p?.trackSlug) : null;
  if (first?.trackSlug) return slugifyTrackPath(first.trackSlug).replace(/\//g, "-");
  return slugFromCampaignName(name);
}

export function normalizeSocialCampaign(body = {}, existing = null, { usedSlugs = [] } = {}) {
  const now = new Date().toISOString();
  const name = String(body.name ?? existing?.name ?? "Untitled social campaign").slice(0, 120);
  const platforms = Array.isArray(body.platforms)
    ? [...new Set(body.platforms.map(String).filter((p) => p === "meta" || p === "linkedin"))].slice(0, 2)
    : Array.isArray(existing?.platforms)
      ? existing.platforms
      : ["meta", "linkedin"];
  const statsIn = body.stats && typeof body.stats === "object" ? body.stats : existing?.stats || {};
  const goal = body.goal === "conversions" || existing?.goal === "conversions" ? "conversions" : "visits";
  const legacyPosts = body.posts ?? existing?.posts;
  const trackSlug = resolveCampaignTrackSlug(
    name,
    body.trackSlug || existing?.trackSlug || legacySlugFromPosts(legacyPosts, name),
    usedSlugs,
  );
  const trackedClicks = Math.max(count(statsIn.clicks), legacyClicksFromPosts(legacyPosts));

  return {
    id: existing?.id || body.id || newId(),
    name,
    goal,
    platforms: platforms.length ? platforms : ["meta", "linkedin"],
    startDate: ymd(body.startDate) || ymd(existing?.startDate) || ymd(now),
    endDate: ymd(body.endDate) || ymd(existing?.endDate) || ymd(now),
    budget: money(body.budget ?? existing?.budget),
    valueProp: String(body.valueProp ?? existing?.valueProp ?? "").slice(0, 800),
    status: SOCIAL_CAMPAIGN_STATUSES.includes(body.status)
      ? body.status
      : existing?.status || "draft",
    trackSlug,
    stats: {
      clicks: trackedClicks,
      meetings: count(statsIn.meetings ?? statsIn.leads),
    },
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function campaignPublicPath(campaign) {
  const slug = slugifyTrackPath(campaign?.trackSlug || slugFromCampaignName(campaign?.name));
  return trackingPathForSlug(slug);
}

export function campaignTrackingUrl(campaign, origin) {
  const path = campaignPublicPath(campaign);
  if (!path) return "";
  const base = origin || (typeof window !== "undefined" ? window.location.origin : "");
  return base ? `${String(base).replace(/\/$/, "")}${path}` : path;
}

/** Where the tracking link sends people, based on goal. */
export function campaignDestinationUrl(campaign, meetingLinks = {}) {
  if (campaign?.goal === "conversions") {
    const booking = String(meetingLinks?.social || "").trim();
    if (booking) return booking;
    return `${JANTA_SITE_ORIGIN}/contact`;
  }
  return `${JANTA_SITE_ORIGIN}/`;
}

/** Friendly path label, e.g. jantaus.com/agriculture */
export function campaignThemePathLabel(campaign) {
  const slug = slugifyTrackPath(campaign?.trackSlug || slugFromCampaignName(campaign?.name)).replace(/\//g, "-");
  return slug ? `jantaus.com/${slug}` : "jantaus.com";
}

export function liveCampaignStats(campaign, meetingCount = 0) {
  return {
    clicks: count(campaign?.stats?.clicks),
    meetings: Math.max(count(campaign?.stats?.meetings), count(meetingCount)),
    goal: campaign?.goal === "conversions" ? "conversions" : "visits",
  };
}

export { JANTA_SITE_ORIGIN };
