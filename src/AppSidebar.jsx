import React, { useEffect, useState } from "react";
import { fontSans, getAppTheme } from "./appTheme.js";
import { AppIcon, SIGN_OUT_RED } from "./appIcons.jsx";
import SidebarFolderTree from "./sidebar/SidebarFolderTree.jsx";
import SidebarContextMenu from "./sidebar/SidebarContextMenu.jsx";
import {
  openSidebarContextMenu,
  shouldShowSidebarAreaMenu,
  sidebarIconWrap,
  sidebarRowStyle,
  SIDEBAR_ICON_SIZE,
} from "./sidebar/sidebarRowStyles.js";
import {
  buildEmailNavMenuItems,
  buildProjectsNavMenuItems,
  buildRecentsAreaMenuItems,
} from "./sidebar/sidebarRecentsMenus.js";

export const SIDEBAR_ICON_LOGO_SRC = "/assets/janta-logo-mix1.png";
export const SIDEBAR_BANNER_LOGO_SRC = "/assets/janta-logo-cropped.svg";
export const SIDEBAR_WIDTH_COLLAPSED = 64;
export const SIDEBAR_WIDTH_EXPANDED = 248;
export const SIDEBAR_COLLAPSED_LOGO_SIZE = 40;

function SidebarNavButton({ theme, expanded, active, icon, label, title, onClick, onContextMenu, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={onContextMenu}
      aria-current={active ? "page" : undefined}
      title={!expanded ? title || label : undefined}
      style={sidebarRowStyle(theme, { active, expanded, danger })}
    >
      <span style={sidebarIconWrap(SIDEBAR_ICON_SIZE)}>
        <AppIcon name={icon} size={SIDEBAR_ICON_SIZE} />
      </span>
      {expanded ? (
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "currentColor" }}>
          {label}
        </span>
      ) : null}
    </button>
  );
}

function sidebarSectionLabel(sidebar) {
  return {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: sidebar.muted,
    padding: "4px 12px 8px",
  };
}

function SidebarNavSection({ sidebar, expanded, label, showDivider = false, children }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        marginBottom: expanded ? 10 : 6,
      }}
    >
      {expanded ? (
        <div style={{ ...sidebarSectionLabel(sidebar), paddingTop: showDivider ? 10 : 4 }}>{label}</div>
      ) : showDivider ? (
        <div
          aria-hidden="true"
          style={{
            height: 1,
            background: sidebar.border,
            margin: "2px 10px 6px",
            opacity: 0.55,
          }}
        />
      ) : null}
      {children}
    </div>
  );
}

function sidebarLogoFilter(logoHover) {
  return logoHover ? "grayscale(1) brightness(1.08) contrast(1.05)" : "none";
}

const SIDEBAR_LOGO_TRANSITION_MS = 180;

function SidebarLogoMark({ expanded, logoFilter }) {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if (!expanded) {
      setShowBanner(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setShowBanner(true), SIDEBAR_LOGO_TRANSITION_MS - 40);
    return () => window.clearTimeout(timer);
  }, [expanded]);

  const logoMotion = `${SIDEBAR_LOGO_TRANSITION_MS}ms ease`;

  return (
    <span
      aria-hidden="true"
      style={{
        position: "relative",
        display: "block",
        width: expanded ? "100%" : SIDEBAR_COLLAPSED_LOGO_SIZE,
        height: expanded ? 38 : SIDEBAR_COLLAPSED_LOGO_SIZE,
        transition: `width ${logoMotion}, height ${logoMotion}`,
      }}
    >
      <img
        src={SIDEBAR_ICON_LOGO_SRC}
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          inset: 0,
          margin: "auto",
          width: SIDEBAR_COLLAPSED_LOGO_SIZE,
          height: SIDEBAR_COLLAPSED_LOGO_SIZE,
          display: "block",
          objectFit: "contain",
          filter: logoFilter,
          opacity: showBanner ? 0 : 1,
          transform: showBanner ? "scale(0.92)" : "scale(1)",
          transition: `opacity ${logoMotion}, transform ${logoMotion}, filter ${logoMotion}`,
          pointerEvents: "none",
        }}
      />
      <img
        src={SIDEBAR_BANNER_LOGO_SRC}
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "50%",
          height: 38,
          width: "100%",
          maxWidth: "100%",
          display: "block",
          objectFit: "contain",
          objectPosition: "center",
          filter: logoFilter,
          opacity: showBanner ? 1 : 0,
          transform: showBanner ? "translateY(-50%) scale(1)" : "translateY(-50%) scale(0.96)",
          transition: `opacity ${logoMotion}, transform ${logoMotion}, filter ${logoMotion}`,
          pointerEvents: "none",
        }}
      />
    </span>
  );
}

export default function AppSidebar({
  isDark,
  currentView,
  activeProposalId,
  activeEmailTemplateId,
  userId,
  isAdmin,
  canSalesReport,
  canMarketingReport,
  refreshKey = 0,
  onNavigateProjects,
  onNavigateReports,
  onNavigateMedia,
  onNavigateCampaigns,
  onNavigateCalendar,
  onNavigateEmail,
  onNavigateSocial,
  onNewProject,
  onNewEmail,
  onNewProjectInFolder,
  onNewEmailInFolder,
  onSidebarRefresh,
  onOpenProposal,
  onOpenEmailTemplate,
  onEmailTemplateDeleted,
  onProposalDeleted,
  onPinsChanged,
  onOpenSettings,
  onSignOut,
  onDarkModeToggle,
}) {
  const theme = getAppTheme(isDark);
  const sidebar = theme.sidebar;
  const [hovered, setHovered] = useState(false);
  const [logoHover, setLogoHover] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const expanded = hovered;
  const logoFilter = sidebarLogoFilter(logoHover);

  function showMenu(e, items) {
    openSidebarContextMenu(e, setContextMenu, items);
  }

  function openSidebarAreaMenu(e) {
    if (!shouldShowSidebarAreaMenu(e)) return;
    showMenu(
      e,
      buildRecentsAreaMenuItems({
        userId,
        onNewProject,
        onNewEmail,
        onRefresh: () => onSidebarRefresh?.(),
      }),
    );
  }

  function handleSignOutClick() {
    if (typeof onSignOut === "function") onSignOut();
  }

  function handleLogoClick(e) {
    e.stopPropagation();
    if (typeof onDarkModeToggle === "function") onDarkModeToggle(e);
  }

  const width = expanded ? SIDEBAR_WIDTH_EXPANDED : SIDEBAR_WIDTH_COLLAPSED;

  return (
    <aside
      aria-label="Application navigation"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setLogoHover(false);
      }}
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        width,
        height: "100vh",
        zIndex: 300,
        flexShrink: 0,
        background: sidebar.bg,
        borderRight: `1px solid ${sidebar.border}`,
        display: "flex",
        flexDirection: "column",
        transition: `width ${SIDEBAR_LOGO_TRANSITION_MS}ms ease, box-shadow ${SIDEBAR_LOGO_TRANSITION_MS}ms ease`,
        fontFamily: fontSans,
        color: sidebar.text,
        overflow: "hidden",
        boxShadow: expanded ? "4px 0 24px rgba(0,0,0,0.22)" : "none",
      }}
    >
      <div
        style={{
          padding: expanded ? "14px 12px 12px" : "12px 8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderBottom: `1px solid ${sidebar.border}`,
          minHeight: expanded ? 64 : 72,
          boxSizing: "border-box",
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={handleLogoClick}
          onMouseEnter={() => setLogoHover(true)}
          onMouseLeave={() => setLogoHover(false)}
          onContextMenu={(e) =>
            showMenu(e, [
              {
                label: isDark ? "Switch to light mode" : "Switch to dark mode",
                action: () => onDarkModeToggle?.({ clientX: 48, clientY: 48 }),
              },
            ])
          }
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          style={{
            border: "none",
            background: "transparent",
            padding: 2,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 12,
            width: expanded ? "100%" : "auto",
            WebkitAppearance: "none",
            appearance: "none",
          }}
        >
          <SidebarLogoMark expanded={expanded} logoFilter={logoFilter} />
        </button>
      </div>

      <nav
        aria-label="Primary"
        style={{
          padding: expanded ? "12px 10px 4px" : "12px 8px 4px",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
        }}
      >
        <SidebarNavSection sidebar={sidebar} expanded={expanded} label="Calendar">
          <SidebarNavButton
            theme={sidebar}
            expanded={expanded}
            active={currentView === "calendar"}
            icon="calendar"
            label="Calendar"
            onClick={onNavigateCalendar}
            onContextMenu={(e) => showMenu(e, [{ label: "Open calendar", action: onNavigateCalendar }])}
          />
        </SidebarNavSection>

        <SidebarNavSection sidebar={sidebar} expanded={expanded} label="Sales" showDivider>
          <SidebarNavButton
            theme={sidebar}
            expanded={expanded}
            active={currentView === "library"}
            icon="projects"
            label="Projects"
            onClick={onNavigateProjects}
            onContextMenu={(e) =>
              showMenu(
                e,
                buildProjectsNavMenuItems({
                  onNavigateProjects,
                  onNewProject,
                  userId,
                  onRefresh: onSidebarRefresh,
                }),
              )
            }
          />
          {canSalesReport ?? isAdmin ? (
            <SidebarNavButton
              theme={sidebar}
              expanded={expanded}
              active={currentView === "reports"}
              icon="chart"
              label="Sales Report"
              onClick={onNavigateReports}
              onContextMenu={(e) => showMenu(e, [{ label: "Open sales report", action: onNavigateReports }])}
            />
          ) : null}
        </SidebarNavSection>

        <SidebarNavSection sidebar={sidebar} expanded={expanded} label="Marketing" showDivider>
          <SidebarNavButton
            theme={sidebar}
            expanded={expanded}
            active={currentView === "email" && !activeEmailTemplateId}
            icon="mail"
            label="Email Studio"
            onClick={onNavigateEmail}
            onContextMenu={(e) =>
              showMenu(
                e,
                buildEmailNavMenuItems({
                  onNavigateEmail,
                  onNewEmail,
                  onRefresh: onSidebarRefresh,
                  isAdmin: Boolean(canMarketingReport ?? isAdmin),
                  onNavigateMedia,
                }),
              )
            }
          />
          <SidebarNavButton
            theme={sidebar}
            expanded={expanded}
            active={currentView === "campaigns"}
            icon="send"
            label="Email Campaigns"
            onClick={onNavigateCampaigns}
            onContextMenu={(e) => showMenu(e, [{ label: "Open email campaigns", action: onNavigateCampaigns }])}
          />
          <SidebarNavButton
            theme={sidebar}
            expanded={expanded}
            active={currentView === "social"}
            icon="megaphone"
            label="Social Campaigns"
            onClick={onNavigateSocial}
            onContextMenu={(e) => showMenu(e, [{ label: "Open social campaigns", action: onNavigateSocial }])}
          />
          {canMarketingReport ?? isAdmin ? (
            <SidebarNavButton
              theme={sidebar}
              expanded={expanded}
              active={currentView === "media"}
              icon="chart"
              label="Marketing Report"
              onClick={onNavigateMedia}
              onContextMenu={(e) => showMenu(e, [{ label: "Open marketing report", action: onNavigateMedia }])}
            />
          ) : null}
        </SidebarNavSection>
      </nav>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          padding: expanded ? "4px 10px 8px" : "0 0 4px",
          display: "flex",
          flexDirection: "column",
        }}
        onContextMenu={openSidebarAreaMenu}
      >
        <SidebarFolderTree
          sidebar={sidebar}
          expanded={expanded}
          userId={userId}
          refreshKey={refreshKey}
          currentView={currentView}
          activeProposalId={activeProposalId}
          activeEmailTemplateId={activeEmailTemplateId}
          onOpenProposal={onOpenProposal}
          onOpenEmailTemplate={onOpenEmailTemplate}
          onNavigateProjects={onNavigateProjects}
          onDeleteEmailTemplate={onEmailTemplateDeleted}
          onProposalDeleted={onProposalDeleted}
          onPinsChanged={onPinsChanged}
          onNavigateEmail={onNavigateEmail}
          onNewProject={onNewProject}
          onNewEmail={onNewEmail}
          onNewProjectInFolder={onNewProjectInFolder}
          onNewEmailInFolder={onNewEmailInFolder}
          onSidebarRefresh={onSidebarRefresh}
          setContextMenu={setContextMenu}
        />
      </div>

      <div
        style={{
          padding: expanded ? "12px 10px 16px" : "12px 8px 16px",
          borderTop: `1px solid ${sidebar.border}`,
          display: "flex",
          flexDirection: "column",
          gap: 4,
          flexShrink: 0,
        }}
      >
        <SidebarNavButton
          theme={sidebar}
          expanded={expanded}
          active={currentView === "settings"}
          icon="settings"
          label="Settings"
          onClick={onOpenSettings}
          onContextMenu={(e) => showMenu(e, [{ label: "Open settings", action: onOpenSettings }])}
        />
        <button
          type="button"
          onClick={handleSignOutClick}
          onContextMenu={(e) => showMenu(e, [{ label: "Sign out", action: handleSignOutClick, danger: true }])}
          title={!expanded ? "Sign out" : undefined}
          style={
            expanded
              ? {
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: 8,
                  ...SIGN_OUT_RED,
                  fontFamily: fontSans,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  marginTop: 2,
                  WebkitAppearance: "none",
                  appearance: "none",
                }
              : sidebarRowStyle(sidebar, { expanded: false, danger: true })
          }
        >
          <span style={sidebarIconWrap(SIDEBAR_ICON_SIZE)}>
            <AppIcon name="signOut" size={SIDEBAR_ICON_SIZE} />
          </span>
          {expanded ? <span style={{ color: "currentColor" }}>Sign out</span> : null}
        </button>
      </div>

      {contextMenu ? (
        <SidebarContextMenu
          isDark={isDark}
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
    </aside>
  );
}
