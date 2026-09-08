export const fontSans = "'Inter', system-ui, -apple-system, sans-serif";

/** Solar app chrome — navy + amber. */
export const PALETTE = {
  navy: "#0B2545",
  navySoft: "#13315C",
  amber: "#F3B664",
  page: "#F4F6FA",
  card: "#FFFFFF",
  border: "#E3E8F0",
  text: "#1A2233",
  muted: "#6B7A90",
  positive: "#07794C",
  negative: "#B42318",
  success: "#16A34A",
  danger: "#EF4444",
  sent: "#3B82F6",
  time: "#8B5CF6",
};

export const STAT_ACCENTS = {
  pipeline: PALETTE.amber,
  sent: PALETTE.sent,
  winRate: PALETTE.success,
  timeToClose: PALETTE.time,
};

export function getAppTheme(isDark) {
  if (!isDark) {
    return {
      bg: PALETTE.page,
      panel: PALETTE.card,
      border: PALETTE.border,
      title: PALETTE.text,
      subtle: PALETTE.muted,
      headBg: PALETTE.page,
      surface: PALETTE.card,
      inputBg: PALETTE.card,
      navy: PALETTE.navy,
      navySoft: PALETTE.navySoft,
      amber: PALETTE.amber,
      accent: PALETTE.navy,
      accentText: "#FFFFFF",
      ctaBg: PALETTE.amber,
      ctaText: PALETTE.navy,
      ribbonBg: PALETTE.navy,
      ribbonText: "#F4F6FA",
      ribbonSubtle: "rgba(255,255,255,0.62)",
      ribbonBtnBorder: "rgba(255,255,255,0.22)",
      ribbonBtnBg: "rgba(255,255,255,0.08)",
      ribbonPrimaryBg: PALETTE.amber,
      ribbonPrimaryText: PALETTE.navy,
      disabled: "#B0B8C4",
      disabledBg: PALETTE.page,
      errorBg: "#FDE9E9",
      errorBorder: PALETTE.danger,
      errorText: PALETTE.negative,
      successBg: "#E4F7EC",
      successBorder: PALETTE.success,
      successText: PALETTE.positive,
      toastBg: PALETTE.navy,
      toastText: "#FFFFFF",
      positive: PALETTE.positive,
      negative: PALETTE.negative,
      stat: STAT_ACCENTS,
      sidebar: {
        bg: PALETTE.navy,
        border: "rgba(255,255,255,0.08)",
        text: "#F4F6FA",
        muted: "rgba(255,255,255,0.62)",
        hoverBg: "rgba(255,255,255,0.06)",
        activeBg: PALETTE.navySoft,
        activeText: "#FFFFFF",
        sidebarDanger: "#FCA5A5",
      },
    };
  }

  return {
    bg: "#071525",
    panel: "#0E1C30",
    border: "#1E3350",
    title: "#F4F6FA",
    subtle: "#9FB0C4",
    headBg: "#0B1A2E",
    surface: "#0E1C30",
    inputBg: "#0B1A2E",
    navy: PALETTE.navy,
    navySoft: PALETTE.navySoft,
    amber: PALETTE.amber,
    accent: PALETTE.navySoft,
    accentText: "#FFFFFF",
    ctaBg: PALETTE.amber,
    ctaText: PALETTE.navy,
    ribbonBg: "#0E1C30",
    ribbonText: "#F4F6FA",
    ribbonSubtle: "#9FB0C4",
    ribbonBtnBorder: "#1E3350",
    ribbonBtnBg: "rgba(255,255,255,0.04)",
    ribbonPrimaryBg: PALETTE.amber,
    ribbonPrimaryText: PALETTE.navy,
    disabled: "#6B7A90",
    disabledBg: "#071525",
    errorBg: "rgba(239,68,68,0.12)",
    errorBorder: PALETTE.danger,
    errorText: "#FCA5A5",
    successBg: "rgba(22,163,74,0.14)",
    successBorder: PALETTE.success,
    successText: "#86EFAC",
    toastBg: PALETTE.navy,
    toastText: "#FFFFFF",
    positive: "#86EFAC",
    negative: "#FCA5A5",
    stat: STAT_ACCENTS,
    sidebar: {
      bg: PALETTE.navy,
      border: "rgba(255,255,255,0.08)",
      text: "#F4F6FA",
      muted: "rgba(255,255,255,0.62)",
      hoverBg: "rgba(255,255,255,0.06)",
      activeBg: PALETTE.navySoft,
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
