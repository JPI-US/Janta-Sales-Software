import { snapshotDataScore, snapshotHasMeaningfulData } from "./proposalSnapshot.js";
import {
  clearDraftCloud,
  createProposalCloud,
  deleteProposalCloud,
  listProposalsCloud,
  readDraftCloud,
  updateProposalCloud,
  writeDraftCloud,
} from "./proposalsCloudApi.js";

// re-export for callers that need direct cloud access
export { createProposalCloud, updateProposalCloud } from "./proposalsCloudApi.js";

export const PROPOSAL_STATUS_IN_PROGRESS = "in_progress";
export const PROPOSAL_STATUS_READY = "ready";
export const PROPOSAL_STATUS_SENT = "sent";
export const PROPOSAL_STATUS_CLOSED = "closed";
/** @deprecated use PROPOSAL_STATUS_READY */
export const PROPOSAL_STATUS_COMPLETE = "ready";

export { snapshotDataScore, snapshotHasMeaningfulData };

export function deriveProposalTitle(snapshot) {
  const name = String(snapshot?.custName || "").trim();
  const address = String(snapshot?.custAddress || "").trim();
  if (name && address) return `${name} — ${address.slice(0, 40)}`;
  if (name) return name;
  if (address) return address.slice(0, 60);
  return `Proposal ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

export async function listProposalsForUser(userId, { status } = {}) {
  return listProposalsCloud(userId, { status });
}

export async function saveProposal({ userId, id, title, snapshot, status = PROPOSAL_STATUS_IN_PROGRESS }) {
  if (!userId || !snapshot) throw new Error("userId and snapshot are required");
  const cleanTitle = String(title || "").trim() || deriveProposalTitle(snapshot);

  if (id) {
    return updateProposalCloud(userId, id, { title: cleanTitle, snapshot, status });
  }
  return createProposalCloud(userId, { title: cleanTitle, snapshot, status });
}

export async function deleteProposal(proposalId, userId) {
  return deleteProposalCloud(userId, proposalId);
}

export async function readSessionDraft(userId) {
  if (!userId) return null;
  try {
    return await readDraftCloud(userId);
  } catch {
    return null;
  }
}

export async function writeSessionDraft(userId, snapshot, { force = false } = {}) {
  if (!userId || !snapshot) return;
  try {
    const existing = await readSessionDraft(userId);
    const prev = existing?.snapshot;
    const prevScore = snapshotDataScore(prev);
    const nextScore = snapshotDataScore(snapshot);

    if (!force) {
      if (!snapshotHasMeaningfulData(snapshot) && prevScore > 0) return;
      if (prevScore > nextScore + 2) return;
    }

    await writeDraftCloud(userId, snapshot);
  } catch {
    // ignore network errors for draft backup
  }
}

export async function clearSessionDraft(userId) {
  if (!userId) return;
  try {
    await clearDraftCloud(userId);
  } catch {
    // ignore
  }
}
