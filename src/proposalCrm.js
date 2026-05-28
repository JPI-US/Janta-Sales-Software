import {
  PROPOSAL_STATUS_CLOSED,
  PROPOSAL_STATUS_IN_PROGRESS,
  PROPOSAL_STATUS_READY,
  PROPOSAL_STATUS_SENT,
} from "./proposalStorage.js";

export const CRM_STATUS_OPTIONS = [
  { value: PROPOSAL_STATUS_IN_PROGRESS, label: "In progress", tone: "blue" },
  { value: PROPOSAL_STATUS_READY, label: "Proposal ready", tone: "teal" },
  { value: PROPOSAL_STATUS_SENT, label: "Sent", tone: "gold" },
  { value: PROPOSAL_STATUS_CLOSED, label: "Closed", tone: "gray" },
];

const STEP_LABELS = ["Bill & usage", "System", "Pricing", "Financials", "Shadow", "Proposal"];

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

export function crmStepLabel(proposal) {
  const step = proposal?.snapshot?.step ?? 0;
  return STEP_LABELS[step] || STEP_LABELS[0];
}

export function crmSystemSummary(proposal) {
  const snap = proposal?.snapshot || {};
  if (snap.multiMeterMode && Array.isArray(snap.meters) && snap.meters.length > 0) {
    const total = snap.meters.reduce((sum, m) => sum + (parseFloat(m.systemSizeKw) || 0), 0);
    const kw = total > 0 ? `${total.toFixed(1)} kW total` : "—";
    return `${snap.meters.length} meter${snap.meters.length === 1 ? "" : "s"} · ${kw}`;
  }
  const kw = parseFloat(snap.systemSizeKw);
  return Number.isFinite(kw) && kw > 0 ? `${kw.toFixed(1)} kW` : "—";
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
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
