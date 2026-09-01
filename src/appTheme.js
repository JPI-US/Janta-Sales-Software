export const fontSans = "'Inter', system-ui, -apple-system, sans-serif";

export function getAppTheme(isDark) {
  if (!isDark) {
    return {
      bg: "#F3F4F6",
      panel: "#FFFFFF",
      border: "#DDE2E8",
      title: "#2F3B4C",
      subtle: "#6F8096",
      headBg: "#F9FAFB",
      surface: "#FFFFFF",
      inputBg: "#FFFFFF",
      accent: "#2F3B4C",
      accentText: "#FFFFFF",
      ribbonBg: "#2F3B4C",
      ribbonText: "#F8F2E8",
      ribbonSubtle: "rgba(255,255,255,0.55)",
      ribbonBtnBorder: "rgba(255,255,255,0.28)",
      ribbonBtnBg: "rgba(255,255,255,0.08)",
      ribbonPrimaryBg: "#F3B664",
      ribbonPrimaryText: "#1B140D",
      disabled: "#B0B8C4",
      disabledBg: "#F3F4F6",
      errorBg: "#FFF5F5",
      errorBorder: "#F1B8B8",
      errorText: "#B42318",
      sidebar: {
        bg: "#1A2332",
        border: "rgba(255,255,255,0.1)",
        text: "#F3F4F6",
        muted: "#CBD5E1",
        hoverBg: "rgba(255,255,255,0.08)",
        activeBg: "rgba(255,255,255,0.14)",
        activeText: "#FFFFFF",
        sidebarDanger: "#FCA5A5",
      },
    };
  }

  return {
    bg: "#000000",
    panel: "#141414",
    border: "#333333",
    title: "#F3F4F6",
    subtle: "#9CA3AF",
    headBg: "#111111",
    surface: "#141414",
    inputBg: "#111111",
    accent: "#E5E7EB",
    accentText: "#111111",
    ribbonBg: "#111111",
    ribbonText: "#F3F4F6",
    ribbonSubtle: "rgba(255,255,255,0.55)",
    ribbonBtnBorder: "rgba(255,255,255,0.22)",
    ribbonBtnBg: "rgba(255,255,255,0.06)",
    ribbonPrimaryBg: "#E5E7EB",
    ribbonPrimaryText: "#111111",
    disabled: "#6B7280",
    disabledBg: "#0A0A0A",
    errorBg: "#1F1212",
    errorBorder: "#5C3030",
    errorText: "#F87171",
    sidebar: {
      bg: "#111111",
      border: "#333333",
      text: "#F9FAFB",
      muted: "#D1D5DB",
      hoverBg: "rgba(255,255,255,0.06)",
      activeBg: "rgba(255,255,255,0.12)",
      activeText: "#FFFFFF",
      sidebarDanger: "#FCA5A5",
    },
  };
}

export function ribbonStyle(theme) {
  return {
    background: theme.ribbonBg,
    padding: "16px 24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
    borderBottom: `1px solid ${theme.border}`,
    boxShadow: `0 0 0 100vmax ${theme.ribbonBg}`,
    clipPath: "inset(0 -100vmax)",
  };
}

export function ribbonBrandStyle(theme) {
  return {
    margin: 0,
    fontSize: 20,
    fontWeight: 700,
    color: theme.ribbonText,
    letterSpacing: "-0.01em",
  };
}

export function ribbonSubtitleStyle(theme) {
  return {
    margin: "4px 0 0",
    fontSize: 13,
    color: theme.ribbonSubtle,
    lineHeight: 1.4,
  };
}

export const PAGE_BASE_WIDTH = 960;
export const PAGE_MAX_WIDTH = PAGE_BASE_WIDTH;

export function getPageScale(viewportWidth) {
  return Math.min(1.35, Math.max(1, (viewportWidth - 24) / PAGE_BASE_WIDTH));
}

export function pageShellStyle() {
  return {
    width: "100%",
    padding: "20px 24px 48px",
    boxSizing: "border-box",
  };
}

export function sectionCardStyle(theme) {
  return {
    background: theme.panel,
    border: `1px solid ${theme.border}`,
    borderRadius: 10,
    padding: "14px 16px",
  };
}
