import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { fontSans, getAppTheme } from "../appTheme.js";

export default function SidebarContextMenu({ isDark, x, y, items, onClose }) {
  const theme = getAppTheme(isDark);

  useEffect(() => {
    const close = (e) => {
      if (e.target.closest?.("[data-app-sidebar-menu]")) return;
      if (e.button === 2) return;
      onClose?.();
    };
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    const t = setTimeout(() => {
      document.addEventListener("pointerdown", close, true);
      document.addEventListener("keydown", onKey, true);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  return createPortal(
    <div
      data-app-sidebar-menu
      role="menu"
      style={{
        position: "fixed",
        top: y,
        left: x,
        zIndex: 10000,
        minWidth: 168,
        padding: 4,
        borderRadius: 8,
        border: `1px solid ${theme.border}`,
        background: theme.panel,
        boxShadow: isDark ? "0 10px 28px rgba(0,0,0,0.45)" : "0 10px 28px rgba(0,0,0,0.14)",
        fontFamily: fontSans,
      }}
    >
      {items.map((item, i) => {
        if (item.separator) {
          return (
            <div
              key={`sep-${i}`}
              style={{ height: 1, background: theme.border, margin: "4px 6px" }}
              aria-hidden="true"
            />
          );
        }
        return (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            disabled={Boolean(item.disabled)}
            onClick={(e) => {
              e.stopPropagation();
              onClose?.();
              item.action?.();
            }}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "8px 10px",
              border: "none",
              borderRadius: 6,
              background: "transparent",
              color: item.danger ? theme.errorText : theme.title,
              fontSize: 12,
              fontWeight: 500,
              cursor: item.disabled ? "default" : "pointer",
              opacity: item.disabled ? 0.45 : 1,
              fontFamily: fontSans,
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>,
    document.body
  );
}
