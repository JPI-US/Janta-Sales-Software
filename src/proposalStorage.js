import { dedupeProposalList } from "../shared/proposalDedupe.js";
import { isLegacyRandomUserId, proposalStorageKey } from "../shared/proposalAccount.js";
import { pickCrmFieldsFromBody } from "../shared/proposalCrmFields.js";
import {
  mergeProposalLists,
  readLocalProposals,
  removeLocalProposal,
  upsertLocalProposal,
  writeLocalProposals,
} from "./proposalLocalStore.js";
import { snapshotDataScore, snapshotHasMeaningfulData } from "./proposalSnapshot.js";
import { newProposalId } from "./proposalIds.js";
import {
  clearDraftCloud,
  createProposalCloud,
  deleteProposalCloud,
  getProposalCloud,
  listProposalsCloud,
  readDraftCloud,
  upsertProposalCloud,
  writeDraftCloud,
} from "./proposalsCloudApi.js";
import { dedupeProposalsCloud } from "./hubspotApi.js";

export { proposalStorageKey, isLegacyRandomUserId } from "../shared/proposalAccount.js";
export { createProposalCloud, upsertProposalCloud } from "./proposalsCloudApi.js";

export const PROPOSAL_STATUS_IN_PROGRESS = "in_progress";
export const PROPOSAL_STATUS_READY = "ready";
export const PROPOSAL_STATUS_SENT = "sent";
export const PROPOSAL_STATUS_CLOSED = "closed";
/** @deprecated use PROPOSAL_STATUS_READY */
export const PROPOSAL_STATUS_COMPLETE = "ready";

export { snapshotDataScore, snapshotHasMeaningfulData };

export function deriveProposalTitle(snapshot) {
  const custom = String(snapshot?.proposalTitle || "").trim();
  if (custom) {
    return /proposal$/i.test(custom) ? custom : `${custom} Proposal`;
  }
  const name = String(snapshot?.custName || "").trim();
  const address = String(snapshot?.custAddress || "").trim();
  if (name && address) return `${name} - ${address.slice(0, 40)}`;
  if (name) return name;
  if (address) return address.slice(0, 60);
  return `Proposal ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

/** Short name for editors and table inputs (no trailing " Proposal"). */
export function editableProjectTitle(proposal) {
  const snap = proposal?.snapshot || {};
  const fromSnap = String(snap.proposalTitle || "").trim();
  if (fromSnap) return fromSnap;
  const stored = String(proposal?.title || "").trim();
  if (!stored) return "";
  return stored.replace(/\s+Proposal$/i, "").trim() || stored;
}

function normalizeAccountKey(userOrKey) {
  return proposalStorageKey(userOrKey);
}

function withAccountKey(proposal, accountKey) {
  return { ...proposal, userId: accountKey };
}

async function listProposalsCloudSafe(accountKey, options) {
  try {
    const rows = await listProposalsCloud(accountKey, options);
    return { rows, fromCloud: true, error: null };
  } catch (err) {
    return { rows: [], fromCloud: false, error: err };
  }
}

async function backfillLocalOnlyProposals(accountKey, merged, cloudRows, { userEmail } = {}) {
  const cloudIds = new Set((cloudRows || []).map((p) => p.id));
  let refreshed = cloudRows;
  for (const row of merged) {
    if (!row?.id || cloudIds.has(row.id)) continue;
    try {
      const saved = await upsertProposalCloud(accountKey, {
        id: row.id,
        title: row.title,
        snapshot: row.snapshot,
        status: row.status,
        userEmail: String(userEmail || "").trim(),
        ...pickCrmFieldsFromBody(row),
      });
      upsertLocalProposal(accountKey, withAccountKey(saved, accountKey));
      cloudIds.add(row.id);
      refreshed = [...refreshed.filter((p) => p.id !== saved.id), saved];
    } catch {
      // keep local copy; will retry on next load
    }
  }
  return refreshed;
}

export async function listProposalsForUser(userOrKey, { status, userEmail } = {}) {
  const accountKey = normalizeAccountKey(userOrKey);
  if (!accountKey) return [];

  const local = readLocalProposals(accountKey);
  const { rows: cloud, fromCloud } = await listProposalsCloudSafe(accountKey, { status });

  if (fromCloud) {
    let merged = dedupeProposalList(mergeProposalLists(cloud, local));
    const refreshedCloud = await backfillLocalOnlyProposals(accountKey, merged, cloud, { userEmail });
    merged = dedupeProposalList(mergeProposalLists(refreshedCloud, merged));
    writeLocalProposals(accountKey, merged);
    if (status) return merged.filter((p) => p.status === status);
    return merged;
  }

  const localDeduped = dedupeProposalList(local);
  if (localDeduped.length !== local.length) writeLocalProposals(accountKey, localDeduped);

  if (status) return localDeduped.filter((p) => p.status === status);
  return localDeduped;
}

export async function saveProposal({
  userId,
  id,
  title,
  snapshot,
  status = PROPOSAL_STATUS_IN_PROGRESS,
  userEmail,
}) {
  const accountKey = normalizeAccountKey(userId);
  if (!accountKey || !snapshot) throw new Error("account and snapshot are required");
  const proposalId = id ? String(id).trim() : newProposalId();
  const cleanTitle = String(title || "").trim() || deriveProposalTitle(snapshot);
  const ownerEmail = String(userEmail || "").trim();
  const now = new Date().toISOString();

  const localRows = readLocalProposals(accountKey);
  const existing = localRows.find((p) => p.id === proposalId);
  const draft = {
    ...(existing || {}),
    id: proposalId,
    userId: accountKey,
    title: cleanTitle,
    snapshot,
    status: status ?? existing?.status ?? PROPOSAL_STATUS_IN_PROGRESS,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  upsertLocalProposal(accountKey, draft);

  try {
    const saved = await upsertProposalCloud(accountKey, {
      id: proposalId,
      title: cleanTitle,
      snapshot,
      status: draft.status,
      userEmail: ownerEmail,
    });
    upsertLocalProposal(accountKey, withAccountKey(saved, accountKey));
    return saved;
  } catch {
    return draft;
  }
}

export async function getProposalForUser(userOrKey, proposalId) {
  const accountKey = normalizeAccountKey(userOrKey);
  if (!accountKey || !proposalId) return null;
  const local = readLocalProposals(accountKey).find((p) => p.id === proposalId);
  try {
    const row = await getProposalCloud(accountKey, proposalId);
    if (row) upsertLocalProposal(accountKey, withAccountKey(row, accountKey));
    return row || local || null;
  } catch {
    return local || null;
  }
}

export async function deleteProposal(proposalId, userOrKey) {
  const accountKey = normalizeAccountKey(userOrKey);
  removeLocalProposal(accountKey, proposalId);
  try {
    await deleteProposalCloud(accountKey, proposalId);
  } catch (err) {
    const stillLocal = readLocalProposals(accountKey).some((p) => p.id === proposalId);
    if (stillLocal) return true;
    throw err;
  }
  return true;
}

export async function readSessionDraft(userOrKey) {
  const accountKey = normalizeAccountKey(userOrKey);
  if (!accountKey) return null;
  try {
    return await readDraftCloud(accountKey);
  } catch {
    return null;
  }
}

export async function writeSessionDraft(userOrKey, snapshot, { force = false } = {}) {
  const accountKey = normalizeAccountKey(userOrKey);
  if (!accountKey || !snapshot) return;
  try {
    const existing = await readSessionDraft(accountKey);
    const prev = existing?.snapshot;
    const prevScore = snapshotDataScore(prev);
    const nextScore = snapshotDataScore(snapshot);

    if (!force) {
      if (!snapshotHasMeaningfulData(snapshot) && prevScore > 0) return;
      if (prevScore > nextScore + 2) return;
    }

    await writeDraftCloud(accountKey, snapshot);
  } catch {
    // ignore network errors for draft backup
  }
}

export async function clearSessionDraft(userOrKey) {
  const accountKey = normalizeAccountKey(userOrKey);
  if (!accountKey) return;
  try {
    await clearDraftCloud(accountKey);
  } catch {
    // ignore
  }
}

export async function dedupeProposalsForUser(userOrKey) {
  const accountKey = normalizeAccountKey(userOrKey);
  const result = await dedupeProposalsCloud(accountKey);
  try {
    const rows = await listProposalsCloud(accountKey);
    writeLocalProposals(accountKey, rows);
  } catch {
    const local = readLocalProposals(accountKey);
    const merged = mergeProposalLists(local);
    writeLocalProposals(accountKey, merged);
    return {
      removed: Math.max(0, local.length - merged.length),
      remaining: merged.length,
    };
  }
  return result;
}

/** Copy proposals from an old random user id folder into the email-based account key. */
export async function migrateLegacyProposalAccount(accountKey, legacyUserId) {
  if (!accountKey || !legacyUserId || accountKey === legacyUserId) return;
  if (!isLegacyRandomUserId(legacyUserId, accountKey)) return;

  const { rows: legacyCloud } = await listProposalsCloudSafe(legacyUserId);
  const legacyLocal = readLocalProposals(legacyUserId);
  const legacyRows = mergeProposalLists(legacyCloud, legacyLocal);
  if (!legacyRows.length) return;

  const current = mergeProposalLists(await listProposalsForUser(accountKey), readLocalProposals(accountKey));
  const currentIds = new Set(current.map((p) => p.id));

  for (const row of legacyRows) {
    if (currentIds.has(row.id)) continue;
    try {
      const created = await createProposalCloud(accountKey, {
        id: row.id,
        title: row.title,
        snapshot: row.snapshot,
        status: row.status || PROPOSAL_STATUS_IN_PROGRESS,
      });
      upsertLocalProposal(accountKey, withAccountKey({ ...created, createdAt: row.createdAt, updatedAt: row.updatedAt }, accountKey));
    } catch {
      upsertLocalProposal(accountKey, withAccountKey({ ...row, userId: accountKey }, accountKey));
    }
  }

  const merged = mergeProposalLists(await listProposalsForUser(accountKey), legacyRows.map((r) => withAccountKey(r, accountKey)));
  writeLocalProposals(accountKey, merged);
}

export async function saveProposalCrmFields({ userId, id, userEmail, ...crmFields }) {
  const accountKey = normalizeAccountKey(userId);
  if (!accountKey || !id) throw new Error("account and proposal id are required");

  const localRows = readLocalProposals(accountKey);
  const existing = localRows.find((p) => p.id === id);
  if (!existing) throw new Error("Proposal not found locally");

  const now = new Date().toISOString();
  const draft = { ...existing, ...crmFields, updatedAt: now };
  upsertLocalProposal(accountKey, draft);

  try {
    const saved = await upsertProposalCloud(accountKey, {
      id,
      title: existing.title,
      snapshot: existing.snapshot,
      status: existing.status,
      userEmail: String(userEmail || "").trim(),
      ...pickCrmFieldsFromBody({ ...existing, ...crmFields }),
    });
    upsertLocalProposal(accountKey, withAccountKey(saved, accountKey));
    return saved;
  } catch {
    return draft;
  }
}

