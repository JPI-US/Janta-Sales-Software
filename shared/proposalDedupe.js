export function snapshotRichnessScore(proposal) {
  const s = proposal?.snapshot || {};
  let score = 0;
  if (String(s.custName || "").trim()) score += 10;
  if (String(s.custAddress || "").trim()) score += 10;
  if (String(s.billText || "").length > 40) score += 20;
  if (Array.isArray(s.meters) && s.meters.length) score += s.meters.length * 8;
  if ((s.step ?? 0) > 0) score += (s.step ?? 0) * 3;
  const filled = (arr) => (arr || []).filter((v) => v != null && Number(v) > 0).length;
  score += filled(s.monthlyKWh) * 3;
  for (const m of s.meters || []) score += filled(m.monthlyKWh) * 4;
  return score;
}

export function dedupeProposalsByHubSpotId(proposals) {
  const byHs = new Map();
  const noHs = [];
  for (const p of proposals || []) {
    const hsId = String(p.hubspotDealId || p.snapshot?.hubspotDealId || "");
    if (!hsId) {
      noHs.push(p);
      continue;
    }
    const prev = byHs.get(hsId);
    if (!prev || new Date(p.updatedAt) > new Date(prev.updatedAt)) byHs.set(hsId, p);
  }
  return [...noHs, ...byHs.values()];
}

/** One project per title — richest / newest wins. */
export function dedupeProposalsByTitle(proposals) {
  const byTitle = new Map();
  for (const p of proposals || []) {
    const key = String(p.title || "").trim().toLowerCase() || `__id_${p.id}`;
    const prev = byTitle.get(key);
    if (!prev) {
      byTitle.set(key, p);
      continue;
    }
    const prevScore = snapshotRichnessScore(prev);
    const nextScore = snapshotRichnessScore(p);
    const prevTime = new Date(prev.updatedAt).getTime();
    const nextTime = new Date(p.updatedAt).getTime();
    const keep =
      nextScore > prevScore || (nextScore === prevScore && nextTime > prevTime) ? p : prev;
    byTitle.set(key, keep);
  }
  return Array.from(byTitle.values()).sort(
    (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
  );
}

export function dedupeProposalList(proposals) {
  const afterHs = dedupeProposalsByHubSpotId(proposals);
  return dedupeProposalsByTitle(afterHs);
}
