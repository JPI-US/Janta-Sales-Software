import {
  CRM_STAGE_APPROVED,
  CRM_STAGE_CREATED,
  CRM_STAGE_DRAFTING,
  CRM_STAGE_LEAD_LOST,
  CRM_STAGE_NEGOTIATION,
  CRM_STAGE_NEEDS_FOLLOW_UP,
  CRM_STAGE_REVISION,
  CRM_STAGE_SENT,
  CRM_STAGE_SIGNED,
  CRM_DEAL_TYPE_OPTIONS,
  CRM_FINANCING_OPTIONS,
  crmFinancingLabel,
  crmStageLabel,
  crmDealTypeShortLabel,
  isOpenProposal,
  isQualifiedForBlockers,
  normalizeCrmStage,
  resolveDealType,
  derivePriority,
  resolvePriority,
} from "./proposalCrmFields.js";

export const REPORT_TYPE_BIWEEKLY = "biweekly";

/** @deprecated quarterly/annual removed — use REPORT_VIEW_* */
export const REPORT_TYPE_QUARTERLY = "quarterly";
/** @deprecated */
export const REPORT_TYPE_ANNUAL = "annual";

export const REPORT_VIEW_SALES = "full";
export const REPORT_VIEW_HEALTH = "current";
export const REPORT_VIEW_TEST = "test";
/** @deprecated use REPORT_VIEW_SALES */
export const REPORT_VIEW_FULL = REPORT_VIEW_SALES;
/** @deprecated use REPORT_VIEW_HEALTH */
export const REPORT_VIEW_CURRENT = REPORT_VIEW_HEALTH;
/** @deprecated removed */
export const REPORT_VIEW_PAST = "past";
/** @deprecated use REPORT_VIEW_HEALTH */
export const REPORT_VIEW_PIPELINE = REPORT_VIEW_HEALTH;
/** @deprecated use REPORT_VIEW_SALES */
export const REPORT_VIEW_FORECAST = REPORT_VIEW_SALES;
/** @deprecated merged into pipeline health view */
export const REPORT_VIEW_CLOSED = "closed";

export const REPORT_VIEW_OPTIONS = [
  { value: REPORT_VIEW_SALES, label: "Sales report" },
  { value: REPORT_VIEW_TEST, label: "Test preview" },
  { value: REPORT_VIEW_HEALTH, label: "Pipeline health" },
];

/** @deprecated use REPORT_VIEW_OPTIONS */
export const REPORT_TYPE_OPTIONS = REPORT_VIEW_OPTIONS;

const BIWEEKLY_ANCHOR_MS = Date.UTC(2024, 0, 1);
const MS_PER_DAY = 86400000;
const ANCHOR_YEAR = 2024;

export function deriveSystemSizeKw(snapshot) {
  const snap = snapshot || {};
  if (snap.multiMeterMode && Array.isArray(snap.meters) && snap.meters.length > 0) {
    return snap.meters.reduce((sum, m) => sum + (parseFloat(m.systemSizeKw) || 0), 0);
  }
  const kw = parseFloat(snap.systemSizeKw);
  return Number.isFinite(kw) && kw > 0 ? kw : 0;
}

function parsePricingPerKw(value, fallback = 3000) {
  const p = parseFloat(String(value || "").replace(/,/g, ""));
  return Number.isFinite(p) && p > 0 ? p : fallback;
}

function resolvePriceMidpoint(snap) {
  const low = parsePricingPerKw(snap.pricingPerKW);
  if (!snap.pricingUseRange) return low;
  const highParsed = parseFloat(String(snap.pricingPerKWHigh || "").replace(/,/g, ""));
  const high = Number.isFinite(highParsed) && highParsed > 0 ? highParsed : low;
  return (Math.min(low, high) + Math.max(low, high)) / 2;
}

function equipmentLineTotal(item) {
  const cost = Math.max(0, parseFloat(String(item?.unitCost || "").replace(/,/g, "")) || 0);
  const qty = Math.max(1, Math.round(Number(item?.quantity) || 1));
  return cost * qty;
}

function equipmentTotalFromSnapshot(snap) {
  const items = Array.isArray(snap?.optionalEquipment) ? snap.optionalEquipment : [];
  return items.reduce((sum, item) => {
    const hasContent = String(item?.name || "").trim() !== "" || parseFloat(String(item?.unitCost || "").replace(/,/g, "")) > 0;
    return hasContent ? sum + equipmentLineTotal(item) : sum;
  }, 0);
}

/** Gross project price from snapshot (pricing step), before credits. */
export function deriveAutoRevenue(proposal) {
  const snap = proposal?.snapshot || {};
  const gross = parseFloat(snap.grossCost);
  if (Number.isFinite(gross) && gross > 0) return gross;
  const kw = deriveSystemSizeKw(snap);
  if (kw <= 0) return 0;
  return kw * resolvePriceMidpoint(snap) + equipmentTotalFromSnapshot(snap);
}

export function deriveEstimatedRevenue(proposal) {
  if (
    proposal?.estimatedRevenueManual &&
    Number.isFinite(proposal.estimatedRevenue) &&
    proposal.estimatedRevenue > 0
  ) {
    return proposal.estimatedRevenue;
  }
  const auto = deriveAutoRevenue(proposal);
  const snap = proposal?.snapshot || {};
  if (
    !proposal?.estimatedRevenueManual &&
    Number.isFinite(proposal?.estimatedRevenue) &&
    proposal.estimatedRevenue > 0 &&
    !snap.grossCost
  ) {
    return proposal.estimatedRevenue;
  }
  return auto;
}

export function weightedRevenue(proposal) {
  const base = deriveEstimatedRevenue(proposal);
  const pct = proposal?.closeLikelihoodPct;
  if (!Number.isFinite(pct)) return base;
  return base * (pct / 100);
}

export function parseIsoDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function startOfDayUtc(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function getBiweeklyPeriod(date = new Date()) {
  const d = startOfDayUtc(date);
  const daysSinceAnchor = Math.floor((d.getTime() - BIWEEKLY_ANCHOR_MS) / MS_PER_DAY);
  const periodIndex = Math.floor(daysSinceAnchor / 14);
  const fromMs = BIWEEKLY_ANCHOR_MS + periodIndex * 14 * MS_PER_DAY;
  const toMs = fromMs + 14 * MS_PER_DAY - 1;
  const from = new Date(fromMs);
  const label = `${formatShortDate(from)} – ${formatShortDate(new Date(fromMs + 13 * MS_PER_DAY))}`;
  return { type: REPORT_TYPE_BIWEEKLY, periodIndex, from: from.toISOString(), to: new Date(toMs).toISOString(), label };
}

export function shiftBiweeklyPeriod(periodIndex) {
  const idx = periodIndex;
  const fromMs = BIWEEKLY_ANCHOR_MS + idx * 14 * MS_PER_DAY;
  const toMs = fromMs + 14 * MS_PER_DAY - 1;
  const from = new Date(fromMs);
  const label = `${formatShortDate(from)} – ${formatShortDate(new Date(fromMs + 13 * MS_PER_DAY))}`;
  return { type: REPORT_TYPE_BIWEEKLY, periodIndex: idx, from: from.toISOString(), to: new Date(toMs).toISOString(), label };
}

export function getQuarterlyPeriod(date = new Date()) {
  const d = startOfDayUtc(date);
  const y = d.getUTCFullYear();
  const q = Math.floor(d.getUTCMonth() / 3);
  const fromMs = Date.UTC(y, q * 3, 1);
  const toMs = Date.UTC(y, (q + 1) * 3, 0, 23, 59, 59, 999);
  const periodIndex = (y - ANCHOR_YEAR) * 4 + q;
  return {
    type: REPORT_TYPE_QUARTERLY,
    periodIndex,
    from: new Date(fromMs).toISOString(),
    to: new Date(toMs).toISOString(),
    label: `Q${q + 1} ${y}`,
  };
}

export function shiftQuarterlyPeriod(periodIndex) {
  const y = ANCHOR_YEAR + Math.floor(periodIndex / 4);
  const q = ((periodIndex % 4) + 4) % 4;
  const fromMs = Date.UTC(y, q * 3, 1);
  const toMs = Date.UTC(y, (q + 1) * 3, 0, 23, 59, 59, 999);
  return {
    type: REPORT_TYPE_QUARTERLY,
    periodIndex,
    from: new Date(fromMs).toISOString(),
    to: new Date(toMs).toISOString(),
    label: `Q${q + 1} ${y}`,
  };
}

export function getAnnualPeriod(date = new Date()) {
  const y = startOfDayUtc(date).getUTCFullYear();
  const periodIndex = y - ANCHOR_YEAR;
  return {
    type: REPORT_TYPE_ANNUAL,
    periodIndex,
    from: new Date(Date.UTC(y, 0, 1)).toISOString(),
    to: new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999)).toISOString(),
    label: String(y),
  };
}

export function shiftAnnualPeriod(periodIndex) {
  const y = ANCHOR_YEAR + periodIndex;
  return {
    type: REPORT_TYPE_ANNUAL,
    periodIndex,
    from: new Date(Date.UTC(y, 0, 1)).toISOString(),
    to: new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999)).toISOString(),
    label: String(y),
  };
}

export function resolveExpectedCloseMonth(proposal) {
  if (proposal?.expectedCloseDate) return String(proposal.expectedCloseDate).slice(0, 7);
  if (proposal?.expectedCloseMonth) return proposal.expectedCloseMonth;
  if (proposal?.createdAt) return String(proposal.createdAt).slice(0, 7);
  return null;
}

export function resolveExpectedCloseDate(proposal) {
  if (proposal?.expectedCloseDate) return String(proposal.expectedCloseDate).slice(0, 10);
  if (proposal?.expectedCloseMonth) return `${proposal.expectedCloseMonth}-15`;
  if (proposal?.createdAt) return String(proposal.createdAt).slice(0, 10);
  return null;
}

/** Daily close amounts across a period — $0 on days with no expected closes. */
export function buildDailyForecastSeries(revenueByDate, weightedRevenueByDate, { from, to } = {}) {
  const startKey = from ? String(from).slice(0, 10) : null;
  const endKey = to ? String(to).slice(0, 10) : null;
  if (!startKey || !endKey) {
    return { unweighted: [], weighted: [], closeDateCount: 0 };
  }

  const [sy, sm, sd] = startKey.split("-").map(Number);
  const [ey, em, ed] = endKey.split("-").map(Number);
  let cur = Date.UTC(sy, sm - 1, sd, 12, 0, 0, 0);
  const endTime = Date.UTC(ey, em - 1, ed, 12, 0, 0, 0);

  const unweighted = [];
  const weighted = [];
  while (cur <= endTime) {
    const key = new Date(cur).toISOString().slice(0, 10);
    unweighted.push({ date: key, value: revenueByDate?.[key] || 0 });
    weighted.push({ date: key, value: weightedRevenueByDate?.[key] || 0 });
    cur += 86400000;
  }

  const closeDateCount = [
    ...new Set([
      ...Object.keys(revenueByDate || {}),
      ...Object.keys(weightedRevenueByDate || {}),
    ]),
  ].length;

  return { unweighted, weighted, closeDateCount };
}

/** Running totals by close date, anchored at $0 on period start. */
export function buildCumulativeForecastByDate(revenueByDate, weightedRevenueByDate, { from, to } = {}) {
  const dates = [
    ...new Set([
      ...Object.keys(revenueByDate || {}),
      ...Object.keys(weightedRevenueByDate || {}),
    ]),
  ].sort();
  const startKey = from ? String(from).slice(0, 10) : null;
  const unweighted = [];
  const weighted = [];
  let cumU = 0;
  let cumW = 0;

  if (startKey) {
    unweighted.push({ date: startKey, value: 0 });
    weighted.push({ date: startKey, value: 0 });
  }

  for (const date of dates) {
    if (date === startKey) continue;
    cumU += revenueByDate[date] || 0;
    cumW += weightedRevenueByDate[date] || 0;
    unweighted.push({ date, value: cumU });
    weighted.push({ date, value: cumW });
  }

  return { unweighted, weighted, closeDateCount: dates.length };
}

function expectedCloseInPeriod(proposal, from, to) {
  const dateKey = resolveExpectedCloseDate(proposal);
  if (!dateKey) return false;
  return isInPeriod(dateKey, from, to);
}

export function getReportPeriod(view, date = new Date()) {
  if (view === REPORT_VIEW_SALES || view === REPORT_VIEW_TEST || view === "full") return getQuarterlyPeriod(date);
  return getBiweeklyPeriod(date);
}

export function shiftReportPeriod(view, periodIndex) {
  if (view === REPORT_VIEW_SALES || view === REPORT_VIEW_TEST || view === "full") return shiftQuarterlyPeriod(periodIndex);
  return shiftBiweeklyPeriod(periodIndex);
}

export function getCurrentBiweeklyPeriodIndex(date = new Date()) {
  return getBiweeklyPeriod(date).periodIndex;
}

export function getCurrentQuarterlyPeriodIndex(date = new Date()) {
  return getQuarterlyPeriod(date).periodIndex;
}

function formatShortDate(d) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** Inclusive YYYY-MM list between period bounds (UTC calendar months). */
export function listMonthsInPeriod(fromIso, toIso) {
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso);
  if (!from || !to) return [];

  const months = [];
  let y = from.getUTCFullYear();
  let m = from.getUTCMonth();
  const endY = to.getUTCFullYear();
  const endM = to.getUTCMonth();

  while (y < endY || (y === endY && m <= endM)) {
    months.push(`${y}-${String(m + 1).padStart(2, "0")}`);
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return months;
}

export function isInPeriod(iso, fromIso, toIso) {
  const t = parseIsoDate(iso);
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso);
  if (!t || !from || !to) return false;
  return t >= from && t <= to;
}

function daysBetween(aIso, bIso) {
  const a = parseIsoDate(aIso);
  const b = parseIsoDate(bIso);
  if (!a || !b) return null;
  return Math.round((b - a) / MS_PER_DAY);
}

function increment(map, key, amount = 1) { map[key || "unknown"] = (map[key || "unknown"] || 0) + amount; }
function addMoney(map, key, amount) { if (Number.isFinite(amount)) map[key || "unknown"] = (map[key || "unknown"] || 0) + amount; }

function isProposalApproved(p) {
  return p.status === "ready" || p.status === "complete" || (p.snapshot?.step ?? 0) >= 5;
}

function inPeriodUpdated(p, from, to) {
  return isInPeriod(p.updatedAt, from, to);
}

function inPeriodCreated(p, from, to) {
  return isInPeriod(p.createdAt, from, to);
}

function countStageInPeriod(rows, stage, from, to) {
  return rows.filter(
    (p) => inPeriodUpdated(p, from, to) && normalizeCrmStage(p.stage) === stage
  ).length;
}

function buildPeriodFunnel(rows, from, to) {
  const periodNewDeals = rows.filter((p) => inPeriodCreated(p, from, to));
  const periodSignedCount = rows.filter(
    (p) => inPeriodUpdated(p, from, to) && normalizeCrmStage(p.stage) === CRM_STAGE_SIGNED
  ).length;
  const periodLostCount = rows.filter(
    (p) => inPeriodUpdated(p, from, to) && normalizeCrmStage(p.stage) === CRM_STAGE_LEAD_LOST
  ).length;
  const periodNeedsFollowUpCount = countStageInPeriod(rows, CRM_STAGE_NEEDS_FOLLOW_UP, from, to);

  return {
    proposalCreated: periodNewDeals.length,
    draftingProposal: countStageInPeriod(rows, CRM_STAGE_DRAFTING, from, to),
    proposalApproved: countStageInPeriod(rows, CRM_STAGE_APPROVED, from, to),
    proposalRevision: countStageInPeriod(rows, CRM_STAGE_REVISION, from, to),
    proposalSent: countStageInPeriod(rows, CRM_STAGE_SENT, from, to),
    proposalNegotiation: countStageInPeriod(rows, CRM_STAGE_NEGOTIATION, from, to),
    needsFollowUp: periodNeedsFollowUpCount,
    proposalSigned: periodSignedCount,
    leadLost: periodLostCount,
    periodNewDeals,
    periodSignedCount,
    periodLostCount,
    periodNeedsFollowUpCount,
  };
}

function summarizeDeals(deals) {
  const pipelineByStage = {};
  const systemKwByStage = {};
  let pipelineUnweighted = 0;
  let pipelineWeighted = 0;
  let likelihoodSum = 0;
  let likelihoodCount = 0;

  for (const p of deals) {
    const stageKey = normalizeCrmStage(p.stage) || "unset";
    const rev = deriveEstimatedRevenue(p);
    const wRev = weightedRevenue(p);
    const kw = deriveSystemSizeKw(p.snapshot);
    increment(pipelineByStage, stageKey);
    addMoney(pipelineByStage, `${stageKey}__rev`, rev);
    addMoney(pipelineByStage, `${stageKey}__wrev`, wRev);
    addMoney(systemKwByStage, stageKey, kw);
    pipelineUnweighted += rev;
    pipelineWeighted += wRev;
    const pct = p.closeLikelihoodPct;
    if (Number.isFinite(pct)) {
      likelihoodSum += pct;
      likelihoodCount++;
    }
  }

  const byStage = {};
  for (const [key, count] of Object.entries(pipelineByStage)) {
    if (key.includes("__")) continue;
    byStage[key] = {
      count,
      revenue: pipelineByStage[`${key}__rev`] || 0,
      weightedRevenue: pipelineByStage[`${key}__wrev`] || 0,
      systemKw: systemKwByStage[key] || 0,
      label: key === "unset" ? "Unset" : crmStageLabel(key),
    };
  }

  return {
    byStage,
    count: deals.length,
    pipelineUnweighted,
    pipelineWeighted,
    totalSystemKw: deals.reduce((s, p) => s + deriveSystemSizeKw(p.snapshot), 0),
    openDealsMissingSystemKw: deals.filter((p) => deriveSystemSizeKw(p.snapshot) <= 0).length,
    avgCloseLikelihood: likelihoodCount > 0 ? Math.round(likelihoodSum / likelihoodCount) : null,
  };
}

function mapDealRow(p) {
  const systemKw = deriveSystemSizeKw(p.snapshot);
  const dealType = resolveDealType(p, systemKw);
  const autoRev = deriveAutoRevenue(p);
  return {
    id: p.id,
    title: p.title,
    stage: p.stage,
    status: p.status,
    revenue: deriveEstimatedRevenue(p),
    weightedRevenue: weightedRevenue(p),
    systemKw,
    dealType,
    dealTypeLabel: crmDealTypeShortLabel(dealType),
    financing: p.financing || null,
    financingLabel: crmFinancingLabel(p.financing),
    closeLikelihoodPct: p.closeLikelihoodPct,
    activityScore: p.activityScore,
    priority: resolvePriority(p, autoRev),
    proposalOwner: p.proposalOwner,
    expectedCloseMonth: p.expectedCloseMonth,
    closeDate: resolveExpectedCloseDate(p),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export function aggregateSalesReport(proposals, { from, to, quarterPipeline } = {}) {
  const rows = proposals || [];
  const hasPeriod = Boolean(from && to);
  const openDeals = rows.filter(isOpenProposal);
  const forecastDeals =
    hasPeriod && quarterPipeline
      ? openDeals.filter((p) => expectedCloseInPeriod(p, from, to))
      : openDeals;

  const system = summarizeDeals(openDeals);
  const stageSummary = system.byStage;

  const pipelineByStatus = {};
  for (const p of openDeals) {
    const statusKey = p.status === "complete" ? "ready" : p.status || "in_progress";
    increment(pipelineByStatus, statusKey);
    addMoney(pipelineByStatus, `${statusKey}__rev`, deriveEstimatedRevenue(p));
  }

  const statusSummary = {};
  for (const [key, count] of Object.entries(pipelineByStatus)) {
    if (key.includes("__")) continue;
    statusSummary[key] = { count, revenue: pipelineByStatus[`${key}__rev`] || 0 };
  }

  const revenueByMonth = {};
  const weightedRevenueByMonth = {};
  const revenueByDate = {};
  const weightedRevenueByDate = {};
  for (const p of forecastDeals) {
    const rev = deriveEstimatedRevenue(p);
    const wRev = weightedRevenue(p);
    const monthKey = resolveExpectedCloseMonth(p);
    if (monthKey) {
      addMoney(revenueByMonth, monthKey, rev);
      addMoney(weightedRevenueByMonth, monthKey, wRev);
    }
    const dateKey = resolveExpectedCloseDate(p);
    if (dateKey) {
      addMoney(revenueByDate, dateKey, rev);
      addMoney(weightedRevenueByDate, dateKey, wRev);
    }
  }

  const blockerCounts = {};
  for (const p of rows.filter(isQualifiedForBlockers)) {
    const b = p.primaryBlocker || "unset";
    if (b !== "none" && b !== "unset") increment(blockerCounts, b);
  }

  const likelihoodBuckets = { "0-25": 0, "26-50": 0, "51-75": 0, "76-100": 0, unset: 0 };
  let likelihoodSum = 0, likelihoodCount = 0;
  for (const p of openDeals) {
    const pct = p.closeLikelihoodPct;
    if (!Number.isFinite(pct)) { likelihoodBuckets.unset++; continue; }
    likelihoodSum += pct; likelihoodCount++;
    if (pct <= 25) likelihoodBuckets["0-25"]++;
    else if (pct <= 50) likelihoodBuckets["26-50"]++;
    else if (pct <= 75) likelihoodBuckets["51-75"]++;
    else likelihoodBuckets["76-100"]++;
  }

  let activitySum = 0, activityCount = 0;
  const activityDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, unset: 0 };
  for (const p of openDeals) {
    const score = p.activityScore;
    if (!Number.isFinite(score)) { activityDistribution.unset++; continue; }
    activitySum += score; activityCount++;
    increment(activityDistribution, String(score));
  }

  let prioritySum = 0;
  let priorityCount = 0;
  const priorityDistribution = { low: 0, medium: 0, high: 0, unset: 0 };
  const priorityWeighted = { low: 0, medium: 0, high: 0, unset: 0 };
  for (const p of openDeals) {
    const pr = resolvePriority(p, deriveAutoRevenue(p));
    const wRev = weightedRevenue(p);
    if (!pr || !["low", "medium", "high"].includes(pr)) {
      priorityDistribution.unset++;
      priorityWeighted.unset += wRev;
      continue;
    }
    priorityDistribution[pr]++;
    priorityWeighted[pr] += wRev;
    prioritySum += pr === "low" ? 1 : pr === "medium" ? 2 : 3;
    priorityCount++;
  }

  const dealTypeCounts = {};
  for (const p of openDeals) {
    const kw = deriveSystemSizeKw(p.snapshot);
    const dt = resolveDealType(p, kw) || "unset";
    increment(dealTypeCounts, dt);
    addMoney(dealTypeCounts, `${dt}__rev`, deriveEstimatedRevenue(p));
    addMoney(dealTypeCounts, `${dt}__kw`, kw);
  }

  const projectsBySize = CRM_DEAL_TYPE_OPTIONS.filter((opt) => opt.value).map((opt) => ({
    dealType: opt.value,
    label: crmDealTypeShortLabel(opt.value),
    count: dealTypeCounts[opt.value] || 0,
    revenue: dealTypeCounts[`${opt.value}__rev`] || 0,
    systemKw: dealTypeCounts[`${opt.value}__kw`] || 0,
  }));

  const financingCounts = {};
  for (const p of openDeals) {
    const fin = p.financing || "unset";
    increment(financingCounts, fin);
    addMoney(financingCounts, `${fin}__rev`, deriveEstimatedRevenue(p));
  }

  const projectsByFinancing = CRM_FINANCING_OPTIONS.filter((opt) => opt.value).map((opt) => ({
    financing: opt.value,
    label: opt.label,
    count: financingCounts[opt.value] || 0,
    revenue: financingCounts[`${opt.value}__rev`] || 0,
  }));
  const unsetFinancingCount = financingCounts.unset || 0;
  if (unsetFinancingCount > 0) {
    projectsByFinancing.push({
      financing: "unset",
      label: "Unset",
      count: unsetFinancingCount,
      revenue: financingCounts["unset__rev"] || 0,
    });
  }

  const periodFunnel = hasPeriod ? buildPeriodFunnel(rows, from, to) : null;
  const periodNewDeals = periodFunnel?.periodNewDeals ?? (hasPeriod ? rows.filter((p) => inPeriodCreated(p, from, to)) : []);
  const periodNewOpen = periodNewDeals.filter(isOpenProposal);
  const periodSnapshot = hasPeriod ? summarizeDeals(periodNewOpen) : null;

  const proposalsCreated = { total: periodNewDeals.length };

  const won = rows.filter((p) => normalizeCrmStage(p.stage) === CRM_STAGE_SIGNED).length;
  const lost = rows.filter((p) => normalizeCrmStage(p.stage) === CRM_STAGE_LEAD_LOST).length;
  const winRate = won + lost > 0 ? won / (won + lost) : null;

  const allLeadLost = rows.filter((p) => normalizeCrmStage(p.stage) === CRM_STAGE_LEAD_LOST);
  const allSigned = rows.filter((p) => normalizeCrmStage(p.stage) === CRM_STAGE_SIGNED);

  const leadLostDeals = allLeadLost.map(mapDealRow).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 50);
  const signedDeals = allSigned.map(mapDealRow).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 50);

  const periodSignedCount = periodFunnel?.periodSignedCount ?? (hasPeriod
    ? rows.filter((p) => inPeriodUpdated(p, from, to) && normalizeCrmStage(p.stage) === CRM_STAGE_SIGNED).length
    : 0);
  const periodLostCount = periodFunnel?.periodLostCount ?? (hasPeriod
    ? rows.filter((p) => inPeriodUpdated(p, from, to) && normalizeCrmStage(p.stage) === CRM_STAGE_LEAD_LOST).length
    : 0);
  const periodWinRate = periodSignedCount + periodLostCount > 0 ? periodSignedCount / (periodSignedCount + periodLostCount) : null;

  const periodNeedsFollowUpCount = periodFunnel?.periodNeedsFollowUpCount ?? (hasPeriod
    ? rows.filter(
        (p) => inPeriodUpdated(p, from, to) && normalizeCrmStage(p.stage) === CRM_STAGE_NEEDS_FOLLOW_UP
      ).length
    : 0);

  const periodClosedDeals = hasPeriod
    ? rows
        .filter(
          (p) =>
            inPeriodUpdated(p, from, to) &&
            [CRM_STAGE_SIGNED, CRM_STAGE_LEAD_LOST].includes(normalizeCrmStage(p.stage))
        )
        .map((p) => ({
          ...mapDealRow(p),
          outcome: normalizeCrmStage(p.stage) === CRM_STAGE_SIGNED ? "signed" : "lost",
        }))
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(0, 50)
    : [];

  const needsFollowUpDeals = hasPeriod
    ? rows
        .filter(
          (p) => inPeriodUpdated(p, from, to) && normalizeCrmStage(p.stage) === CRM_STAGE_NEEDS_FOLLOW_UP
        )
        .map(mapDealRow)
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(0, 50)
    : [];

  const leadLostInPeriod = hasPeriod
    ? rows
        .filter((p) => inPeriodUpdated(p, from, to) && normalizeCrmStage(p.stage) === CRM_STAGE_LEAD_LOST)
        .map((p) => ({ ...mapDealRow(p), outcome: "lost" }))
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(0, 50)
    : [];

  const signedInPeriod = hasPeriod
    ? rows
        .filter((p) => inPeriodUpdated(p, from, to) && normalizeCrmStage(p.stage) === CRM_STAGE_SIGNED)
        .map((p) => ({ ...mapDealRow(p), outcome: "signed" }))
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(0, 50)
    : [];

  const activityInPeriod = hasPeriod
    ? rows
        .filter((p) => inPeriodUpdated(p, from, to))
        .map(mapDealRow)
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(0, 50)
    : [];

  const funnel = hasPeriod
    ? {
        proposalCreated: periodFunnel.proposalCreated,
        draftingProposal: periodFunnel.draftingProposal,
        proposalApproved: periodFunnel.proposalApproved,
        proposalRevision: periodFunnel.proposalRevision,
        proposalSent: periodFunnel.proposalSent,
        proposalNegotiation: periodFunnel.proposalNegotiation,
        needsFollowUp: periodFunnel.needsFollowUp,
        proposalSigned: periodFunnel.proposalSigned,
        leadLost: periodFunnel.leadLost,
      }
    : {
        proposalCreated: 0,
        draftingProposal: 0,
        proposalApproved: 0,
        proposalRevision: 0,
        proposalSent: 0,
        proposalNegotiation: 0,
        needsFollowUp: 0,
        proposalSigned: 0,
        leadLost: 0,
      };

  const daysToSendSamples = rows.filter((p) => p.status === "sent" || p.status === "closed").map((p) => daysBetween(p.createdAt, p.updatedAt)).filter((d) => d != null && d >= 0);
  const avgDaysToSend = daysToSendSamples.length > 0 ? Math.round(daysToSendSamples.reduce((a, b) => a + b, 0) / daysToSendSamples.length) : null;

  const newProjects = periodNewDeals
    .map(mapDealRow)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 50);

  const activeOpportunities = openDeals
    .map(mapDealRow)
    .sort((a, b) => b.weightedRevenue - a.weightedRevenue);

  return {
    summary: {
      totalProposals: rows.length,
      openOpportunities: openDeals.length,
      pipelineUnweighted: system.pipelineUnweighted,
      pipelineWeighted: system.pipelineWeighted,
      winRate,
      avgCloseLikelihood: system.avgCloseLikelihood,
      avgActivityScore: activityCount > 0 ? Math.round((activitySum / activityCount) * 10) / 10 : null,
      avgPriorityScore: priorityCount > 0 ? Math.round((prioritySum / priorityCount) * 10) / 10 : null,
      avgDaysToSend,
      totalOpenSystemKw: system.totalSystemKw,
      openDealsMissingSystemKw: system.openDealsMissingSystemKw,
    },
    systemPipeline: { byStage: stageSummary, byStatus: statusSummary },
    period: hasPeriod
      ? {
          newProjects,
          newProjectsOpen: periodSnapshot?.count ?? 0,
          closedDeals: periodClosedDeals,
          needsFollowUpDeals,
          leadLostInPeriod,
          signedInPeriod,
          activityInPeriod,
          conversionFunnel: funnel,
          summary: {
            newCount: periodNewDeals.length,
            newOpenCount: periodSnapshot?.count ?? 0,
            newWeighted: periodSnapshot?.pipelineWeighted ?? 0,
            newSystemKw: periodSnapshot?.totalSystemKw ?? 0,
            signedCount: periodSignedCount,
            lostCount: periodLostCount,
            needsFollowUpCount: periodNeedsFollowUpCount,
            winRate: periodWinRate,
          },
        }
      : null,
    pipelineHealth: { byStage: stageSummary, byStatus: statusSummary },
    activeOpportunities,
    financialForecast: { unweighted: system.pipelineUnweighted, weighted: system.pipelineWeighted },
    opportunityForecast: stageSummary,
    activityScore: { average: activityCount > 0 ? Math.round((activitySum / activityCount) * 10) / 10 : null, distribution: activityDistribution },
    closeLikelihood: { average: likelihoodCount > 0 ? Math.round(likelihoodSum / likelihoodCount) : null, distribution: likelihoodBuckets },
    priority: {
      average: priorityCount > 0 ? Math.round((prioritySum / priorityCount) * 10) / 10 : null,
      distribution: priorityDistribution,
      weightedByPriority: priorityWeighted,
    },
    projectsBySize,
    projectsByFinancing,
    blockers: blockerCounts,
    revenueByMonth,
    weightedRevenueByMonth,
    revenueByDate,
    weightedRevenueByDate,
    proposalsCreated,
    leadLostDeals,
    signedDeals,
    conversionFunnel: funnel,
    systemSizeByStage: Object.fromEntries(
      Object.entries(stageSummary).map(([k, v]) => [k, { kw: v.systemKw, mw: Math.round((v.systemKw / 1000) * 100) / 100 }])
    ),
  };
}

/** @deprecated use aggregateSalesReport */
export function aggregateBiweeklyReport(proposals, opts) {
  return aggregateSalesReport(proposals, opts);
}

export function reportToCsv(report, period, reportView = REPORT_VIEW_PIPELINE) {
  const typeLabel = REPORT_VIEW_OPTIONS.find((o) => o.value === reportView)?.label || "Sales";
  const lines = [];
  lines.push(`${typeLabel} Sales Report,${period.label}`);
  lines.push(`Period,${period.from},${period.to}`);
  lines.push("");
  lines.push("Summary");
  lines.push(`Open opportunities,${report.summary.openOpportunities}`);
  lines.push(`Pipeline (unweighted),${report.summary.pipelineUnweighted}`);
  lines.push(`Pipeline (weighted),${report.summary.pipelineWeighted}`);
  lines.push(`Avg close likelihood,${report.summary.avgCloseLikelihood ?? ""}`);
  lines.push(`Avg activity score,${report.summary.avgActivityScore ?? ""}`);
  lines.push(`Avg days to send,${report.summary.avgDaysToSend ?? ""}`);
  lines.push(`Total open kW,${Math.round(report.summary.totalOpenSystemKw)}`);
  lines.push("");
  lines.push("Conversion funnel");
  const f = report.conversionFunnel || {};
  lines.push(`Proposal created,${f.proposalCreated ?? 0}`);
  lines.push(`Drafting proposal,${f.draftingProposal ?? 0}`);
  lines.push(`Proposal approved,${f.proposalApproved ?? 0}`);
  lines.push(`Proposal sent,${f.proposalSent ?? 0}`);
  lines.push(`Proposal negotiation,${f.proposalNegotiation ?? 0}`);
  lines.push(`Proposal revision,${f.proposalRevision ?? 0}`);
  lines.push(`Needs follow-up,${f.needsFollowUp ?? 0}`);
  lines.push(`Proposal signed,${f.proposalSigned ?? 0}`);
  lines.push(`Lead lost,${f.leadLost ?? 0}`);
  lines.push("");
  lines.push("Proposals created this period");
  lines.push(`Total,${report.proposalsCreated.total}`);
  lines.push("");
  lines.push("Revenue by month (unweighted)");
  for (const [month, amt] of Object.entries(report.revenueByMonth).sort()) lines.push(`${month},${Math.round(amt)}`);
  lines.push("");
  lines.push("Revenue by close date (unweighted)");
  for (const [date, amt] of Object.entries(report.revenueByDate || {}).sort()) lines.push(`${date},${Math.round(amt)}`);
  lines.push("");
  lines.push("Blockers");
  for (const [blocker, count] of Object.entries(report.blockers).sort((a, b) => b[1] - a[1])) lines.push(`${blocker},${count}`);
  return lines.join("\n");
}
