import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  CRM_STATUS_OPTIONS,
  crmAddress,
  crmCanDownloadPdf,
  crmContact,
  crmFormatDate,
  crmProjectName,
  crmStatusMeta,
  crmStepLabel,
  crmSystemSummary,
} from "./proposalCrm.js";
import {
  deleteProposal,
  listProposalsForUser,
  saveProposal,
} from "./proposalStorage.js";

const fontSans = "Inter, system-ui, sans-serif";

const FILTER_ALL = "all";

export default function ProposalsLibrary({
  userId,
  userName,
  userEmail,
  isDark,
  onOpenProposal,
  onDownloadProposalPdf,
  onNewProposal,
  onOpenSettings,
  onSignOut,
  onDarkModeToggle,
}) {
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [statusFilter, setStatusFilter] = useState(FILTER_ALL);
  const [search, setSearch] = useState("");
  const [downloadingId, setDownloadingId] = useState(null);
  const [statusBusyId, setStatusBusyId] = useState(null);

  const loadProposals = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await listProposalsForUser(userId);
      setProposals(rows);
    } catch (err) {
      setError(err.message || "Could not load proposals from cloud.");
      setProposals([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadProposals();
  }, [loadProposals]);

  const bg = isDark ? "#000000" : "#F3F4F6";
  const panel = isDark ? "#1A1510" : "#FFFFFF";
  const border = isDark ? "#3A2B1D" : "#DDE2E8";
  const title = isDark ? "#F8F2E8" : "#2F3B4C";
  const subtle = isDark ? "#D8C6AE" : "#6F8096";
  const headBg = isDark ? "#120E0A" : "#F9FAFB";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return proposals.filter((p) => {
      if (statusFilter !== FILTER_ALL && p.status !== statusFilter) return false;
      if (!q) return true;
      const hay = [
        crmProjectName(p),
        crmAddress(p),
        crmContact(p),
        crmStepLabel(p),
        crmStatusMeta(p.status).label,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [proposals, statusFilter, search]);

  const counts = useMemo(() => {
    const c = { all: proposals.length };
    CRM_STATUS_OPTIONS.forEach((o) => {
      c[o.value] = proposals.filter((p) => p.status === o.value).length;
    });
    return c;
  }, [proposals]);

  async function handleDelete(p) {
    const label = crmProjectName(p);
    if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) return;
    try {
      await deleteProposal(p.id, userId);
      await loadProposals();
    } catch (err) {
      window.alert(err.message || "Delete failed");
    }
  }

  async function handleStatusChange(p, nextStatus) {
    if (p.status === nextStatus) return;
    setStatusBusyId(p.id);
    try {
      await saveProposal({
        userId,
        id: p.id,
        title: p.title,
        snapshot: p.snapshot,
        status: nextStatus,
      });
      await loadProposals();
    } catch (err) {
      window.alert(err.message || "Could not update status");
    } finally {
      setStatusBusyId(null);
    }
  }

  async function handleDownload(p) {
    if (!crmCanDownloadPdf(p)) {
      window.alert("Open this project and complete the Proposal step before downloading a PDF.");
      return;
    }
    setDownloadingId(p.id);
    try {
      if (typeof onDownloadProposalPdf === "function") {
        await onDownloadProposalPdf(p);
      }
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleNew() {
    setCreating(true);
    try {
      await onNewProposal();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: bg, fontFamily: fontSans }}>
      <div
        style={{
          background: "#2F3B4C",
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <img
            src="/assets/janta-logo-cropped.svg"
            alt="Janta Power"
            style={{ height: 40, width: "auto", display: "block", marginBottom: 8 }}
          />
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#F8F2E8" }}>Projects</h1>
          <p style={{ margin: "4px 0 0 0", fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
            {userName || "Signed in"}
            {userEmail ? ` · ${userEmail}` : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" onClick={onDarkModeToggle} style={headerBtn(false)} title="Toggle theme">
            {isDark ? "☀️" : "🌙"}
          </button>
          <button type="button" onClick={onOpenSettings} style={headerBtn(false)}>
            Settings
          </button>
          <button type="button" onClick={onSignOut} style={headerBtn(false)}>
            Sign out
          </button>
          <button type="button" onClick={handleNew} disabled={creating} style={headerBtn(true)}>
            {creating ? "Creating…" : "+ New project"}
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: 20 }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <FilterChip
              active={statusFilter === FILTER_ALL}
              label={`All (${counts.all})`}
              onClick={() => setStatusFilter(FILTER_ALL)}
              isDark={isDark}
            />
            {CRM_STATUS_OPTIONS.map((o) => (
              <FilterChip
                key={o.value}
                active={statusFilter === o.value}
                label={`${o.label} (${counts[o.value] || 0})`}
                onClick={() => setStatusFilter(o.value)}
                isDark={isDark}
              />
            ))}
          </div>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects…"
            style={{
              minWidth: 220,
              padding: "9px 12px",
              borderRadius: 8,
              border: `1px solid ${border}`,
              background: isDark ? "#120E0A" : "#fff",
              color: title,
              fontSize: 13,
              fontFamily: fontSans,
            }}
          />
        </div>

        {error ? (
          <div
            style={{
              background: isDark ? "#2D1612" : "#FFF5F5",
              border: `1px solid ${isDark ? "#5B2921" : "#F1B8B8"}`,
              borderRadius: 10,
              padding: 14,
              marginBottom: 14,
              color: isDark ? "#F9C8C1" : "#B42318",
              fontSize: 13,
            }}
          >
            {error}
            <button
              type="button"
              onClick={loadProposals}
              style={{ ...actionBtn(isDark, "primary"), marginTop: 10, display: "block" }}
            >
              Retry
            </button>
          </div>
        ) : null}

        {loading ? (
          <div style={{ color: subtle, fontSize: 14, padding: 24, textAlign: "center" }}>Loading projects…</div>
        ) : filtered.length === 0 ? (
          <div
            style={{
              background: panel,
              border: `1px solid ${border}`,
              borderRadius: 10,
              padding: 28,
              textAlign: "center",
              color: subtle,
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            {proposals.length === 0
              ? "No projects yet. Create one to get started."
              : "No projects match your search or filter."}
          </div>
        ) : (
          <div
            style={{
              background: panel,
              border: `1px solid ${border}`,
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: headBg, borderBottom: `1px solid ${border}` }}>
                    {["Project", "Address", "Contact", "Status", "Pipeline", "System", "Updated", "Actions"].map(
                      (h) => (
                        <th
                          key={h}
                          style={{
                            textAlign: "left",
                            padding: "10px 12px",
                            fontWeight: 700,
                            color: title,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const statusMeta = crmStatusMeta(p.status);
                    const pdfReady = crmCanDownloadPdf(p);
                    return (
                      <tr key={p.id} style={{ borderBottom: `1px solid ${border}` }}>
                        <td style={{ padding: "12px", verticalAlign: "top", minWidth: 140 }}>
                          <div style={{ fontWeight: 700, color: title, marginBottom: 2 }}>{crmProjectName(p)}</div>
                        </td>
                        <td
                          style={{
                            padding: "12px",
                            verticalAlign: "top",
                            color: subtle,
                            maxWidth: 200,
                            lineHeight: 1.4,
                          }}
                        >
                          {crmAddress(p)}
                        </td>
                        <td style={{ padding: "12px", verticalAlign: "top", color: subtle, maxWidth: 180 }}>
                          {crmContact(p)}
                        </td>
                        <td style={{ padding: "12px", verticalAlign: "top" }}>
                          <select
                            value={
                              p.status === "complete" ? "ready" : p.status || CRM_STATUS_OPTIONS[0].value
                            }
                            disabled={statusBusyId === p.id}
                            onChange={(e) => handleStatusChange(p, e.target.value)}
                            style={statusSelectStyle(isDark, statusMeta.tone)}
                          >
                            {CRM_STATUS_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: "12px", verticalAlign: "top", color: subtle, whiteSpace: "nowrap" }}>
                          {crmStepLabel(p)}
                        </td>
                        <td style={{ padding: "12px", verticalAlign: "top", color: subtle, whiteSpace: "nowrap" }}>
                          {crmSystemSummary(p)}
                        </td>
                        <td style={{ padding: "12px", verticalAlign: "top", color: subtle, whiteSpace: "nowrap" }}>
                          {crmFormatDate(p.updatedAt)}
                        </td>
                        <td style={{ padding: "12px", verticalAlign: "top" }}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            <button type="button" onClick={() => onOpenProposal(p)} style={actionBtn(isDark, "primary")}>
                              Open
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownload(p)}
                              disabled={!pdfReady || downloadingId === p.id}
                              title={
                                pdfReady
                                  ? "Download proposal PDF"
                                  : "Complete the Proposal step to enable PDF download"
                              }
                              style={{
                                ...actionBtn(isDark, "secondary"),
                                opacity: pdfReady ? 1 : 0.45,
                                cursor: pdfReady && downloadingId !== p.id ? "pointer" : "not-allowed",
                              }}
                            >
                              {downloadingId === p.id ? "PDF…" : "PDF"}
                            </button>
                            <button type="button" onClick={() => handleDelete(p)} style={actionBtn(isDark, "danger")}>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FilterChip({ active, label, onClick, isDark }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "6px 12px",
        borderRadius: 999,
        border: `1px solid ${active ? (isDark ? "#D3A14A" : "#2F3B4C") : isDark ? "#3A2B1D" : "#DDE2E8"}`,
        background: active ? (isDark ? "#D3A14A" : "#2F3B4C") : isDark ? "#1A1510" : "#fff",
        color: active ? (isDark ? "#1B140D" : "#fff") : isDark ? "#D8C6AE" : "#6F8096",
        fontWeight: 600,
        fontSize: 12,
        cursor: "pointer",
        fontFamily: fontSans,
      }}
    >
      {label}
    </button>
  );
}

function statusSelectStyle(isDark, tone) {
  const tones = {
    blue: { bg: isDark ? "#1A2A3D" : "#E8F0FA", color: isDark ? "#A8C8F0" : "#1E4A7A" },
    teal: { bg: isDark ? "#14332E" : "#E6F5F1", color: isDark ? "#8FD9C8" : "#1A6B5C" },
    gold: { bg: isDark ? "#3A2E14" : "#FBF4E6", color: isDark ? "#E8C878" : "#7A5A12" },
    gray: { bg: isDark ? "#252220" : "#F0F2F5", color: isDark ? "#C8BEB0" : "#4A5568" },
  };
  const t = tones[tone] || tones.blue;
  return {
    padding: "5px 8px",
    borderRadius: 6,
    border: `1px solid ${isDark ? "#3A2B1D" : "#DDE2E8"}`,
    background: t.bg,
    color: t.color,
    fontWeight: 600,
    fontSize: 11,
    fontFamily: fontSans,
    cursor: "pointer",
  };
}

function headerBtn(primary) {
  return {
    padding: "10px 14px",
    borderRadius: 8,
    border: primary ? "none" : "1px solid rgba(255,255,255,0.28)",
    background: primary ? "#F3B664" : "rgba(255,255,255,0.08)",
    color: primary ? "#1B140D" : "#F8F2E8",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: fontSans,
  };
}

function actionBtn(isDark, tone) {
  if (tone === "danger") {
    return {
      padding: "6px 10px",
      borderRadius: 8,
      border: isDark ? "1px solid #5B2921" : "1px solid #F1B8B8",
      background: isDark ? "#2D1612" : "#FFF5F5",
      color: isDark ? "#F9C8C1" : "#B42318",
      fontWeight: 600,
      fontSize: 11,
      cursor: "pointer",
      fontFamily: fontSans,
      whiteSpace: "nowrap",
    };
  }
  if (tone === "secondary") {
    return {
      padding: "6px 10px",
      borderRadius: 8,
      border: isDark ? "1px solid #3A5C4A" : "1px solid #B8D4C4",
      background: isDark ? "#1A3028" : "#E8F5EE",
      color: isDark ? "#B8E8C8" : "#1A5C3A",
      fontWeight: 600,
      fontSize: 11,
      cursor: "pointer",
      fontFamily: fontSans,
      whiteSpace: "nowrap",
    };
  }
  return {
    padding: "6px 10px",
    borderRadius: 8,
    border: "none",
    background: isDark ? "#D3A14A" : "#2F3B4C",
    color: isDark ? "#1B140D" : "#fff",
    fontWeight: 600,
    fontSize: 11,
    cursor: "pointer",
    fontFamily: fontSans,
    whiteSpace: "nowrap",
  };
}
