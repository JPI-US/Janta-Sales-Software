const PINNED_PREFIX = "janta_pinned_proposals_v1_";

export function readPinnedProposalIds(userId) {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(`${PINNED_PREFIX}${userId}`);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string" && id) : [];
  } catch {
    return [];
  }
}

export function writePinnedProposalIds(userId, ids) {
  if (!userId) return;
  localStorage.setItem(`${PINNED_PREFIX}${userId}`, JSON.stringify([...new Set(ids)]));
}

export function isProposalPinned(userId, proposalId) {
  return readPinnedProposalIds(userId).includes(proposalId);
}

export function togglePinnedProposal(userId, proposalId) {
  const ids = readPinnedProposalIds(userId);
  const idx = ids.indexOf(proposalId);
  if (idx >= 0) ids.splice(idx, 1);
  else ids.unshift(proposalId);
  writePinnedProposalIds(userId, ids);
  return ids;
}
