import { fontSans } from "../appTheme.js";

export const SIDEBAR_ICON_SIZE = 18;
export const SIDEBAR_NESTED_ICON_SIZE = 16;
export const SIDEBAR_CHEVRON_WIDTH = 14;

export function sidebarRowStyle(theme, { active, expanded, depth = 0, danger = false, compact = false, dense = false } = {}) {
  const nested = depth > 0;
  const leaf = nested || dense;
  return {
    display: "flex",
    alignItems: "center",
    gap: expanded ? (leaf ? 8 : 10) : 0,
    width: "100%",
    padding: expanded
      ? leaf
        ? `5px 10px 5px ${10 + depth * 13}px`
        : "9px 12px"
      : compact
        ? "6px 0"
        : "10px 0",
    justifyContent: expanded ? "flex-start" : "center",
    border: "none",
    borderRadius: leaf ? 6 : 8,
    background: active ? (danger ? "rgba(220,38,38,0.2)" : theme.activeBg) : "transparent",
    color: danger ? theme.sidebarDanger : active ? theme.activeText : theme.text,
    fontFamily: fontSans,
    fontSize: leaf ? 12 : 13,
    fontWeight: active ? 600 : 500,
    cursor: "pointer",
    textAlign: "left",
    lineHeight: 1.28,
    WebkitAppearance: "none",
    appearance: "none",
    transition: "background 150ms ease, color 150ms ease",
  };
}

export function sidebarIconWrap(size = SIDEBAR_ICON_SIZE) {
  return {
    display: "flex",
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    width: size,
    height: size,
    color: "currentColor",
  };
}

export function sidebarChevronStyle(open) {
  return {
    width: SIDEBAR_CHEVRON_WIDTH,
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    opacity: 0.8,
    color: "currentColor",
    transform: open ? "rotate(90deg)" : "none",
    transition: "transform 120ms ease",
  };
}

export function sidebarRowActionBtn(theme, { active = false, danger = false } = {}) {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 22,
    height: 22,
    flexShrink: 0,
    border: "none",
    borderRadius: 5,
    background: active ? "rgba(255,255,255,0.12)" : "transparent",
    color: danger ? theme.sidebarDanger : active ? theme.activeText : theme.muted,
    cursor: "pointer",
    padding: 0,
    opacity: active ? 1 : 0.72,
    transition: "opacity 120ms ease, background 120ms ease, color 120ms ease",
  };
}

export function openSidebarContextMenu(e, setMenu, items) {
  if (!items?.length) return;
  e.preventDefault();
  e.stopPropagation();
  setMenu({ x: e.clientX, y: e.clientY, items });
}

/** Right-click on labels, gaps, and padding — not on row buttons or the menu itself. */
export function shouldShowSidebarAreaMenu(e) {
  const target = e?.target;
  if (!target) return false;
  if (target.closest?.("button")) return false;
  if (target.closest?.("[data-app-sidebar-menu]")) return false;
  return true;
}
