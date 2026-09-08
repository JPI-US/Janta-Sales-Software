import React, { useCallback, useEffect, useState } from "react";
import { getIncomingProjects, acceptProject, dismissProject, pollClickUp, getClickUpStatus } from "./clickupApi.js";
import { fontSans, getAppTheme } from "./appTheme.js";

function ownerLabel(owner) {
  return String(owner?.username || owner?.email || "").trim();
}

function ownersText(owners) {
  const names = (owners || []).map(ownerLabel).filter(Boolean);
  if (!names.length) return "No owner set";
  return names.length === 1 ? `Owner: ${names[0]}` : `Owners: ${names.join(", ")}`;
}

function sizeLabel(kw) {
  if (kw == null || kw === "") return null;
  const n = Number(kw);
  if (!Number.isFinite(n)) return `${kw} kW`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 1 : 2)} MW`;
  return `${n} kW`;
}

export default function IncomingProjects({ onAccept, isDark = false, currentUser = null }) {
  const t = getAppTheme(isDark);
  const isAdmin = Boolean(currentUser?.isAdmin);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [configured, setConfigured] = useState(true);
  const [dialog, setDialog] = useState(null);

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
        setDialog(null);
        if (typeof onAccept === "function") await onAccept(proposalSeed);
      } catch (err) {
        setError(err.message);
        setDialog(null);
      } finally {
        setBusyId(null);
      }
    },
    [onAccept]
  );

  const handleDismiss = useCallback(async (project) => {
    if (!project.canDismiss) {
      setDialog({ type: "blocked", project });
      return;
    }
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

  function onAddClick(project) {
    if (!project.canAccept) {
      setDialog({ type: "blocked", project });
      return;
    }
    setDialog({ type: "confirm", project });
  }

  if (!configured) return null;
  const S = styles(t);

  if (loading && projects.length === 0) {
    return (
      <div style={S.wrap}>
        <div style={S.head}>
          <span style={S.title}>Incoming from ClickUp</span>
        </div>
        <div style={S.empty}>Loading…</div>
      </div>
    );
  }

  return (
    <div style={S.wrap}>
      <div style={S.head}>
        <span style={S.title}>Incoming from ClickUp{projects.length ? ` (${projects.length})` : ""}</span>
        <button type="button" style={S.refresh} onClick={refresh} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh from ClickUp"}
        </button>
      </div>

      {error ? <div style={S.error}>{error}</div> : null}

      {projects.length === 0 ? (
        <div style={S.empty}>No new projects. New ClickUp deals will appear here.</div>
      ) : (
        <ul style={S.list}>
          {projects.map((p) => {
            const meta = [p.projectType, sizeLabel(p.systemSizeKw), p.clickupStatus, p.clickupCreatedAt ? new Date(p.clickupCreatedAt).toLocaleDateString() : ""]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={p.id} style={S.row}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={S.name}>{p.name}</div>
                  <div style={S.owners}>{ownersText(p.owners)}</div>
                  {p.tags?.length ? (
                    <div style={S.tags}>
                      {p.tags.map((tag) => (
                        <span
                          key={tag.name}
                          style={{
                            ...S.tag,
                            background: tag.bg || t.headBg,
                            color: tag.fg || t.title,
                          }}
                        >
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {meta ? <div style={S.meta}>{meta}</div> : null}
                </div>
                <div style={S.actions}>
                  <button type="button" style={S.accept} disabled={busyId === p.id} onClick={() => onAddClick(p)}>
                    {busyId === p.id ? "…" : "Add project"}
                  </button>
                  {p.canDismiss ? (
                    <button type="button" style={S.dismiss} disabled={busyId === p.id} onClick={() => handleDismiss(p)}>
                      Dismiss
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {dialog ? (
        <div
          style={S.overlay}
          role="dialog"
          aria-modal="true"
          aria-label={dialog.type === "blocked" ? "Cannot add project" : "Confirm project ownership"}
          onClick={() => busyId === null && setDialog(null)}
        >
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            {dialog.type === "blocked" ? (
              <>
                <div style={S.modalTitle}>Can’t add “{dialog.project.name}”</div>
                <div style={S.modalBody}>{dialog.project.blockReason || "Please contact an admin or update the Deal Owner in ClickUp."}</div>
                <div style={S.modalActions}>
                  <button type="button" style={S.accept} onClick={() => setDialog(null)}>
                    OK
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={S.modalTitle}>Add “{dialog.project.name}”?</div>
                <div style={S.modalBody}>
                  {isAdmin && !(dialog.project.owners || []).some(ownerLabel)
                    ? "You’re signed in as an admin. This ClickUp deal has no Deal Owner set."
                    : isAdmin
                      ? `You’re signed in as an admin. ClickUp owners: ${ownersText(dialog.project.owners)}.`
                      : "By clicking Continue, you confirm that you are the owner of this project."}
                </div>
                <div style={S.modalActions}>
                  <button type="button" style={S.dismiss} disabled={busyId !== null} onClick={() => setDialog(null)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    style={S.accept}
                    disabled={busyId !== null}
                    onClick={() => handleAccept(dialog.project)}
                  >
                    {busyId === dialog.project.id ? "Adding…" : "Continue"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function styles(t) {
  return {
    wrap: {
      border: `1px solid ${t.border}`,
      borderRadius: 12,
      padding: 16,
      marginBottom: 20,
      background: t.panel,
      fontFamily: fontSans,
    },
    head: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 12 },
    title: { fontWeight: 600, fontSize: 15, color: t.title },
    refresh: {
      fontSize: 13,
      padding: "6px 12px",
      borderRadius: 8,
      border: `1px solid ${t.border}`,
      background: t.headBg,
      color: t.title,
      cursor: "pointer",
      fontFamily: fontSans,
    },
    error: {
      color: t.errorText,
      background: t.errorBg,
      border: `1px solid ${t.errorBorder}`,
      borderRadius: 8,
      fontSize: 13,
      marginBottom: 10,
      padding: "8px 10px",
    },
    empty: { color: t.subtle, fontSize: 14, padding: "8px 0" },
    list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 },
    row: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      padding: "12px 14px",
      border: `1px solid ${t.border}`,
      borderRadius: 10,
      background: t.headBg,
    },
    name: { fontWeight: 600, fontSize: 14, color: t.title, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
    owners: { fontSize: 12, color: t.subtle, marginTop: 3 },
    tags: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 },
    tag: {
      fontSize: 11,
      fontWeight: 600,
      padding: "2px 8px",
      borderRadius: 999,
      lineHeight: 1.4,
    },
    meta: { fontSize: 12, color: t.subtle, marginTop: 6 },
    actions: { display: "flex", gap: 8, flexShrink: 0 },
    accept: {
      fontSize: 13,
      padding: "6px 14px",
      borderRadius: 8,
      border: "none",
      background: t.ctaBg,
      color: t.ctaText,
      cursor: "pointer",
      fontWeight: 600,
      fontFamily: fontSans,
    },
    dismiss: {
      fontSize: 13,
      padding: "6px 12px",
      borderRadius: 8,
      border: `1px solid ${t.border}`,
      background: t.panel,
      color: t.subtle,
      cursor: "pointer",
      fontFamily: fontSans,
    },
    overlay: {
      position: "fixed",
      inset: 0,
      background: "rgba(11,37,69,0.45)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
      padding: 16,
    },
    modal: {
      background: t.panel,
      borderRadius: 12,
      padding: 20,
      width: "100%",
      maxWidth: 420,
      boxShadow: "0 12px 32px rgba(11,37,69,0.25)",
      border: `1px solid ${t.border}`,
    },
    modalTitle: { fontWeight: 600, fontSize: 16, marginBottom: 8, color: t.title },
    modalBody: { fontSize: 14, color: t.subtle, lineHeight: 1.5, marginBottom: 18 },
    modalActions: { display: "flex", justifyContent: "flex-end", gap: 8 },
  };
}
