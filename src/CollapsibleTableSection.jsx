import React from "react";
import { fontSans } from "./appTheme.js";

export default function CollapsibleTableSection({
  title,
  count = 0,
  collapsed = false,
  onToggle,
  isDark,
  border,
  headBg,
  titleColor,
  subtle,
  headerExtra,
  children,
  roundedBottom = true,
}) {
  return (
    <div style={{ marginBottom: 0 }}>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle?.();
          }
        }}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "12px 14px",
          borderRadius: collapsed ? 10 : "10px 10px 0 0",
          border: `1px solid ${border}`,
          borderBottom: collapsed ? `1px solid ${border}` : "none",
          background: headBg,
          cursor: "pointer",
          fontFamily: fontSans,
        }}
      >
        <span
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            color: titleColor,
            fontWeight: 700,
            fontSize: 14,
            textAlign: "left",
          }}
        >
          <span>
            {title}
            {typeof count === "number" ? ` (${count})` : ""}
          </span>
          <span style={{ color: subtle, fontSize: 12, fontWeight: 600 }}>{collapsed ? "Show" : "Hide"}</span>
        </span>
        {headerExtra ? (
          <div
            style={{ flexShrink: 0 }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {headerExtra}
          </div>
        ) : null}
      </div>
      {!collapsed ? (
        <div
          style={{
            border: `1px solid ${border}`,
            borderTop: "none",
            borderRadius: roundedBottom ? "0 0 10px 10px" : 0,
            overflow: "hidden",
            background: isDark ? "#151922" : "#ffffff",
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
