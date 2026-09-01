import {
  MEDIA_CHANNEL_ORDER,
  getMediaPeriod,
  mergeChannelWithDemo,
  summarizeMediaOverview,
} from "../shared/mediaMetrics.js";
import { send } from "./httpUtils.js";
import { authenticateRequest } from "./auth/sessions.js";
import { fetchEmailChannel } from "./integrations/mediaEmail.js";
import { fetchWebsiteChannel } from "./integrations/mediaWebsite.js";
import { fetchInstagramChannel } from "./integrations/mediaMeta.js";
import { fetchLinkedInChannel } from "./integrations/mediaLinkedIn.js";
import { loadAllCampaigns } from "./emailApi.js";
import { DEFAULT_DATA_DIR } from "./proposalsApi.js";

function parseDaysParam(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 30;
  return Math.min(90, Math.max(7, Math.round(n)));
}

function filterCampaignsByRange(campaigns, from, to) {
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  return campaigns.filter((c) => {
    const t = new Date(c.copiedAt || 0).getTime();
    return t >= start && t <= end;
  });
}

async function buildMediaOverview({ from, to, days, dataDir }) {
  const period =
    from && to
      ? { from, to, days, label: `${from.slice(0, 10)} – ${to.slice(0, 10)}` }
      : getMediaPeriod(new Date(), { days });
  const range = { from: period.from, to: period.to };
  const studioCampaigns = filterCampaignsByRange(loadAllCampaigns(dataDir), period.from, period.to);

  const [email, website, instagram, linkedin] = await Promise.all([
    fetchEmailChannel({ ...range, studioCampaigns }),
    fetchWebsiteChannel(range),
    fetchInstagramChannel(range),
    fetchLinkedInChannel(range),
  ]);

  const liveByKey = {
    email,
    website,
    instagram,
    linkedin,
  };

  const useDemo = String(process.env.MEDIA_USE_DEMO || "true").toLowerCase() !== "false";
  const channels = Object.fromEntries(
    MEDIA_CHANNEL_ORDER.map((key) => {
      const live = liveByKey[key];
      if (live?.live) return [key, live];
      if (useDemo) return [key, mergeChannelWithDemo(key, period, live)];
      return [key, live];
    })
  );

  const anyLive = MEDIA_CHANNEL_ORDER.some((key) => channels[key]?.live);
  const anyDemo = MEDIA_CHANNEL_ORDER.some((key) => channels[key]?.demo);

  return {
    period,
    channels,
    summary: summarizeMediaOverview(channels),
    anyLive,
    anyDemo,
  };
}

export function createMediaApiHandler({ dataDir = DEFAULT_DATA_DIR, authDataDir } = {}) {
  return async function mediaApiHandler(req, res, next) {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/api/media/")) return next();

    try {
      const session = await authenticateRequest(req, { dataDir: authDataDir });
      if (!session) return send(res, 401, { error: "Authentication required" });
      if (!session.user?.isAdmin) return send(res, 403, { error: "Admin access required" });

      if (req.method !== "GET") return send(res, 405, { error: "Method not allowed" });

      if (url.pathname === "/api/media/overview") {
        const days = parseDaysParam(url.searchParams.get("days"));
        const from = url.searchParams.get("from");
        const to = url.searchParams.get("to");
        const overview = await buildMediaOverview({ from, to, days, dataDir });
        return send(res, 200, overview);
      }

      if (url.pathname === "/api/media/status") {
        const { isEmailConfigured } = await import("./integrations/mediaEmail.js");
        const { isWebsiteConfigured } = await import("./integrations/mediaWebsite.js");
        const { isInstagramConfigured } = await import("./integrations/mediaMeta.js");
        const { isLinkedInConfigured } = await import("./integrations/mediaLinkedIn.js");
        return send(res, 200, {
          email: isEmailConfigured(),
          website: isWebsiteConfigured(),
          instagram: isInstagramConfigured(),
          linkedin: isLinkedInConfigured(),
          demoEnabled: String(process.env.MEDIA_USE_DEMO || "true").toLowerCase() !== "false",
        });
      }

      return send(res, 404, { error: "Not found" });
    } catch (err) {
      console.error("[media-api]", err);
      return send(res, 500, { error: err.message || "Server error" });
    }
  };
}
