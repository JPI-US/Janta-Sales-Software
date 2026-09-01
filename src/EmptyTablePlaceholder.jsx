import React from "react";
import { fontSans } from "./appTheme.js";
import { AppIcon } from "./appIcons.jsx";

export default function EmptyTablePlaceholder({
  isDark,
  subtle,
  hint,
  actionLabel,
  onAction,
  onContextMenu,
}) {
  const canAct = typeof onAction === "function";

  function handleContextMenu(e) {
    if (!canAct) return;
    e.preventDefault();
    onContextMenu?.(e);
  }

  return (
    <div
      onContextMenu={handleContextMenu}
      style={{
        padding: "28px 14px",
        textAlign: "center",
        color: subtle,
        fontSize: 13,
        fontFamily: fontSans,
        lineHeight: 1.45,
      }}
    >
      {canAct ? (
        <button
          type="button"
          title={actionLabel || "Add"}
          aria-label={actionLabel || "Add"}
          onClick={onAction}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            marginBottom: 10,
            borderRadius: 8,
            border: `1px dashed ${isDark ? "#4a5568" : "#c5cdd8"}`,
            background: isDark ? "rgba(255,255,255,0.04)" : "#f8fafc",
            color: isDark ? "#e8eef4" : "#2f3b4c",
            cursor: "pointer",
          }}
        >
          <AppIcon name="plus" size={18} />
        </button>
      ) : null}
      <div>{hint}</div>
      {canAct && actionLabel ? (
        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>{actionLabel}</div>
      ) : null}
    </div>
  );
}
