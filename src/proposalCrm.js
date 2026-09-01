import {
  PROPOSAL_STATUS_CLOSED,
  PROPOSAL_STATUS_IN_PROGRESS,
  PROPOSAL_STATUS_READY,
  PROPOSAL_STATUS_SENT,
} from "./proposalStorage.js";
import {
  CRM_ACTIVITY_OPTIONS,
  CRM_BLOCKER_OPTIONS,
  CRM_DEAL_TYPE_OPTIONS,
  CRM_LIKELIHOOD_OPTIONS,
  CRM_PRIORITY_OPTIONS,
  CRM_STAGE_CREATED,
  CRM_STAGE_OPTIONS,
  CRM_STAGE_OPTIONS_CLOSED,
  CRM_STAGE_OPTIONS_OPEN,
  crmBlockerLabel,
  crmDealTypeLabel,
  crmDealTypeShortLabel,
  crmDealTypeAbbrevLabel,
  CRM_PROJECT_TYPE_SELECT_OPTIONS,
  CRM_DEAL_TYPE_SELECT_OPTIONS,
  CRM_FINANCING_OPTIONS,
  crmFinancingLabel,
  crmProjectCategoryLabel,
  storedDealType,
  storedProjectCategory,
  crmLikelihoodColor,
  crmLikelihoodAccentColor,
  crmLikelihoodLabel,
  crmPriorityColor,
  crmPriorityLabel,
  crmStageColor,
  crmStageLabel,
  crmStageReportLabel,
  CRM_DEAL_TYPE_FILTER_OPTIONS,
  deriveDealTypeFromKw,
  derivePriority,
  isClosedProposal,
  normalizeCrmStage,
  resolveDealType,
  resolveProjectCategory,
  resolvePriority,
} from "../shared/proposalCrmFields.js";
import { deriveAutoRevenue, deriveEstimatedRevenue, deriveSystemSizeKw } from "../shared/reportMetrics.js";
import { formatUsd } from "./solarPricing.js";

export {
  CRM_ACTIVITY_OPTIONS,
  CRM_BLOCKER_OPTIONS,
  CRM_DEAL_TYPE_OPTIONS,
  CRM_LIKELIHOOD_OPTIONS,
  CRM_PRIORITY_OPTIONS,
  CRM_STAGE_CREATED,
  CRM_STAGE_OPTIONS,
  CRM_STAGE_OPTIONS_CLOSED,
  CRM_STAGE_OPTIONS_OPEN,
  crmBlockerLabel,
  crmDealTypeLabel,
  crmDealTypeShortLabel,
  crmDealTypeAbbrevLabel,
  CRM_PROJECT_TYPE_SELECT_OPTIONS,
  CRM_DEAL_TYPE_SELECT_OPTIONS,
  CRM_FINANCING_OPTIONS,
  crmFinancingLabel,
  crmProjectCategoryLabel,
  storedDealType,
  storedProjectCategory,
  crmLikelihoodColor,
  crmLikelihoodAccentColor,
  crmLikelihoodLabel,
  crmPriorityColor,
  crmPriorityLabel,
  crmStageColor,
  crmStageLabel,
  crmStageReportLabel,
  CRM_DEAL_TYPE_FILTER_OPTIONS,
  deriveDealTypeFromKw,
  derivePriority,
  isClosedProposal,
  normalizeCrmStage,
  resolveDealType,
  resolveProjectCategory,
  resolvePriority,
};

export { deriveAutoRevenue, deriveEstimatedRevenue };

/** @deprecated stages replace status in the UI */
export const CRM_STATUS_OPTIONS = [
  { value: PROPOSAL_STATUS_IN_PROGRESS, label: "In progress", tone: "blue" },
  { value: PROPOSAL_STATUS_READY, label: "Proposal ready", tone: "teal" },
  { value: PROPOSAL_STATUS_SENT, label: "Sent", tone: "gold" },
  { value: PROPOSAL_STATUS_CLOSED, label: "Closed", tone: "gray" },
];

export function crmProjectName(proposal) {
  const snap = proposal?.snapshot || {};
  return (
    String(proposal?.projectName || "").trim() ||
    String(proposal?.title || "").trim() ||
    String(snap.custName || "").trim() ||
    "Untitled project"
  );
}

export function crmAddress(proposal) {
  const snap = proposal?.snapshot || {};
  return String(snap.custAddress || snap.siteAddress || "").trim() || "—";
}

export function crmContact(proposal) {
  const snap = proposal?.snapshot || {};
  const parts = [snap.custEmail, snap.custPhone].map((v) => String(v || "").trim()).filter(Boolean);
  return parts.length ? parts.join(" · ") : "—";
}

export function crmSystemKw(proposal) {
  return deriveSystemSizeKw(proposal?.snapshot);
}

export function crmSystemSizeDisplay(proposal) {
  const kw = crmSystemKw(proposal);
  if (!Number.isFinite(kw) || kw <= 0) return "—";
  if (kw >= 1000) return `${(kw / 1000).toFixed(kw >= 10000 ? 1 : 2)} MW`;
  return `${kw.toFixed(kw >= 100 ? 0 : 1)} kW`;
}

/** @deprecated use crmSystemSizeDisplay */
export function crmSystemSummary(proposal) {
  return crmSystemSizeDisplay(proposal);
}

export function crmDealTypeDisplay(proposal) {
  const kw = crmSystemKw(proposal);
  const category = resolveProjectCategory(proposal, kw);
  return crmProjectCategoryLabel(category);
}

export function crmDealTypeShortDisplay(proposal) {
  const kw = crmSystemKw(proposal);
  const category = resolveProjectCategory(proposal, kw);
  return crmProjectCategoryLabel(category);
}

export function crmDealTypeAbbrevDisplay(proposal) {
  return crmDealTypeShortDisplay(proposal);
}

export function crmRevenue(proposal) {
  return deriveEstimatedRevenue(proposal);
}

export function crmRevenueLabel(proposal) {
  const rev = crmRevenue(proposal);
  return rev > 0 ? formatUsd(rev) : "—";
}

export function crmStatusMeta(status) {
  const normalized = status === "complete" ? PROPOSAL_STATUS_READY : status;
  return CRM_STATUS_OPTIONS.find((o) => o.value === normalized) || CRM_STATUS_OPTIONS[0];
}

export function crmCanDownloadPdf(proposal) {
  return (proposal?.snapshot?.step ?? 0) >= 5;
}

export function crmFormatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function crmFormatDateShort(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function crmResolveCloseDate(proposal) {
  if (proposal?.expectedCloseDate) return proposal.expectedCloseDate;
  if (proposal?.expectedCloseMonth) return `${proposal.expectedCloseMonth}-15`;
  if (proposal?.createdAt) return String(proposal.createdAt).slice(0, 10);
  return "";
}
