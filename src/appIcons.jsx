import React from "react";
import { fontSans, getAppTheme } from "./appTheme.js";

const iconDefaults = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

function Icon({ children, size = 16 }) {
  return (
    <svg {...iconDefaults} width={size} height={size}>
      {children}
    </svg>
  );
}

export function IconMoon({ size = 16 }) {
  return (
    <Icon size={size}>
      <path d="M21 14.5A8.5 8.5 0 1 1 9.5 3a6.5 6.5 0 0 0 11.5 11.5z" />
    </Icon>
  );
}

export function IconSun({ size = 16 }) {
  return (
    <Icon size={size}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </Icon>
  );
}

export function IconSettings({ size = 16 }) {
  return (
    <Icon size={size}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

export function IconChart({ size = 16 }) {
  return (
    <Icon size={size}>
      <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />
    </Icon>
  );
}

export function IconMegaphone({ size = 16 }) {
  return (
    <Icon size={size}>
      <path d="M4 10v4" />
      <path d="M7 8l11-4v16l-11-4" />
      <path d="M7 12H4a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h3" />
    </Icon>
  );
}

export function IconMail({ size = 16 }) {
  return (
    <Icon size={size}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </Icon>
  );
}

export function IconSend({ size = 16 }) {
  return (
    <Icon size={size}>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4z" />
    </Icon>
  );
}

export function IconLogOut({ size = 16 }) {
  return (
    <Icon size={size}>
      <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
      <path d="M14 16l4-4-4-4" />
      <path d="M18 12H9" />
    </Icon>
  );
}

export function IconArrowLeft({ size = 16 }) {
  return (
    <Icon size={size}>
      <path d="M15 6l-6 6 6 6" />
    </Icon>
  );
}

export function IconPlus({ size = 16 }) {
  return (
    <Icon size={size}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function IconDownload({ size = 16 }) {
  return (
    <Icon size={size}>
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 21h14" />
    </Icon>
  );
}

export function IconLink({ size = 16 }) {
  return (
    <Icon size={size}>
      <path d="M10 13a4 4 0 0 1 0-5.5l1-1a4 4 0 0 1 5.5 5.5l-1 1" />
      <path d="M14 11a4 4 0 0 1 0 5.5l-1 1a4 4 0 0 1-5.5-5.5l1-1" />
    </Icon>
  );
}

export function IconClean({ size = 16 }) {
  return (
    <Icon size={size}>
      <rect x="3" y="5" width="9" height="9" rx="1.5" fill="none" />
      <rect x="12" y="10" width="9" height="9" rx="1.5" fill="none" />
    </Icon>
  );
}

export function IconSave({ size = 16 }) {
  return (
    <Icon size={size}>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M17 21v-8H7v8M7 3v5h8" />
    </Icon>
  );
}

export function IconSearch({ size = 16 }) {
  return (
    <Icon size={size}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </Icon>
  );
}

export function IconProjects({ size = 16 }) {
  return (
    <Icon size={size}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </Icon>
  );
}

/** Proposal document — distinct from the projects grid icon. */
export function IconProposals({ size = 16 }) {
  return (
    <Icon size={size}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h5M8 9h4" />
    </Icon>
  );
}

export function IconFile({ size = 16 }) {
  return (
    <Icon size={size}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </Icon>
  );
}

export function IconFolder({ size = 16 }) {
  return (
    <Icon size={size}>
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" />
    </Icon>
  );
}

/** Folder with document lines — project folders in the sidebar. */
export function IconFolderProject({ size = 16 }) {
  return (
    <Icon size={size}>
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" />
      <path d="M8 12h8M8 15h5" />
    </Icon>
  );
}

/** Folder with mail flap — email folders in the sidebar. */
export function IconFolderMail({ size = 16 }) {
  return (
    <Icon size={size}>
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" />
      <path d="M4 9l8 5 8-5" />
    </Icon>
  );
}

export function IconSidebarCollapse({ size = 16 }) {
  return (
    <Icon size={size}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
      <path d="M6.5 12H7.5" />
    </Icon>
  );
}

export function IconSidebarExpand({ size = 16 }) {
  return (
    <Icon size={size}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
      <path d="M11.5 12h3" />
    </Icon>
  );
}

export function IconPin({ size = 16 }) {
  return (
    <Icon size={size}>
      <path d="M12 17v5" />
      <path d="M8 3h8l-1 7h-6L8 3z" />
      <path d="M7 10h10l1 4H6l1-4z" />
    </Icon>
  );
}

export function IconTrash({ size = 16 }) {
  return (
    <Icon size={size}>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
    </Icon>
  );
}

const TABLE_ACTION_SIZE = 26;

export function tableActionBtnStyle(isDark, tone = "primary") {
  const t = getAppTheme(isDark);
  const base = {
    height: TABLE_ACTION_SIZE,
    minWidth: TABLE_ACTION_SIZE,
    padding: tone === "primary" ? "0 8px" : 0,
    width: tone === "primary" ? "auto" : TABLE_ACTION_SIZE,
    borderRadius: 6,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flexShrink: 0,
    fontFamily: fontSans,
    fontSize: 11,
    fontWeight: 600,
    lineHeight: 1,
    boxSizing: "border-box",
    WebkitAppearance: "none",
    appearance: "none",
  };
  if (tone === "danger") {
    return {
      ...base,
      border: `1px solid ${t.errorBorder}`,
      background: t.errorBg,
      color: t.errorText,
    };
  }
  if (tone === "surface") {
    return {
      ...base,
      border: `1px solid ${t.border}`,
      background: t.headBg || t.inputBg,
      color: t.title,
    };
  }
  if (tone === "secondary") {
    return {
      ...base,
      border: isDark ? "1px solid #374151" : "1px solid #B8D4C4",
      background: isDark ? "#1F2937" : "#E8F5EE",
      color: isDark ? "#A7F3D0" : "#1A5C3A",
    };
  }
  return {
    ...base,
    border: "none",
    background: t.accent,
    color: t.accentText,
  };
}

export function TableIconButton({ isDark, icon, title, onClick, disabled, tone = "surface", style }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={title}
      title={title}
      style={{
        ...tableActionBtnStyle(isDark, tone === "primary" ? "surface" : tone),
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        ...style,
      }}
    >
      <AppIcon name={icon} size={14} />
    </button>
  );
}

export function IconCalendar({ size = 16 }) {
  return (
    <Icon size={size}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </Icon>
  );
}

export function IconGlobe({ size = 16 }) {
  return (
    <Icon size={size}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18" />
      <path d="M12 3a14 14 0 0 0 0 18" />
    </Icon>
  );
}

const ICON_MAP = {
  moon: IconMoon,
  sun: IconSun,
  settings: IconSettings,
  chart: IconChart,
  megaphone: IconMegaphone,
  mail: IconMail,
  send: IconSend,
  signOut: IconLogOut,
  back: IconArrowLeft,
  plus: IconPlus,
  download: IconDownload,
  link: IconLink,
  clean: IconClean,
  save: IconSave,
  search: IconSearch,
  projects: IconProjects,
  proposals: IconProposals,
  file: IconFile,
  folder: IconFolder,
  folderProject: IconFolderProject,
  folderMail: IconFolderMail,
  pin: IconPin,
  trash: IconTrash,
  sidebarCollapse: IconSidebarCollapse,
  sidebarExpand: IconSidebarExpand,
  calendar: IconCalendar,
  globe: IconGlobe,
};

export function AppIcon({ name, size = 16 }) {
  const C = ICON_MAP[name];
  return C ? <C size={size} /> : null;
}

export function confirmSignOut({ withSaveHint = false } = {}) {
  const message = withSaveHint
    ? "Sign out? Your proposal will be saved before you leave."
    : "Sign out of Janta Sales?";
  return window.confirm(message);
}

export function RibbonSpacer() {
  return <div style={{ flex: 1, minWidth: 12 }} aria-hidden="true" />;
}

export const SIGN_OUT_RED = {
  border: "1px solid rgba(220, 90, 90, 0.55)",
  background: "linear-gradient(180deg, #B42318 0%, #8B1A1A 100%)",
  color: "#FFF5F5",
};

export const SAVE_GREEN = {
  border: "1px solid rgba(80, 180, 120, 0.55)",
  background: "linear-gradient(180deg, #2A9D5C 0%, #1E7A45 100%)",
  color: "#ECFDF5",
};

function baseRibbonBtn({ minWidth, padding, gap = 0 }) {
  return {
    minWidth,
    height: 34,
    padding,
    borderRadius: 8,
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: fontSans,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
    gap,
    whiteSpace: "nowrap",
    flexShrink: 0,
  };
}

export function ribbonBtnStyle(theme, variant = "default", { iconOnly = false } = {}) {
  const base = iconOnly
    ? baseRibbonBtn({ minWidth: 34, padding: 0 })
    : baseRibbonBtn({ minWidth: undefined, padding: "0 12px", gap: 7 });

  if (variant === "danger") {
    return { ...base, ...SIGN_OUT_RED };
  }
  if (variant === "primary") {
    return {
      ...base,
      border: "none",
      background: theme.ribbonPrimaryBg,
      color: theme.ribbonPrimaryText,
    };
  }
  if (variant === "success") {
    return { ...base, ...SAVE_GREEN };
  }
  if (variant === "surface") {
    return {
      ...base,
      border: `1px solid ${theme.border}`,
      background: theme.headBg || theme.inputBg,
      color: theme.title,
    };
  }
  return {
    ...base,
    border: `1px solid ${theme.ribbonBtnBorder}`,
    background: theme.ribbonBtnBg,
    color: theme.ribbonText,
  };
}

export function RibbonIconButton({
  theme,
  icon,
  title,
  ariaLabel,
  onClick,
  disabled,
  variant = "default",
  style,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel || title}
      title={title}
      style={{
        ...ribbonBtnStyle(theme, variant, { iconOnly: true }),
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        ...style,
      }}
    >
      <AppIcon name={icon} />
    </button>
  );
}

export function RibbonLabeledButton({
  theme,
  icon,
  children,
  title,
  ariaLabel,
  onClick,
  disabled,
  variant = "primary",
  style,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel || title || (typeof children === "string" ? children : undefined)}
      title={title}
      style={{
        ...ribbonBtnStyle(theme, variant),
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        ...style,
      }}
    >
      {icon ? <AppIcon name={icon} /> : null}
      <span>{children}</span>
    </button>
  );
}

export function RibbonToolbar({ children, style }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        alignItems: "center",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function RibbonGroup({ children }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      {children}
    </div>
  );
}

export function RibbonDivider({ theme }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: 1,
        height: 22,
        background: theme.ribbonBtnBorder,
        opacity: 0.85,
        flexShrink: 0,
      }}
    />
  );
}

export function PageHeader({ theme, title, subtitle, onBack, backTitle, children, isDark }) {
  const t = theme || getAppTheme(isDark);
  return (
    <header
      style={{
        padding: "16px 24px",
        borderBottom: `1px solid ${t.border}`,
        background: t.panel,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: "1 1 auto" }}>
        {onBack ? (
          <RibbonIconButton
            theme={t}
            variant="surface"
            icon="back"
            title={backTitle || "Back"}
            ariaLabel={backTitle || "Back"}
            onClick={onBack}
          />
        ) : null}
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: t.title, letterSpacing: "-0.01em" }}>{title}</h1>
          {subtitle ? (
            <p style={{ margin: "4px 0 0", fontSize: 13, color: t.subtle, lineHeight: 1.4 }}>{subtitle}</p>
          ) : null}
        </div>
      </div>
      {children ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginLeft: "auto" }}>{children}</div>
      ) : null}
    </header>
  );
}

export function PageGuide({ theme, title, children, isDark }) {
  const t = theme || getAppTheme(isDark);
  return (
    <div
      style={{
        background: t.panel,
        border: `1px solid ${t.border}`,
        borderRadius: 10,
        padding: "14px 16px",
        marginBottom: 16,
      }}
    >
      {title ? (
        <div style={{ fontSize: 15, fontWeight: 700, color: t.title, marginBottom: 6 }}>{title}</div>
      ) : null}
      <div style={{ fontSize: 14, color: t.subtle, lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

export function SearchField({ value, onChange, placeholder, theme, isDark, compact = false }) {
  const t = theme || getAppTheme(isDark);
  const iconSize = compact ? 13 : 15;
  return (
    <div
      style={{
        position: "relative",
        minWidth: compact ? 180 : 240,
        flex: compact ? "0 1 240px" : "1 1 220px",
        maxWidth: compact ? 280 : 360,
      }}
    >
      <span
        style={{
          position: "absolute",
          left: compact ? 9 : 11,
          top: "50%",
          transform: "translateY(-50%)",
          color: t.subtle,
          pointerEvents: "none",
          display: "flex",
        }}
      >
        <IconSearch size={iconSize} />
      </span>
      <input
        type="search"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: compact ? "5px 10px 5px 28px" : "9px 12px 9px 34px",
          borderRadius: compact ? 6 : 8,
          border: `1px solid ${t.border}`,
          background: t.inputBg,
          color: t.title,
          fontSize: compact ? 12 : 13,
          fontFamily: fontSans,
          outline: "none",
          lineHeight: compact ? 1.2 : undefined,
        }}
      />
    </div>
  );
}
