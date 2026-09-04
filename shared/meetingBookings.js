/** Conversion = booked meeting. Per-channel booking links feed one combined marketing total. */

export const MEETING_CHANNELS = [
  { id: "email", label: "Email", hint: "Paste this link in email CTAs and nurture sequences." },
  { id: "social", label: "Social", hint: "Paste this link in LinkedIn / Meta posts and ads." },
  { id: "website", label: "Website", hint: "Use on jantaus.com contact / CTA pages." },
];

export const MEETING_CHANNEL_IDS = MEETING_CHANNELS.map((c) => c.id);

function newId(prefix = "mtg-") {
  return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function cleanUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\/.+/i.test(raw)) return raw.slice(0, 500);
  return "";
}

function count(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

export function emptyMeetingSettings() {
  return {
    meetingLinks: { email: "", social: "", website: "" },
    meetings: { email: 0, social: 0, website: 0 },
    recent: [],
  };
}

export function normalizeMeetingSettings(body = {}, existing = null) {
  const base = existing || emptyMeetingSettings();
  const linksIn = body.meetingLinks && typeof body.meetingLinks === "object" ? body.meetingLinks : {};
  const meetingsIn = body.meetings && typeof body.meetings === "object" ? body.meetings : {};
  return {
    meetingLinks: {
      email: cleanUrl(linksIn.email ?? base.meetingLinks?.email),
      social: cleanUrl(linksIn.social ?? base.meetingLinks?.social),
      website: cleanUrl(linksIn.website ?? base.meetingLinks?.website),
    },
    meetings: {
      email: count(meetingsIn.email ?? base.meetings?.email),
      social: count(meetingsIn.social ?? base.meetings?.social),
      website: count(meetingsIn.website ?? base.meetings?.website),
    },
    recent: Array.isArray(body.recent)
      ? body.recent.slice(0, 50)
      : Array.isArray(base.recent)
        ? base.recent.slice(0, 50)
        : [],
    updatedAt: new Date().toISOString(),
  };
}

export function bookingPathForChannel(channel, { campaignId } = {}) {
  const id = MEETING_CHANNEL_IDS.includes(channel) ? channel : "website";
  const path = `/book/${id}`;
  if (campaignId) return `${path}?c=${encodeURIComponent(String(campaignId).slice(0, 80))}`;
  return path;
}

export function bookingUrlForChannel(channel, { campaignId, origin } = {}) {
  const path = bookingPathForChannel(channel, { campaignId });
  if (origin) return `${String(origin).replace(/\/$/, "")}${path}`;
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${path}`;
  }
  return path;
}

export function totalMeetings(meetings = {}) {
  return MEETING_CHANNEL_IDS.reduce((sum, id) => sum + count(meetings[id]), 0);
}

export function recordMeetingEvent(settings, { channel, campaignId = null } = {}) {
  const next = normalizeMeetingSettings({}, settings);
  const id = MEETING_CHANNEL_IDS.includes(channel) ? channel : null;
  if (!id) return { settings: next, destination: "" };
  next.meetings[id] = count(next.meetings[id]) + 1;
  next.recent = [
    {
      id: newId(),
      channel: id,
      campaignId: campaignId ? String(campaignId).slice(0, 80) : null,
      at: new Date().toISOString(),
    },
    ...(next.recent || []),
  ].slice(0, 50);
  const destination = next.meetingLinks[id] || "";
  return { settings: next, destination };
}

export function meetingsForCampaign(settings, campaignId) {
  if (!campaignId) return 0;
  return (settings?.recent || []).filter((e) => e.campaignId === campaignId).length;
}
