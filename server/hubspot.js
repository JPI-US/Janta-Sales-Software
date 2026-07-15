import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  dedupeProposalList,
  dedupeProposalsByHubSpotId,
  dedupeProposalsByTitle as dedupeByTitleFn,
} from "../shared/proposalDedupe.js";
import { resolveSolarPricePerKw } from "../src/solarPricing.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = "https://api.hubapi.com";
const SNAPSHOT_VERSION = 1;

function token() {
  return String(process.env.HUBSPOT_ACCESS_TOKEN || "").trim();
}

export function isHubSpotConfigured() {
  const enabled = String(process.env.HUBSPOT_ENABLED || "").trim().toLowerCase();
  if (enabled !== "true" && enabled !== "1" && enabled !== "yes") return false;
  return Boolean(token());
}

function loadStageMaps() {
  const maps = { statusToStage: {}, stageToStatus: {} };
  const configPath = path.join(__dirname, "hubspot.config.json");
  if (!fs.existsSync(configPath)) return maps;
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
    maps.statusToStage = raw.statusToStage || {};
    maps.stageToStatus = raw.stageToStatus || {};
  } catch {
    // ignore bad config
  }
  return maps;
}

async function hubspotFetch(pathname, options = {}) {
  const res = await fetch(`${API}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.message || data.status || res.statusText;
    throw new Error(typeof msg === "string" ? msg : `HubSpot error (${res.status})`);
  }
  return data;
}

export async function getHubSpotOwnerIdForEmail(email) {
  const clean = String(email || "").trim().toLowerCase();
  if (!clean) return null;
  const data = await hubspotFetch("/crm/v3/owners/?limit=100&archived=false");
  const owners = data.results || [];
  const hit = owners.find((o) => String(o.email || "").toLowerCase() === clean);
  return hit?.id != null ? String(hit.id) : null;
}

async function searchContactByEmail(email) {
  const clean = String(email || "").trim();
  if (!clean) return null;
  const data = await hubspotFetch("/crm/v3/objects/contacts/search", {
    method: "POST",
    body: JSON.stringify({
      filterGroups: [
        {
          filters: [{ propertyName: "email", operator: "EQ", value: clean }],
        },
      ],
      properties: ["email", "firstname", "lastname", "phone", "address"],
      limit: 1,
    }),
  });
  return data.results?.[0] || null;
}

async function createContact({ email, name, phone, address }) {
  const parts = String(name || "").trim().split(/\s+/);
  const properties = {
    email: email || undefined,
    firstname: parts[0] || undefined,
    lastname: parts.slice(1).join(" ") || undefined,
    phone: phone || undefined,
    address: address || undefined,
  };
  Object.keys(properties).forEach((k) => properties[k] == null && delete properties[k]);
  const data = await hubspotFetch("/crm/v3/objects/contacts", {
    method: "POST",
    body: JSON.stringify({ properties }),
  });
  return data;
}

async function listDeals({ ownerId, limit = 100 }) {
  if (!ownerId) return [];
  const filters = [
    {
      propertyName: "hubspot_owner_id",
      operator: "EQ",
      value: ownerId,
    },
  ];
  const all = [];
  let after;
  const pageSize = Math.min(limit, 100);
  do {
    const body = {
      filterGroups: [{ filters }],
      properties: ["dealname", "dealstage", "amount", "hubspot_owner_id", "closedate"],
      sorts: [{ propertyName: "hs_lastmodifieddate", direction: "DESCENDING" }],
      limit: pageSize,
      ...(after ? { after } : {}),
    };
    const data = await hubspotFetch("/crm/v3/objects/deals/search", {
      method: "POST",
      body: JSON.stringify(body),
    });
    all.push(...(data.results || []));
    after = data.paging?.next?.after;
    if (all.length >= limit) break;
  } while (after);
  return all.slice(0, limit);
}

function hubspotStageToStatus(stageId, stageToStatus) {
  if (!stageId) return "in_progress";
  if (stageToStatus[stageId]) return stageToStatus[stageId];
  return "in_progress";
}

function statusToHubspotStage(status, statusToStage) {
  return statusToStage[status] || statusToStage.in_progress || "";
}

function contactDisplayName(contact) {
  if (!contact?.properties) return "";
  const p = contact.properties;
  const name = [p.firstname, p.lastname].filter(Boolean).join(" ").trim();
  return name || "";
}

function dealToSnapshot(deal, contact) {
  const p = deal.properties || {};
  const cp = contact?.properties || {};
  return {
    v: SNAPSHOT_VERSION,
    step: 0,
    custName: String(p.dealname || "").trim() || contactDisplayName(contact),
    custAddress: String(cp.address || "").trim(),
    custEmail: String(cp.email || "").trim(),
    custPhone: String(cp.phone || "").trim(),
    multiMeterMode: false,
    meters: [],
  };
}

function proposalAmount(snapshot) {
  const { midpoint } = resolveSolarPricePerKw({
    pricingPerKW: snapshot?.pricingPerKW,
    pricingPerKWHigh: snapshot?.pricingPerKWHigh,
    pricingUseRange: Boolean(snapshot?.pricingUseRange),
  });
  const kw = parseFloat(String(snapshot?.systemSizeKw || "").replace(/,/g, ""));
  if (Number.isFinite(midpoint) && Number.isFinite(kw) && kw > 0) {
    return String(Math.round(midpoint * kw));
  }
  return "";
}

export async function importDealsIntoProposals({ proposals, userId, userEmail }) {
  const { stageToStatus } = loadStageMaps();
  const ownerId = await getHubSpotOwnerIdForEmail(userEmail);
  if (!ownerId) {
    return {
      imported: 0,
      updated: 0,
      dealCount: 0,
      ownerMatched: false,
      skipped: true,
      message: `No HubSpot owner found for ${userEmail}. Deals were not imported (prevents pulling the whole company CRM).`,
    };
  }
  const maxDeals = Number(process.env.HUBSPOT_IMPORT_MAX || 200);
  const deals = await listDeals({ ownerId, limit: maxDeals });
  let imported = 0;
  let updated = 0;
  const byHubspotId = new Map(
    proposals.filter((p) => p.hubspotDealId).map((p) => [String(p.hubspotDealId), p])
  );

  for (const deal of deals) {
    const dealId = String(deal.id);
    const existing = byHubspotId.get(dealId);
    const status = hubspotStageToStatus(deal.properties?.dealstage, stageToStatus);
    const title = String(deal.properties?.dealname || "").trim() || "HubSpot deal";
    let contact = null;
    try {
      const assoc = await hubspotFetch(
        `/crm/v4/objects/deals/${dealId}/associations/contacts?limit=1`
      );
      const contactId = assoc.results?.[0]?.toObjectId;
      if (contactId) {
        contact = await hubspotFetch(
          `/crm/v3/objects/contacts/${contactId}?properties=email,firstname,lastname,phone,address`
        );
      }
    } catch {
      // no contact
    }
    const snapshot = dealToSnapshot(deal, contact);
    const now = new Date().toISOString();

    if (existing) {
      const hsModified = deal.updatedAt || deal.properties?.hs_lastmodifieddate;
      const localModified = existing.updatedAt;
      if (hsModified && localModified && new Date(hsModified) <= new Date(localModified)) {
        continue;
      }
      existing.title = title;
      existing.status = status;
      existing.snapshot = { ...existing.snapshot, ...snapshot, hubspotDealId: dealId };
      existing.hubspotDealId = dealId;
      existing.updatedAt = now;
      updated += 1;
    } else {
      proposals.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        userId,
        hubspotDealId: dealId,
        title,
        status,
        snapshot: { ...snapshot, hubspotDealId: dealId },
        createdAt: now,
        updatedAt: now,
      });
      imported += 1;
      byHubspotId.set(dealId, proposals[proposals.length - 1]);
    }
  }

  return { imported, updated, dealCount: deals.length, ownerMatched: true };
}

export async function pushProposalToHubSpot(proposal, { userEmail } = {}) {
  if (!isHubSpotConfigured()) return { skipped: true };
  const { statusToStage } = loadStageMaps();
  const snap = proposal.snapshot || {};
  const dealName =
    String(proposal.title || "").trim() ||
    String(snap.custName || "").trim() ||
    "Solar proposal";
  const stage = statusToHubspotStage(proposal.status || "in_progress", statusToStage);
  const amount = proposalAmount(snap);
  const ownerId = await getHubSpotOwnerIdForEmail(userEmail);

  let contactId = null;
  const email = String(snap.custEmail || "").trim();
  if (email) {
    let contact = await searchContactByEmail(email);
    if (!contact) {
      contact = await createContact({
        email,
        name: snap.custName,
        phone: snap.custPhone,
        address: snap.custAddress,
      });
    }
    contactId = contact?.id;
  }

  const properties = {
    dealname: dealName,
    ...(stage ? { dealstage: stage } : {}),
    ...(amount ? { amount } : {}),
    ...(ownerId ? { hubspot_owner_id: ownerId } : {}),
  };

  let dealId = proposal.hubspotDealId || snap.hubspotDealId;
  if (dealId) {
    await hubspotFetch(`/crm/v3/objects/deals/${dealId}`, {
      method: "PATCH",
      body: JSON.stringify({ properties }),
    });
  } else {
    const body = { properties };
    if (contactId) {
      body.associations = [
        {
          to: { id: contactId },
          types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }],
        },
      ];
    }
    const created = await hubspotFetch("/crm/v3/objects/deals", {
      method: "POST",
      body: JSON.stringify(body),
    });
    dealId = String(created.id);
  }

  return { hubspotDealId: dealId };
}

export async function syncAccountWithHubSpot({ proposals, userId, userEmail }) {
  if (!isHubSpotConfigured()) {
    return { configured: false, message: "Add HUBSPOT_ACCESS_TOKEN to .env and restart the server." };
  }
  for (const p of proposals) {
    p.userId = userId;
  }
  const pull = await importDealsIntoProposals({ proposals, userId, userEmail });
  return {
    configured: true,
    imported: pull.imported,
    updated: pull.updated,
    dealCount: pull.dealCount,
    ownerMatched: pull.ownerMatched,
    skipped: pull.skipped,
    message: pull.message,
    pushed: 0,
  };
}

export function dedupeProposalsByHubSpot(proposals) {
  const deduped = dedupeProposalsByHubSpotId(proposals);
  deduped.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  return { proposals: deduped, removed: (proposals?.length || 0) - deduped.length };
}

/** Collapse duplicate titles — keeps the richest / newest project per title. */
export function dedupeProposalsByTitle(proposals) {
  const deduped = dedupeByTitleFn(proposals);
  return { proposals: deduped, removed: (proposals?.length || 0) - deduped.length };
}

export { dedupeProposalList };
