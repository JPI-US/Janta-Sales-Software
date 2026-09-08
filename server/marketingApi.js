import path from "path";
import {
  MEETING_CHANNEL_IDS,
  emptyMeetingSettings,
  normalizeMeetingSettings,
  recordMeetingEvent,
  totalMeetings,
} from "../shared/meetingBookings.js";
import { JANTA_SITE_ORIGIN } from "../shared/campaignPosting.js";
import { readJson, writeJson, readBody, send } from "./httpUtils.js";
import { authenticateRequest } from "./auth/sessions.js";
import { DEFAULT_DATA_DIR } from "./proposalsApi.js";
import { canAccessMarketingReport } from "../shared/roles.js";

function settingsPath(dataDir) {
  return path.join(dataDir, "marketing-settings.json");
}

export function loadMeetingSettings(dataDir) {
  const raw = readJson(settingsPath(dataDir), emptyMeetingSettings());
  return normalizeMeetingSettings(raw, emptyMeetingSettings());
}

function saveMeetingSettings(dataDir, settings) {
  writeJson(settingsPath(dataDir), settings);
}

function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader("Location", location || JANTA_SITE_ORIGIN + "/");
  res.setHeader("Cache-Control", "no-store");
  res.end();
}

export function createMarketingApiHandler({ dataDir = DEFAULT_DATA_DIR, authDataDir } = {}) {
  return async function marketingApiHandler(req, res, next) {
    const url = new URL(req.url, "http://localhost");

    // Public meeting booking redirect — counts a conversion, then sends to Calendly / booking URL
    const bookMatch = url.pathname.match(/^\/book\/([^/]+)\/?$/);
    if (bookMatch && (req.method === "GET" || req.method === "HEAD")) {
      try {
        const channel = String(bookMatch[1] || "").toLowerCase();
        if (!MEETING_CHANNEL_IDS.includes(channel)) {
          return redirect(res, JANTA_SITE_ORIGIN + "/contact");
        }
        const campaignId = url.searchParams.get("c") || null;
        const current = loadMeetingSettings(dataDir);
        const { settings, destination } = recordMeetingEvent(current, { channel, campaignId });
        saveMeetingSettings(dataDir, settings);
        return redirect(res, destination || JANTA_SITE_ORIGIN + "/contact");
      } catch (err) {
        console.error(err);
        return redirect(res, JANTA_SITE_ORIGIN + "/contact");
      }
    }

    if (!url.pathname.startsWith("/api/marketing/")) return next();

    try {
      const session = await authenticateRequest(req, { dataDir: authDataDir });
      if (!session) return send(res, 401, { error: "Authentication required" });
      if (!canAccessMarketingReport(session.user)) return send(res, 403, { error: "Marketing or admin access required" });

      if (url.pathname === "/api/marketing/settings" && req.method === "GET") {
        const settings = loadMeetingSettings(dataDir);
        return send(res, 200, {
          ...settings,
          totals: { meetings: totalMeetings(settings.meetings) },
        });
      }

      if (url.pathname === "/api/marketing/settings" && req.method === "PUT") {
        const body = await readBody(req);
        const existing = loadMeetingSettings(dataDir);
        // Only allow updating links from the client — counts come from /book/ hits
        const next = normalizeMeetingSettings(
          { meetingLinks: body?.meetingLinks, meetings: existing.meetings, recent: existing.recent },
          existing,
        );
        saveMeetingSettings(dataDir, next);
        return send(res, 200, {
          ...next,
          totals: { meetings: totalMeetings(next.meetings) },
        });
      }

      return send(res, 404, { error: "Not found" });
    } catch (err) {
      console.error(err);
      return send(res, 500, { error: err.message || "Server error" });
    }
  };
}
