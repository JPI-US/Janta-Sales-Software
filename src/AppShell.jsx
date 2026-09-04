import React from "react";
import { fontSans, getAppTheme } from "./appTheme.js";
import AppSidebar, { SIDEBAR_WIDTH_COLLAPSED } from "./AppSidebar.jsx";

export default function AppShell({
  isDark,
  currentView,
  activeProposalId,
  activeEmailTemplateId,
  userId,
  isAdmin,
  sidebarRefreshKey,
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
  children,
}) {
  const theme = getAppTheme(isDark);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: theme.bg,
        fontFamily: fontSans,
      }}
    >
      <AppSidebar
        isDark={isDark}
        currentView={currentView}
        activeProposalId={activeProposalId}
        activeEmailTemplateId={activeEmailTemplateId}
        userId={userId}
        isAdmin={isAdmin}
        refreshKey={sidebarRefreshKey}
        onNavigateProjects={onNavigateProjects}
        onNavigateReports={onNavigateReports}
        onNavigateMedia={onNavigateMedia}
        onNavigateCampaigns={onNavigateCampaigns}
        onNavigateCalendar={onNavigateCalendar}
        onNavigateEmail={onNavigateEmail}
        onNavigateSocial={onNavigateSocial}
        onNewProject={onNewProject}
        onNewEmail={onNewEmail}
        onNewProjectInFolder={onNewProjectInFolder}
        onNewEmailInFolder={onNewEmailInFolder}
        onSidebarRefresh={onSidebarRefresh}
        onOpenProposal={onOpenProposal}
        onOpenEmailTemplate={onOpenEmailTemplate}
        onEmailTemplateDeleted={onEmailTemplateDeleted}
        onProposalDeleted={onProposalDeleted}
        onPinsChanged={onPinsChanged}
        onOpenSettings={onOpenSettings}
        onSignOut={onSignOut}
        onDarkModeToggle={onDarkModeToggle}
      />
      <main
        style={{
          marginLeft: SIDEBAR_WIDTH_COLLAPSED,
          minWidth: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </main>
    </div>
  );
}
