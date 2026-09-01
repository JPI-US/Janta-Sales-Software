import React, { useMemo, useState } from "react";
import { fontSans, getAppTheme } from "./appTheme.js";
import { PRESET_GROUPS, getPreset, renderPresetWireframe } from "./email-studio/lib/presets.js";
import { createFolder, getFolder, getState, listAllFoldersFlat } from "./email-studio/lib/store.js";
import "./email-studio/styles.css";
import "./email-studio/embed.css";

function dialogOverlayStyle() {
  return {
    position: "fixed",
    inset: 0,
    zIndex: 3000,
    display: "grid",
    placeItems: "center",
    padding: 20,
    background: "rgba(0, 0, 0, 0.45)",
  };
}

function dialogPanelStyle(t, maxWidth) {
  return {
    width: "100%",
    maxWidth,
    background: t.panel,
    border: `1px solid ${t.border}`,
    borderRadius: 12,
    padding: 20,
    fontFamily: fontSans,
    boxShadow: "0 18px 40px rgba(0,0,0,0.25)",
  };
}

function fieldInputStyle(t) {
  return {
    width: "100%",
    boxSizing: "border-box",
    border: `1px solid ${t.border}`,
    borderRadius: 8,
    padding: "10px 12px",
    outline: "none",
    background: t.inputBg,
    color: t.title,
    fontFamily: fontSans,
    fontSize: 14,
  };
}

function ghostBtnStyle(t, disabled) {
  return {
    border: `1px solid ${t.border}`,
    borderRadius: 8,
    padding: "9px 14px",
    background: t.inputBg,
    color: t.title,
    cursor: disabled ? "default" : "pointer",
    fontFamily: fontSans,
    fontSize: 13,
    fontWeight: 600,
  };
}

function primaryBtnStyle(isDark, t, disabled) {
  return {
    border: "none",
    borderRadius: 8,
    padding: "9px 14px",
    background: isDark ? t.accent : "#2F3B4C",
    color: isDark ? t.accentText : "#fff",
    cursor: disabled ? "default" : "pointer",
    fontFamily: fontSans,
    fontSize: 13,
    fontWeight: 600,
    opacity: disabled ? 0.6 : 1,
  };
}

function ensureUnfiledFolder() {
  const existing = getState().folders.find((f) => !f.parentId && f.name.toLowerCase() === "unfiled");
  if (existing) return existing;
  return createFolder({ name: "Unfiled", parentId: null });
}

function resolveFolderId(folderId) {
  if (folderId && getFolder(folderId)) return folderId;
  return ensureUnfiledFolder().id;
}

function NewEmailDetailsStep({ isDark, busy, initial, onCancel, onNext }) {
  const [title, setTitle] = useState(initial.title || "");
  const [folderId, setFolderId] = useState(initial.folderId || ensureUnfiledFolder().id);
  const t = getAppTheme(isDark);
  const folders = useMemo(() => listAllFoldersFlat(), []);

  function submit() {
    const trimmed = title.trim();
    if (!trimmed || busy) return;
    onNext({ title: trimmed, folderId: resolveFolderId(folderId) });
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="new-email-step1-title" style={dialogOverlayStyle()} onClick={() => !busy && onCancel()}>
      <div style={dialogPanelStyle(t, 440)} onClick={(e) => e.stopPropagation()}>
        <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: t.subtle }}>
          Step 1 of 2
        </p>
        <h2 id="new-email-step1-title" style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700, color: t.title }}>
          New email
        </h2>
        <p style={{ margin: "0 0 14px", fontSize: 13, color: t.subtle, lineHeight: 1.45 }}>
          Name your email and choose where to save it.
        </p>
        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: t.subtle, marginBottom: 6 }}>Title</span>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. DC cold intro — Q3"
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape" && !busy) onCancel();
            }}
            style={fieldInputStyle(t)}
          />
        </label>
        <label style={{ display: "block", marginBottom: 14 }}>
          <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: t.subtle, marginBottom: 6 }}>Folder</span>
          <select value={folderId} onChange={(e) => setFolderId(e.target.value)} disabled={busy} style={fieldInputStyle(t)}>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label || f.name}
              </option>
            ))}
          </select>
        </label>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onCancel} disabled={busy} style={ghostBtnStyle(t, busy)}>
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={busy || !title.trim()} style={primaryBtnStyle(isDark, t, busy || !title.trim())}>
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function NewEmailPresetStep({ isDark, busy, draft, onBack, onCancel, onCreate }) {
  const [presetId, setPresetId] = useState("blank");
  const t = getAppTheme(isDark);
  const preset = getPreset(presetId);
  const wireHtml = useMemo(() => renderPresetWireframe(presetId), [presetId]);

  function submit() {
    if (busy) return;
    onCreate({ ...draft, preset: presetId });
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="new-email-step2-title" style={dialogOverlayStyle()} onClick={() => !busy && onCancel()}>
      <div style={{ ...dialogPanelStyle(t, 920), maxHeight: "min(92vh, 760px)", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
        <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: t.subtle }}>
          Step 2 of 2
        </p>
        <h2 id="new-email-step2-title" style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: t.title }}>
          Choose a layout
        </h2>
        <p style={{ margin: "0 0 14px", fontSize: 13, color: t.subtle, lineHeight: 1.45 }}>
          Preview a starter preset for <strong style={{ color: t.title }}>{draft.title}</strong>, or start blank.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 280px) minmax(0, 1fr)", gap: 16, flex: 1, minHeight: 0 }}>
          <div
            style={{
              overflowY: "auto",
              border: `1px solid ${t.border}`,
              borderRadius: 10,
              background: t.inputBg,
              padding: 8,
              maxHeight: "min(58vh, 520px)",
            }}
          >
            <button
              type="button"
              onClick={() => setPresetId("blank")}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                border: presetId === "blank" ? `2px solid ${isDark ? t.accent : "#2F3B4C"}` : `1px solid ${t.border}`,
                borderRadius: 8,
                padding: "10px 12px",
                marginBottom: 10,
                background: presetId === "blank" ? (isDark ? "rgba(58,132,220,0.12)" : "#eef1f5") : t.panel,
                color: t.title,
                cursor: "pointer",
                fontFamily: fontSans,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13 }}>Blank</div>
              <div style={{ fontSize: 11, color: t.subtle, marginTop: 2 }}>Empty canvas — add blocks yourself</div>
            </button>
            {PRESET_GROUPS.map((group) => (
              <div key={group.id} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: t.subtle, padding: "4px 6px 6px" }}>
                  {group.label}
                </div>
                {group.presets
                  .filter((p) => p.id !== "blank")
                  .map((p) => {
                    const active = presetId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPresetId(p.id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                          width: "100%",
                          textAlign: "left",
                          border: active ? `2px solid ${isDark ? t.accent : "#2F3B4C"}` : `1px solid transparent`,
                          borderRadius: 8,
                          padding: "8px 10px",
                          marginBottom: 2,
                          background: active ? (isDark ? "rgba(58,132,220,0.12)" : "#eef1f5") : "transparent",
                          color: t.title,
                          cursor: "pointer",
                          fontFamily: fontSans,
                        }}
                      >
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{p.label}</span>
                        <span style={{ fontSize: 10, color: t.subtle, whiteSpace: "nowrap" }}>{p.size}</span>
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>

          <div
            className={`email-studio-root ${isDark ? "is-dark" : "is-light"}`}
            style={{
              minHeight: 320,
              maxHeight: "min(58vh, 520px)",
              overflow: "hidden",
              border: `1px solid ${t.border}`,
              borderRadius: 10,
              background: isDark ? "#0f1419" : "#e8ebf0",
            }}
          >
            <div className="home-wire-mount" style={{ padding: "16px 12px", height: "100%" }} dangerouslySetInnerHTML={{ __html: wireHtml }} />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: t.subtle }}>
            {preset?.blurb || "Start from scratch."}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={onBack} disabled={busy} style={ghostBtnStyle(t, busy)}>
              Back
            </button>
            <button type="button" onClick={onCancel} disabled={busy} style={ghostBtnStyle(t, busy)}>
              Cancel
            </button>
            <button type="button" onClick={submit} disabled={busy} style={primaryBtnStyle(isDark, t, busy)}>
              {busy ? "Creating…" : "Create email"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NewEmailWizard({ isDark, busy, onCancel, onCreate, initialFolderId = null }) {
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState(() => ({
    title: "",
    folderId: initialFolderId || ensureUnfiledFolder().id,
  }));

  React.useEffect(() => {
    setStep(1);
    setDraft({
      title: "",
      folderId: initialFolderId || ensureUnfiledFolder().id,
    });
  }, [initialFolderId]);

  if (step === 1) {
    return (
      <NewEmailDetailsStep
        isDark={isDark}
        busy={busy}
        initial={draft}
        onCancel={onCancel}
        onNext={(next) => {
          setDraft(next);
          setStep(2);
        }}
      />
    );
  }

  return (
    <NewEmailPresetStep
      isDark={isDark}
      busy={busy}
      draft={draft}
      onBack={() => setStep(1)}
      onCancel={onCancel}
      onCreate={onCreate}
    />
  );
}
