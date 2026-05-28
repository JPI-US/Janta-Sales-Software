export const SNAPSHOT_VERSION = 1;

export function emptySnapshot() {
  return { v: SNAPSHOT_VERSION };
}

export function isSnapshot(value) {
  return Boolean(value && typeof value === "object" && value.v === SNAPSHOT_VERSION);
}

function filledMonthlyCount(monthly) {
  if (!Array.isArray(monthly)) return 0;
  return monthly.filter((v) => v != null && Number(v) > 0).length;
}

/** Higher = more user data worth keeping (used to avoid wiping drafts on reload). */
export function snapshotDataScore(snapshot) {
  if (!isSnapshot(snapshot)) return 0;
  let score = 0;
  if (String(snapshot.custName || "").trim()) score += 15;
  if (String(snapshot.custAddress || "").trim()) score += 15;
  if (String(snapshot.billText || "").length > 40) score += 25;
  score += filledMonthlyCount(snapshot.monthlyKWh) * 4;
  const meters = Array.isArray(snapshot.meters) ? snapshot.meters : [];
  score += meters.length * 8;
  for (const m of meters) {
    if (String(m?.meterNumber || "").trim()) score += 6;
    if (String(m?.name || "").trim()) score += 3;
    if (String(m?.billText || "").length > 40) score += 12;
    score += filledMonthlyCount(m?.monthlyKWh) * 5;
    if (m?.usageSavedAt) score += 10;
  }
  return score;
}

export function snapshotHasMeaningfulData(snapshot) {
  return snapshotDataScore(snapshot) >= 12;
}
