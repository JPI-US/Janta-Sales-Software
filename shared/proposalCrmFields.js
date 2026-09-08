/** Pipeline stages aligned with sales report funnel (+ drafting, revision, negotiation). */
export const CRM_STAGE_CREATED = "proposal_created";
export const CRM_STAGE_DRAFTING = "drafting_proposal";
export const CRM_STAGE_APPROVED = "proposal_approved";
export const CRM_STAGE_REVISION = "proposal_revision";
export const CRM_STAGE_SENT = "proposal_sent";
export const CRM_STAGE_NEGOTIATION = "proposal_negotiation";
export const CRM_STAGE_NEEDS_FOLLOW_UP = "needs_follow_up";
export const CRM_STAGE_SIGNED = "signed";
export const CRM_STAGE_LEAD_LOST = "lead_lost";

/** @deprecated */
export const CRM_STAGE_QUALIFIED = CRM_STAGE_CREATED;
/** @deprecated use CRM_STAGE_DRAFTING */
export const CRM_STAGE_PROPOSAL = CRM_STAGE_DRAFTING;
/** @deprecated use CRM_STAGE_NEEDS_FOLLOW_UP */
export const CRM_STAGE_VERBAL_COMMIT = CRM_STAGE_NEEDS_FOLLOW_UP;
/** @deprecated use CRM_STAGE_SIGNED */
export const CRM_STAGE_CLOSED_WON = CRM_STAGE_SIGNED;
/** @deprecated use CRM_STAGE_LEAD_LOST */
export const CRM_STAGE_CLOSED_LOST = CRM_STAGE_LEAD_LOST;

export const CRM_STAGE_OPTIONS = [
  { value: "", label: "—" },
  { value: CRM_STAGE_CREATED, label: "Proposal created" },
  { value: CRM_STAGE_DRAFTING, label: "Drafting proposal" },
  { value: CRM_STAGE_APPROVED, label: "Proposal approved" },
  { value: CRM_STAGE_SENT, label: "Proposal sent" },
  { value: CRM_STAGE_NEGOTIATION, label: "Proposal negotiation" },
  { value: CRM_STAGE_REVISION, label: "Proposal revision" },
  { value: CRM_STAGE_NEEDS_FOLLOW_UP, label: "Needs follow-up" },
  { value: CRM_STAGE_SIGNED, label: "Proposal signed" },
  { value: CRM_STAGE_LEAD_LOST, label: "Lead lost" },
];

export const CRM_STAGE_OPTIONS_OPEN = CRM_STAGE_OPTIONS.filter(
  (o) => !o.value || ![CRM_STAGE_SIGNED, CRM_STAGE_LEAD_LOST].includes(o.value)
);

export const CRM_STAGE_OPTIONS_CLOSED = [
  { value: CRM_STAGE_SIGNED, label: "Proposal signed" },
  { value: CRM_STAGE_LEAD_LOST, label: "Lead lost" },
  { value: CRM_STAGE_CREATED, label: "Reopen (proposal created)" },
];

const LEGACY_STAGE_MAP = {
  qualified: CRM_STAGE_CREATED,
  proposal: CRM_STAGE_DRAFTING,
  negotiation: CRM_STAGE_NEGOTIATION,
  verbal_commit: CRM_STAGE_NEEDS_FOLLOW_UP,
  closed_won: CRM_STAGE_SIGNED,
  closed_lost: CRM_STAGE_LEAD_LOST,
};

export function normalizeCrmStage(stage) {
  if (!stage) return null;
  return LEGACY_STAGE_MAP[stage] || stage;
}

const STAGE_DRAFT = { bg: "#EEF1F6", text: "#5B6B82", dot: "#94A3B8" };
const STAGE_SENT = { bg: "#E7F0FF", text: "#1D4ED8", dot: "#3B82F6" };
const STAGE_NEGOTIATION = { bg: "#FFF3DE", text: "#B26A00", dot: "#F3B664" };
const STAGE_WON = { bg: "#E4F7EC", text: "#07794C", dot: "#16A34A" };
const STAGE_LOST = { bg: "#FDE9E9", text: "#B42318", dot: "#EF4444" };

/** Soft chips: bg + text + dot. Charts should use `dot`. */
export const CRM_STAGE_COLORS = {
  [CRM_STAGE_CREATED]: STAGE_DRAFT,
  [CRM_STAGE_DRAFTING]: STAGE_DRAFT,
  [CRM_STAGE_APPROVED]: STAGE_DRAFT,
  [CRM_STAGE_REVISION]: STAGE_NEGOTIATION,
  [CRM_STAGE_SENT]: STAGE_SENT,
  [CRM_STAGE_NEGOTIATION]: STAGE_NEGOTIATION,
  [CRM_STAGE_NEEDS_FOLLOW_UP]: STAGE_NEGOTIATION,
  [CRM_STAGE_SIGNED]: STAGE_WON,
  [CRM_STAGE_LEAD_LOST]: STAGE_LOST,
};

export function crmStageColor(stage) {
  const key = normalizeCrmStage(stage);
  return CRM_STAGE_COLORS[key] || STAGE_DRAFT;
}

export const CRM_DEAL_TYPE_PILOT = "pilot";
export const CRM_DEAL_TYPE_RESIDENTIAL = "residential";
export const CRM_DEAL_TYPE_SMALL_COMMERCIAL = "small_commercial";
export const CRM_DEAL_TYPE_COMMERCIAL = "commercial";
export const CRM_DEAL_TYPE_LARGE_COMMERCIAL = "large_commercial";
export const CRM_DEAL_TYPE_DISTRIBUTED_UTILITY = "distributed_utility";
export const CRM_DEAL_TYPE_UTILITY_SCALE = "utility_scale";
export const CRM_DEAL_TYPE_LARGE_UTILITY = "large_utility";

export const CRM_DEAL_TYPE_OPTIONS = [
  { value: "", label: "Auto (from size)" },
  { value: CRM_DEAL_TYPE_PILOT, label: "Pilot" },
  { value: CRM_DEAL_TYPE_RESIDENTIAL, label: "Residential" },
  { value: CRM_DEAL_TYPE_SMALL_COMMERCIAL, label: "Small commercial (0–250 kW)" },
  { value: CRM_DEAL_TYPE_COMMERCIAL, label: "Commercial (250 kW–1 MW)" },
  { value: CRM_DEAL_TYPE_LARGE_COMMERCIAL, label: "Large commercial (1–5 MW)" },
  { value: CRM_DEAL_TYPE_DISTRIBUTED_UTILITY, label: "Distributed utility (5–20 MW)" },
  { value: CRM_DEAL_TYPE_UTILITY_SCALE, label: "Utility scale (20–100 MW)" },
  { value: CRM_DEAL_TYPE_LARGE_UTILITY, label: "Large utility (100 MW+)" },
];

export function deriveDealTypeFromKw(kw) {
  if (!Number.isFinite(kw) || kw <= 0) return null;
  if (kw < 250) return CRM_DEAL_TYPE_SMALL_COMMERCIAL;
  if (kw < 1000) return CRM_DEAL_TYPE_COMMERCIAL;
  if (kw < 5000) return CRM_DEAL_TYPE_LARGE_COMMERCIAL;
  if (kw < 20000) return CRM_DEAL_TYPE_DISTRIBUTED_UTILITY;
  if (kw < 100000) return CRM_DEAL_TYPE_UTILITY_SCALE;
  return CRM_DEAL_TYPE_LARGE_UTILITY;
}

/** Report / filter categories — Utility and Commercial roll up size buckets. */
export const CRM_PROJECT_TYPE_UTILITY = "utility";
export const CRM_PROJECT_TYPE_COMMERCIAL = "commercial";

export const CRM_PROJECT_TYPE_OPTIONS = [
  { value: CRM_PROJECT_TYPE_UTILITY, label: "Utility" },
  { value: CRM_PROJECT_TYPE_COMMERCIAL, label: "Commercial" },
  { value: CRM_DEAL_TYPE_PILOT, label: "Pilot" },
  { value: CRM_DEAL_TYPE_RESIDENTIAL, label: "Residential" },
];

export function dealTypeToProjectCategory(dealType) {
  if (!dealType) return null;
  const d = String(dealType).trim();
  if (d === CRM_DEAL_TYPE_PILOT || d === CRM_DEAL_TYPE_RESIDENTIAL) return d;
  if (d === CRM_PROJECT_TYPE_UTILITY || d === CRM_PROJECT_TYPE_COMMERCIAL) return d;
  if (
    [
      CRM_DEAL_TYPE_SMALL_COMMERCIAL,
      CRM_DEAL_TYPE_COMMERCIAL,
      CRM_DEAL_TYPE_LARGE_COMMERCIAL,
    ].includes(d)
  ) {
    return CRM_PROJECT_TYPE_COMMERCIAL;
  }
  if (
    [
      CRM_DEAL_TYPE_DISTRIBUTED_UTILITY,
      CRM_DEAL_TYPE_UTILITY_SCALE,
      CRM_DEAL_TYPE_LARGE_UTILITY,
    ].includes(d)
  ) {
    return CRM_PROJECT_TYPE_UTILITY;
  }
  return null;
}

export function resolveProjectCategory(proposal, systemKw) {
  const manual = String(proposal?.dealType || "").trim();
  if (manual === CRM_DEAL_TYPE_PILOT || manual === CRM_DEAL_TYPE_RESIDENTIAL) return manual;
  if (manual === CRM_PROJECT_TYPE_UTILITY || manual === CRM_PROJECT_TYPE_COMMERCIAL) return manual;
  if (manual && manual !== "auto") return dealTypeToProjectCategory(manual);
  return dealTypeToProjectCategory(deriveDealTypeFromKw(systemKw));
}

export function crmProjectCategoryLabel(category) {
  return CRM_PROJECT_TYPE_OPTIONS.find((o) => o.value === category)?.label || "—";
}

export function resolveDealType(proposal, systemKw) {
  const manual = String(proposal?.dealType || "").trim();
  if (manual === CRM_DEAL_TYPE_PILOT || manual === CRM_DEAL_TYPE_RESIDENTIAL) return manual;
  if (manual === CRM_PROJECT_TYPE_UTILITY || manual === CRM_PROJECT_TYPE_COMMERCIAL) {
    return deriveDealTypeFromKw(systemKw) || manual;
  }
  if (manual && manual !== "auto") return manual;
  return deriveDealTypeFromKw(systemKw);
}

export function crmDealTypeLabel(dealType) {
  return CRM_DEAL_TYPE_OPTIONS.find((o) => o.value === dealType)?.label || "—";
}

/** Shorter label for tables/charts (drops kW/MW range in parentheses). */
export function crmDealTypeShortLabel(dealType) {
  const full = crmDealTypeLabel(dealType);
  if (full === "—") return full;
  return full.replace(/\s*\([^)]*\)\s*$/, "").trim() || full;
}

const CRM_DEAL_TYPE_ABBREVS = {
  [CRM_DEAL_TYPE_DISTRIBUTED_UTILITY]: "Dist. utility",
  [CRM_DEAL_TYPE_LARGE_UTILITY]: "Large utility",
};

/** Compact label for charts where space is tight; most types use the short label. */
export function crmDealTypeAbbrevLabel(dealType) {
  if (!dealType) return "—";
  return CRM_DEAL_TYPE_ABBREVS[dealType] || crmDealTypeShortLabel(dealType);
}

/** Select options: Auto + four project categories. */
export const CRM_PROJECT_TYPE_SELECT_OPTIONS = [
  { value: "", label: "Auto (from size)" },
  ...CRM_PROJECT_TYPE_OPTIONS.map((o) => ({
    value: o.value,
    label: o.label,
    display: o.label,
  })),
];

/** @deprecated use CRM_PROJECT_TYPE_SELECT_OPTIONS */
export const CRM_DEAL_TYPE_SELECT_OPTIONS = CRM_PROJECT_TYPE_SELECT_OPTIONS;

export function storedDealType(proposal) {
  const d = String(proposal?.dealType || "").trim();
  if (!d || d === "auto") return "";
  return d;
}

/** Normalize stored deal type to a project category for selects (handles legacy size buckets). */
export function storedProjectCategory(proposal) {
  const d = storedDealType(proposal);
  if (!d) return "";
  if (CRM_PROJECT_TYPE_OPTIONS.some((o) => o.value === d)) return d;
  return dealTypeToProjectCategory(d) || "";
}

export const CRM_FINANCING_SELF_PAY = "self_pay";
export const CRM_FINANCING_PPA = "ppa";
export const CRM_FINANCING_LOAN = "loan";

export const CRM_FINANCING_OPTIONS = [
  { value: "", label: "—" },
  { value: CRM_FINANCING_SELF_PAY, label: "Self-pay" },
  { value: CRM_FINANCING_PPA, label: "PPA" },
  { value: CRM_FINANCING_LOAN, label: "Loan" },
];

export function crmFinancingLabel(financing) {
  return CRM_FINANCING_OPTIONS.find((o) => o.value === financing)?.label || "—";
}

export const CRM_PRIORITY_LOW = "low";
export const CRM_PRIORITY_MEDIUM = "medium";
export const CRM_PRIORITY_HIGH = "high";

export const CRM_PRIORITY_OPTIONS = [
  { value: "", label: "—" },
  { value: CRM_PRIORITY_LOW, label: "Low", color: "#6F8096" },
  { value: CRM_PRIORITY_MEDIUM, label: "Medium", color: "#D3A14A" },
  { value: CRM_PRIORITY_HIGH, label: "High", color: "#B42318" },
];

export function crmPriorityLabel(priority) {
  return CRM_PRIORITY_OPTIONS.find((o) => o.value === priority)?.label || "—";
}

/** Auto priority from deal size / gross revenue when not manually set. */
export function derivePriority(proposal, autoRevenue) {
  const snap = proposal?.snapshot || {};
  const systemKw =
    snap.multiMeterMode && Array.isArray(snap.meters) && snap.meters.length > 0
      ? snap.meters.reduce((sum, m) => sum + (parseFloat(m.systemSizeKw) || 0), 0)
      : parseFloat(snap.systemSizeKw);
  const kwVal = Number.isFinite(systemKw) && systemKw > 0 ? systemKw : 0;

  let rev = typeof autoRevenue === "number" && autoRevenue > 0 ? autoRevenue : 0;
  if (!rev) {
    const gross = parseFloat(snap.grossCost);
    if (Number.isFinite(gross) && gross > 0) rev = gross;
  }

  const dealType = resolveDealType(proposal, kwVal);
  if (dealType === CRM_DEAL_TYPE_PILOT || dealType === CRM_DEAL_TYPE_RESIDENTIAL) return CRM_PRIORITY_LOW;
  if (
    dealType === CRM_PROJECT_TYPE_UTILITY ||
    dealType === CRM_DEAL_TYPE_LARGE_UTILITY ||
    dealType === CRM_DEAL_TYPE_UTILITY_SCALE ||
    dealType === CRM_DEAL_TYPE_DISTRIBUTED_UTILITY
  ) {
    return CRM_PRIORITY_HIGH;
  }
  if (dealType === CRM_DEAL_TYPE_LARGE_COMMERCIAL) return CRM_PRIORITY_MEDIUM;

  if (rev >= 3_000_000 || kwVal >= 5000) return CRM_PRIORITY_HIGH;
  if (rev >= 750_000 || kwVal >= 1000) return CRM_PRIORITY_MEDIUM;
  if (rev > 0 || kwVal > 0) return CRM_PRIORITY_LOW;
  return null;
}

export function resolvePriority(proposal, autoRevenue) {
  if (proposal?.priorityManual && proposal?.priority) return proposal.priority;
  const auto = derivePriority(proposal, autoRevenue);
  if (!proposal?.priorityManual && proposal?.priority && !proposal?.snapshot?.grossCost) {
    return proposal.priority;
  }
  return auto;
}

export const CRM_BLOCKER_OPTIONS = [
  { value: "", label: "—" },
  { value: "none", label: "None" },
  { value: "financing", label: "Financing" },
  { value: "hoa", label: "HOA" },
  { value: "utility", label: "Utility" },
  { value: "site", label: "Site" },
  { value: "pricing", label: "Pricing" },
  { value: "decision_maker", label: "Decision maker" },
  { value: "competition", label: "Competition" },
  { value: "other", label: "Other" },
];

export const CRM_LIKELIHOOD_OPTIONS = [
  { value: "", label: "—" },
  { value: 10, label: "Very Low", color: "#E53935" },
  { value: 25, label: "Low", color: "#EF9A9A" },
  { value: 50, label: "Medium", color: "#FFB74D" },
  { value: 75, label: "High", color: "#2E7D32" },
  { value: 90, label: "Very High", color: "#1B5E20" },
  { value: 100, label: "Near Certain", color: "#00838F" },
];

export function crmLikelihoodLabel(pct) {
  if (!Number.isFinite(pct)) return "—";
  return `${pct}%`;
}

export function crmLikelihoodColor(pct) {
  if (!Number.isFinite(pct)) return null;
  return CRM_LIKELIHOOD_OPTIONS.find((o) => o.value === pct)?.color || null;
}

/** Bucketed accent for averages and non-exact likelihood values. */
export function crmLikelihoodAccentColor(pct) {
  if (!Number.isFinite(pct)) return null;
  if (pct >= 90) return CRM_LIKELIHOOD_OPTIONS.find((o) => o.value === 100)?.color;
  if (pct >= 75) return CRM_LIKELIHOOD_OPTIONS.find((o) => o.value === 75)?.color;
  if (pct >= 50) return CRM_LIKELIHOOD_OPTIONS.find((o) => o.value === 50)?.color;
  if (pct >= 25) return CRM_LIKELIHOOD_OPTIONS.find((o) => o.value === 25)?.color;
  return CRM_LIKELIHOOD_OPTIONS.find((o) => o.value === 10)?.color;
}

export function crmPriorityColor(priority) {
  return CRM_PRIORITY_OPTIONS.find((o) => o.value === priority)?.color || null;
}

export const CRM_ACTIVITY_OPTIONS = [
  { value: "", label: "—" },
  { value: 1, label: "1 — Low" },
  { value: 2, label: "2" },
  { value: 3, label: "3 — Medium" },
  { value: 4, label: "4" },
  { value: 5, label: "5 — High" },
];

const CLOSED_STAGES = new Set([CRM_STAGE_SIGNED, CRM_STAGE_LEAD_LOST, "closed_won", "closed_lost"]);

export const CRM_OPEN_PIPELINE_STAGES = [
  CRM_STAGE_CREATED,
  CRM_STAGE_DRAFTING,
  CRM_STAGE_APPROVED,
  CRM_STAGE_SENT,
  CRM_STAGE_NEGOTIATION,
  CRM_STAGE_REVISION,
  CRM_STAGE_NEEDS_FOLLOW_UP,
];

export function crmStageLabel(stage) {
  const normalized = normalizeCrmStage(stage);
  return CRM_STAGE_OPTIONS.find((o) => o.value === normalized)?.label || "—";
}

const CRM_STAGE_REPORT_LABELS = {
  [CRM_STAGE_CREATED]: "Created",
  [CRM_STAGE_DRAFTING]: "Drafting",
  [CRM_STAGE_APPROVED]: "Approved",
  [CRM_STAGE_REVISION]: "Revision",
  [CRM_STAGE_SENT]: "Sent",
  [CRM_STAGE_NEGOTIATION]: "Negotiation",
  [CRM_STAGE_NEEDS_FOLLOW_UP]: "Follow-up",
  [CRM_STAGE_SIGNED]: "Signed",
  [CRM_STAGE_LEAD_LOST]: "Lost",
};

/** Short title-case labels for report tables. */
export function crmStageReportLabel(stage) {
  const normalized = normalizeCrmStage(stage);
  if (!normalized) return "—";
  if (CRM_STAGE_REPORT_LABELS[normalized]) return CRM_STAGE_REPORT_LABELS[normalized];
  const raw = normalized.replace(/^proposal_/, "").replace(/_/g, "");
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "—";
}

export const CRM_DEAL_TYPE_FILTER_OPTIONS = CRM_DEAL_TYPE_OPTIONS.filter((o) => o.value).map((o) => ({
  value: o.value,
  label: crmDealTypeShortLabel(o.value),
}));

export function crmBlockerLabel(blocker) {
  return CRM_BLOCKER_OPTIONS.find((o) => o.value === blocker)?.label || "—";
}

export function parseOptionalNumber(value) {
  if (value === "" || value == null) return null;
  const n = parseFloat(String(value).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function parseOptionalInt(value, { min = 0, max = 100 } = {}) {
  if (value === "" || value == null) return null;
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

export function pickCrmFieldsFromBody(body) {
  if (!body || typeof body !== "object") return {};
  const out = {};
  if ("stage" in body) out.stage = normalizeCrmStage(String(body.stage || "").trim() || null);
  if ("expectedCloseMonth" in body) {
    const m = String(body.expectedCloseMonth || "").trim();
    out.expectedCloseMonth = /^\d{4}-\d{2}$/.test(m) ? m : null;
  }
  if ("expectedCloseDate" in body) {
    const d = String(body.expectedCloseDate || "").trim();
    out.expectedCloseDate = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
    if (out.expectedCloseDate) out.expectedCloseMonth = out.expectedCloseDate.slice(0, 7);
  }
  if ("estimatedRevenue" in body) out.estimatedRevenue = parseOptionalNumber(body.estimatedRevenue);
  if ("estimatedRevenueManual" in body) out.estimatedRevenueManual = Boolean(body.estimatedRevenueManual);
  if ("closeLikelihoodPct" in body) out.closeLikelihoodPct = parseOptionalInt(body.closeLikelihoodPct);
  if ("activityScore" in body) out.activityScore = parseOptionalInt(body.activityScore, { min: 1, max: 5 });
  if ("primaryBlocker" in body) out.primaryBlocker = String(body.primaryBlocker || "").trim() || null;
  if ("blockerNotes" in body) out.blockerNotes = String(body.blockerNotes || "").trim().slice(0, 500) || null;
  if ("lastActivityAt" in body) {
    const raw = String(body.lastActivityAt || "").trim();
    out.lastActivityAt = raw && !Number.isNaN(new Date(raw).getTime()) ? new Date(raw).toISOString() : null;
  }
  if ("proposalOwner" in body) out.proposalOwner = String(body.proposalOwner || "").trim().slice(0, 120) || null;
  if ("priority" in body) {
    const p = String(body.priority || "").trim();
    out.priority = ["low", "medium", "high"].includes(p) ? p : null;
  }
  if ("priorityManual" in body) out.priorityManual = Boolean(body.priorityManual);
  if ("dealType" in body) {
    const d = String(body.dealType || "").trim();
    const allowed = new Set([
      ...CRM_PROJECT_TYPE_OPTIONS.map((o) => o.value),
      ...CRM_DEAL_TYPE_OPTIONS.map((o) => o.value).filter(Boolean),
    ]);
    out.dealType = d && allowed.has(d) ? d : null;
  }
  if ("financing" in body) {
    const f = String(body.financing || "").trim();
    const allowed = new Set(CRM_FINANCING_OPTIONS.map((o) => o.value).filter(Boolean));
    out.financing = f && allowed.has(f) ? f : null;
  }
  return out;
}

export function applyCrmDefaults(proposal) {
  if (!proposal) return proposal;
  return {
    ...proposal,
    stage: normalizeCrmStage(proposal.stage) ?? null,
    expectedCloseMonth: proposal.expectedCloseMonth ?? null,
    expectedCloseDate: proposal.expectedCloseDate ?? null,
    estimatedRevenue: proposal.estimatedRevenue ?? null,
    estimatedRevenueManual: Boolean(proposal.estimatedRevenueManual),
    closeLikelihoodPct: proposal.closeLikelihoodPct ?? null,
    activityScore: proposal.activityScore ?? null,
    primaryBlocker: proposal.primaryBlocker ?? null,
    blockerNotes: proposal.blockerNotes ?? null,
    lastActivityAt: proposal.lastActivityAt ?? null,
    proposalOwner: proposal.proposalOwner ?? null,
    priority: proposal.priority ?? null,
    priorityManual: Boolean(proposal.priorityManual),
    dealType: proposal.dealType ?? null,
    financing: proposal.financing ?? null,
  };
}

export function isClosedStage(stage) {
  return CLOSED_STAGES.has(normalizeCrmStage(stage));
}

export function isClosedProposal(proposal) {
  if (proposal?.status === "closed") return true;
  return isClosedStage(proposal?.stage);
}

export function isOpenProposal(proposal) {
  return !isClosedProposal(proposal);
}

export function isQualifiedForBlockers(proposal) {
  const stage = normalizeCrmStage(proposal?.stage);
  if (stage === CRM_STAGE_LEAD_LOST) return false;
  if (stage && !isClosedStage(stage)) {
    return CRM_OPEN_PIPELINE_STAGES.includes(stage);
  }
  return !isClosedProposal(proposal);
}

export function effectiveLastActivity(proposal) {
  return proposal?.lastActivityAt || proposal?.updatedAt || proposal?.createdAt || null;
}
