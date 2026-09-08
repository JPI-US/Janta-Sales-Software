// src/IncomingProjects.jsx
//
// Drop-in panel that lists pending ClickUp deals with Accept / Dismiss.
// Mount it in the library view and pass onAccept={startProposalFromClickUp}.
//
//   <IncomingProjects onAccept={startProposalFromClickUp} />
//
// Accept -> creates + opens a proposal seeded from the deal. Dismiss -> hides it.

import React, { useCallback, useEffect, useState } from "react";
import { getIncomingProjects, acceptProject, dismissProject, pollClickUp, getClickUpStatus } from "./clickupApi.js";

export default function IncomingProjects({ onAccept }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [configured, setConfigured] = useState(true);
  const [confirming, setConfirming] = useState(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const { projects: rows } = await getIncomingProjects("pending");
      setProjects(rows || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const status = await getClickUpStatus();
        setConfigured(Boolean(status.configured));
      } catch {
        /* ignore */
      }
      await load();
    })();
  }, [load]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      await pollClickUp();
    } catch (err) {
      setError(err.message);
    }
    await load();
  }, [load]);

  const handleAccept = useCallback(
    async (project) => {
      setBusyId(project.id);
      setError("");
      try {
        const { proposalSeed } = await acceptProject(project.id);
        setProjects((prev) => prev.filter((p) => p.id !== project.id));
        setConfirming(null);
        if (typeof onAccept === "function") await onAccept(proposalSeed);
      } catch (err) {
        setError(err.message);
        setConfirming(null);
      } finally {
        setBusyId(null);
      }
    },
    [onAccept]
  );

  const handleDismiss = useCallback(async (project) => {
    setBusyId(project.id);
    try {
      await dismissProject(project.id);
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }, []);

  if (!configured) return null; // hide panel entirely when ClickUp isn't set up
  if (loading && projects.length === 0) {
    return <div style={S.wrap}><div style={S.head}><span style={S.title}>Incoming from ClickUp</span></div><div style={S.empty}>Loading…</div></div>;
  }

  return (
    <div style={S.wrap}>
      <div style={S.head}>
        <span style={S.title}>Incoming from ClickUp{projects.length ? ` (${projects.length})` : ""}</span>
        <button type="button" style={S.refresh} onClick={refresh} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh from ClickUp"}
        </button>
      </div>

      {error && <div style={S.error}>{error}</div>}

      {projects.length === 0 ? (
        <div style={S.empty}>No new projects. New ClickUp deals will appear here.</div>
      ) : (
        <ul style={S.list}>
          {projects.map((p) => (
            <li key={p.id} style={S.row}>
              <div style={{ minWidth: 0 }}>
                <div style={S.name}>{p.name}</div>
                <div style={S.meta}>
                  {p.clickupStatus ? `${p.clickupStatus} · ` : ""}
                  {p.clickupCreatedAt ? new Date(p.clickupCreatedAt).toLocaleDateString() : ""}
                </div>
              </div>
              <div style={S.actions}>
                <button type="button" style={S.accept} disabled={busyId === p.id} onClick={() => setConfirming(p)}>
                  {busyId === p.id ? "…" : "Add project"}
                </button>
                <button type="button" style={S.dismiss} disabled={busyId === p.id} onClick={() => handleDismiss(p)}>
                  Dismiss
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {confirming && (
        <div
          style={S.overlay}
          role="dialog"
          aria-modal="true"
          aria-label="Confirm project ownership"
          onClick={() => busyId === null && setConfirming(null)}
        >
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalTitle}>Add “{confirming.name}”?</div>
            <div style={S.modalBody}>
              By clicking Continue, you confirm that you are the owner of this project.
            </div>
            <div style={S.modalActions}>
              <button
                type="button"
                style={S.dismiss}
                disabled={busyId !== null}
                onClick={() => setConfirming(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                style={S.accept}
                disabled={busyId !== null}
                onClick={() => handleAccept(confirming)}
              >
                {busyId === confirming.id ? "Adding…" : "Continue"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const S = {
  wrap: { border: "1px solid #E2E8F0", borderRadius: 12, padding: 16, marginBottom: 20, background: "#fff" },
  head: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  title: { fontWeight: 600, fontSize: 15 },
  refresh: { fontSize: 13, padding: "6px 12px", borderRadius: 8, border: "1px solid #CBD5E1", background: "#F8FAFC", cursor: "pointer" },
  error: { color: "#B42318", fontSize: 13, marginBottom: 10 },
  empty: { color: "#64748B", fontSize: 14, padding: "8px 0" },
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 },
  row: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 12px", border: "1px solid #EEF2F6", borderRadius: 10, background: "#FBFCFE" },
  name: { fontWeight: 500, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  meta: { fontSize: 12, color: "#64748B", marginTop: 2 },
  actions: { display: "flex", gap: 8, flexShrink: 0 },
  accept: { fontSize: 13, padding: "6px 14px", borderRadius: 8, border: "none", background: "#16A34A", color: "#fff", cursor: "pointer" },
  dismiss: { fontSize: 13, padding: "6px 12px", borderRadius: 8, border: "1px solid #CBD5E1", background: "#fff", color: "#475569", cursor: "pointer" },
  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 },
  modal: { background: "#fff", borderRadius: 12, padding: 20, width: "100%", maxWidth: 420, boxShadow: "0 12px 32px rgba(15,23,42,0.25)" },
  modalTitle: { fontWeight: 600, fontSize: 16, marginBottom: 8 },
  modalBody: { fontSize: 14, color: "#475569", lineHeight: 1.5, marginBottom: 18 },
  modalActions: { display: "flex", justifyContent: "flex-end", gap: 8 },
};
