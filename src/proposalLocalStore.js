import { dedupeProposalList } from "../shared/proposalDedupe.js";

const STORE_PREFIX = "janta_account_proposals_v1_";

function storeKey(accountKey) {
  return `${STORE_PREFIX}${accountKey}`;
}

function readStore(accountKey) {
  if (!accountKey) return { proposals: [], updatedAt: null };
  try {
    const raw = localStorage.getItem(storeKey(accountKey));
    if (!raw) return { proposals: [], updatedAt: null };
    const parsed = JSON.parse(raw);
    const proposals = Array.isArray(parsed.proposals) ? parsed.proposals : [];
    return {
      proposals,
      updatedAt: parsed.updatedAt || null,
    };
  } catch {
    return { proposals: [], updatedAt: null };
  }
}

function writeStore(accountKey, proposals) {
  if (!accountKey) return;
  try {
    localStorage.setItem(
      storeKey(accountKey),
      JSON.stringify({
        proposals,
        updatedAt: new Date().toISOString(),
      })
    );
  } catch {
    // quota — best effort
  }
}

export function readLocalProposals(accountKey) {
  return readStore(accountKey).proposals;
}

export function writeLocalProposals(accountKey, proposals) {
  writeStore(accountKey, proposals);
}

export function upsertLocalProposal(accountKey, proposal) {
  const rows = readLocalProposals(accountKey);
  const idx = rows.findIndex((p) => p.id === proposal.id);
  const next = [...rows];
  if (idx >= 0) next[idx] = proposal;
  else next.push(proposal);
  next.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  writeLocalProposals(accountKey, next);
  return proposal;
}

export function removeLocalProposal(accountKey, proposalId) {
  const next = readLocalProposals(accountKey).filter((p) => p.id !== proposalId);
  writeLocalProposals(accountKey, next);
}

/** Merge by id and hubspotDealId; keep row with newer updatedAt. */
export function mergeProposalLists(...lists) {
  const byId = new Map();
  const byHubspot = new Map();

  const consider = (row) => {
    if (!row?.id) return;
    const prev = byId.get(row.id);
    if (!prev || new Date(row.updatedAt) >= new Date(prev.updatedAt)) {
      byId.set(row.id, row);
    }
    const hsId = row.hubspotDealId || row.snapshot?.hubspotDealId;
    if (hsId) {
      const key = String(hsId);
      const prevHs = byHubspot.get(key);
      if (!prevHs || new Date(row.updatedAt) >= new Date(prevHs.updatedAt)) {
        byHubspot.set(key, row);
      }
    }
  };

  for (const list of lists) {
    for (const row of list || []) consider(row);
  }

  const out = new Map();
  for (const row of byId.values()) out.set(row.id, row);
  for (const row of byHubspot.values()) {
    const dupes = [...out.values()].filter(
      (p) =>
        p.id !== row.id &&
        String(p.hubspotDealId || p.snapshot?.hubspotDealId || "") ===
          String(row.hubspotDealId || row.snapshot?.hubspotDealId)
    );
    for (const d of dupes) out.delete(d.id);
    const prev = out.get(row.id);
    if (!prev || new Date(row.updatedAt) >= new Date(prev.updatedAt)) out.set(row.id, row);
  }

  return dedupeProposalList(
    Array.from(out.values()).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
  );
}
