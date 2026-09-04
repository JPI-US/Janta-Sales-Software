import fs from "fs";
import path from "path";
import { proposalStorageKey } from "../shared/proposalAccount.js";
import {
  normalizeSocialCampaign,
  campaignDestinationUrl,
} from "../shared/socialCampaigns.js";
import { slugifyTrackPath, JANTA_SITE_ORIGIN } from "../shared/campaignPosting.js";
import { loadMeetingSettings } from "./marketingApi.js";
import { readJson, writeJson, readBody, send } from "./httpUtils.js";
import { authenticateRequest } from "./auth/sessions.js";
import { DEFAULT_DATA_DIR } from "./proposalsApi.js";

function userDir(dataDir, userId) {
  const safe = String(userId).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safe) throw new Error("Invalid userId");
  return path.join(dataDir, safe);
}

function storePath(dataDir, userId) {
  return path.join(userDir(dataDir, userId), "social-campaigns.json");
}

function loadCampaigns(dataDir, userId) {
  const store = readJson(storePath(dataDir, userId), { campaigns: [] });
  return Array.isArray(store.campaigns) ? store.campaigns : [];
}

function saveCampaigns(dataDir, userId, campaigns) {
  writeJson(storePath(dataDir, userId), { campaigns });
}

function usedSlugsExcept(campaigns, exceptId) {
  return campaigns
    .filter((c) => c.id !== exceptId)
    .map((c) => slugifyTrackPath(c.trackSlug).replace(/\//g, "-"))
    .filter(Boolean);
}

function findCampaignBySlug(dataDir, slug) {
  const clean = slugifyTrackPath(slug).replace(/\//g, "-");
  if (!clean || !fs.existsSync(dataDir)) return null;
  for (const dir of fs.readdirSync(dataDir, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    const campaigns = loadCampaigns(dataDir, dir.name).map((c, i, arr) =>
      normalizeSocialCampaign(c, c, { usedSlugs: usedSlugsExcept(arr, c.id) }),
    );
    for (let ci = 0; ci < campaigns.length; ci++) {
      const c = campaigns[ci];
      const campaignSlug = slugifyTrackPath(c.trackSlug).replace(/\//g, "-");
      if (campaignSlug === clean) {
        return { userId: dir.name, campaigns, campaignIndex: ci, campaign: c };
      }
      // Legacy: match post-level slugs from older campaigns
      const posts = Array.isArray(c.posts) ? c.posts : [];
      if (posts.some((p) => slugifyTrackPath(p.trackSlug).replace(/\//g, "-") === clean)) {
        return { userId: dir.name, campaigns, campaignIndex: ci, campaign: c };
      }
    }
  }
  return null;
}

function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader("Location", location);
  res.setHeader("Cache-Control", "no-store");
  res.end();
}

export function createSocialApiHandler({ dataDir = DEFAULT_DATA_DIR, authDataDir } = {}) {
  return async function socialApiHandler(req, res, next) {
    const url = new URL(req.url, "http://localhost");

    // Public click-tracking redirect — one link per campaign
    const publicMatch = url.pathname.match(/^\/r\/([^/]+)\/?$/);
    if (publicMatch && (req.method === "GET" || req.method === "HEAD")) {
      try {
        const hit = findCampaignBySlug(dataDir, decodeURIComponent(publicMatch[1]));
        if (!hit) {
          return redirect(res, JANTA_SITE_ORIGIN + "/");
        }
        const { userId, campaigns, campaignIndex } = hit;
        const campaign = { ...campaigns[campaignIndex] };
        const stats = { ...(campaign.stats || {}) };
        stats.clicks = (Number(stats.clicks) || 0) + 1;
        campaign.stats = stats;
        campaign.updatedAt = new Date().toISOString();
        // Drop legacy posts after migrating clicks
        if (campaign.posts) delete campaign.posts;
        campaigns[campaignIndex] = campaign;
        saveCampaigns(dataDir, userId, campaigns);

        const meetingSettings = loadMeetingSettings(dataDir);
        const destination = campaignDestinationUrl(campaign, meetingSettings.meetingLinks);
        return redirect(res, destination || JANTA_SITE_ORIGIN + "/");
      } catch (err) {
        console.error("[social-redirect]", err);
        return redirect(res, JANTA_SITE_ORIGIN + "/");
      }
    }

    if (!url.pathname.startsWith("/api/social/")) return next();

    try {
      const session = await authenticateRequest(req, { dataDir: authDataDir });
      if (!session) return send(res, 401, { error: "Authentication required" });
      const accountKey = proposalStorageKey(session.user);
      fs.mkdirSync(userDir(dataDir, accountKey), { recursive: true });

      const itemMatch = url.pathname.match(/^\/api\/social\/campaigns\/([^/]+)$/);

      if (url.pathname === "/api/social/campaigns" && req.method === "GET") {
        const raw = loadCampaigns(dataDir, accountKey);
        const campaigns = raw.map((c) =>
          normalizeSocialCampaign(c, c, { usedSlugs: usedSlugsExcept(raw, c.id) }),
        );
        return send(res, 200, { campaigns });
      }

      if (url.pathname === "/api/social/campaigns" && req.method === "POST") {
        const body = await readBody(req);
        const campaigns = loadCampaigns(dataDir, accountKey);
        const row = normalizeSocialCampaign(body, null, { usedSlugs: usedSlugsExcept(campaigns, null) });
        campaigns.unshift(row);
        saveCampaigns(dataDir, accountKey, campaigns.slice(0, 200));
        return send(res, 201, { campaign: row });
      }

      if (itemMatch) {
        const id = decodeURIComponent(itemMatch[1]);
        const campaigns = loadCampaigns(dataDir, accountKey);
        const idx = campaigns.findIndex((c) => c.id === id);
        if (idx < 0) return send(res, 404, { error: "Campaign not found" });

        if (req.method === "PUT") {
          const body = await readBody(req);
          const next = normalizeSocialCampaign(body, campaigns[idx], {
            usedSlugs: usedSlugsExcept(campaigns, id),
          });
          campaigns[idx] = next;
          saveCampaigns(dataDir, accountKey, campaigns);
          return send(res, 200, { campaign: next });
        }
        if (req.method === "DELETE") {
          campaigns.splice(idx, 1);
          saveCampaigns(dataDir, accountKey, campaigns);
          return send(res, 200, { ok: true });
        }
        return send(res, 405, { error: "Method not allowed" });
      }

      return send(res, 404, { error: "Not found" });
    } catch (err) {
      console.error("[social-api]", err);
      return send(res, 500, { error: err.message || "Server error" });
    }
  };
}
