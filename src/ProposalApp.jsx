import React, { useCallback, useEffect, useRef, useState } from "react";
import JantaProposal from "../janta-proposal-generator-v3 (1).jsx";
import ProposalsLibrary from "./ProposalsLibrary.jsx";
import ReportsDashboard from "./ReportsDashboard.jsx";
import EmailCampaignsPage from "./EmailCampaignsPage.jsx";
import SocialCampaignsPage from "./SocialCampaignsPage.jsx";
import MarketingReportPage from "./MarketingReportPage.jsx";
const EmailStudioPage = React.lazy(() => import("./EmailStudioPage.jsx"));
import SettingsPage from "./SettingsPage.jsx";
import CalendarPage from "./CalendarPage.jsx";
import AppShell from "./AppShell.jsx";
import { getProposalForUser } from "./proposalStorage.js";
import { SNAPSHOT_VERSION } from "./proposalSnapshot.js";
import { newProposalId } from "./proposalIds.js";
import {
  clearSessionDraft,
  deriveProposalTitle,
  migrateLegacyProposalAccount,
  proposalStorageKey,
  saveProposal,
  saveProposalCrmFields,
} from "./proposalStorage.js";
import { CRM_STAGE_CREATED } from "../shared/proposalCrmFields.js";
import { confirmSignOut } from "./appIcons.jsx";
import { runThemeTransition, themeTransitionClickOrigin } from "./themeTransition.js";
import { initEmailStudioStore } from "./emailStudioStoreBridge.js";
import { deleteProposal } from "./proposalStorage.js";
import { isProposalPinned, togglePinnedProposal } from "./pinnedProposals.js";
import { assignProposalToFolder } from "./proposalFolders.js";

const NAV_SESSION_PREFIX = "janta_app_nav_v1_";
const APP_VIEWS = new Set([
  "library",
  "editor",
  "reports",
  "media",
  "campaigns",
  "email",
  "calendar",
  "social",
  "emailAnalytics",
  "socialAnalytics",
  "website",
]);

const MARKETING_SECTIONS = new Set(["overview", "email", "social", "website"]);

function marketingSectionFromView(view, section) {
  if (MARKETING_SECTIONS.has(section)) return section;
  if (view === "socialAnalytics") return "social";
  if (view === "website") return "website";
  if (view === "emailAnalytics") return "email";
  return "overview";
}

function canonicalView(view) {
  if (view === "emailAnalytics" || view === "socialAnalytics" || view === "website") return "media";
  return view;
}

function emptyEditorSnapshot() {
  return {
    v: SNAPSHOT_VERSION,
    step: 0,
    custName: "",
    custAddress: "",
    multiMeterMode: false,
    meters: [],
  };
}

function readNavState(userId) {
  if (!userId) return null;
  try {
    const raw = sessionStorage.getItem(`${NAV_SESSION_PREFIX}${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!APP_VIEWS.has(parsed?.view)) return null;
    return {
      ...parsed,
      view: canonicalView(parsed.view),
      marketingSection: marketingSectionFromView(parsed.view, parsed.marketingSection),
    };
  } catch {
    return null;
  }
}

function writeNavState(userId, state) {
  if (!userId) return;
  try {
    sessionStorage.setItem(`${NAV_SESSION_PREFIX}${userId}`, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

export default function ProposalApp({
  currentUser,
  onUserUpdate,
  onSignOut,
  initialDarkMode,
  onDarkModeChange,
}) {
  const accountKey = proposalStorageKey(currentUser);
  const isAdmin = Boolean(currentUser?.isAdmin);
  const savedNav = useRef(readNavState(accountKey)).current;
  const [view, setView] = useState(savedNav?.view === "editor" ? "editor" : "library");
  const [editorKey, setEditorKey] = useState(0);
  const [appDarkMode, setAppDarkMode] = useState(Boolean(initialDarkMode));
  const [activeProposal, setActiveProposal] = useState({
    id: savedNav?.proposalId || null,
    title: savedNav?.proposalTitle || "",
    snapshot: null,
  });
  const [libraryRefreshKey, setLibraryRefreshKey] = useState(0);
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);
  const [activeEmailTemplateId, setActiveEmailTemplateId] = useState(null);
  const [pendingProjectCreate, setPendingProjectCreate] = useState(false);
  const [pendingEmailCreate, setPendingEmailCreate] = useState(false);
  const [pendingProjectFolderId, setPendingProjectFolderId] = useState(null);
  const [pendingEmailFolderId, setPendingEmailFolderId] = useState(null);
  const [marketingSection, setMarketingSection] = useState(() => savedNav?.marketingSection || "overview");
  const [autoDownloadPdf, setAutoDownloadPdf] = useState(false);
  const [restoring, setRestoring] = useState(Boolean(savedNav?.view === "editor" && savedNav?.proposalId));
  const restoreStarted = useRef(false);
  const creatingProposal = useRef(false);
  const autosaveInFlight = useRef(null);
  const activeProposalRef = useRef(activeProposal);
  const beforeNavigateRef = useRef(null);
  activeProposalRef.current = activeProposal;

  const bumpSidebarRefresh = useCallback(() => {
    setSidebarRefreshKey((k) => k + 1);
  }, []);

  const bumpLibraryRefresh = useCallback(() => {
    setLibraryRefreshKey((k) => k + 1);
  }, []);

  const handleSidebarRefresh = useCallback(() => {
    bumpLibraryRefresh();
    bumpSidebarRefresh();
  }, [bumpLibraryRefresh, bumpSidebarRefresh]);

  const runBeforeNavigate = useCallback(async () => {
    if (view !== "editor" || typeof beforeNavigateRef.current !== "function") return true;
    return beforeNavigateRef.current();
  }, [view]);

  const persistNav = useCallback(
    (nextView, proposal = activeProposal, extra = {}) => {
      writeNavState(accountKey, {
        view: nextView,
        proposalId: proposal?.id || null,
        proposalTitle: proposal?.title || "",
        ...extra,
      });
    },
    [accountKey, activeProposal]
  );

  useEffect(() => {
    if (!accountKey) return;
    migrateLegacyProposalAccount(accountKey, currentUser.id).catch(() => {});
    initEmailStudioStore(accountKey).catch(() => {});
  }, [accountKey, currentUser.id]);

  useEffect(() => {
    if (restoreStarted.current) return;
    restoreStarted.current = true;
    if (savedNav?.view !== "editor" || !savedNav?.proposalId) {
      setRestoring(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const record = await getProposalForUser(accountKey, savedNav.proposalId);
        if (cancelled || !record) {
          setView("library");
          writeNavState(accountKey, { view: "library", proposalId: null, proposalTitle: "" });
          return;
        }
        setActiveProposal({
          id: record.id,
          title: record.title || deriveProposalTitle(record.snapshot),
          snapshot: record.snapshot,
        });
        setEditorKey((k) => k + 1);
        setView("editor");
      } catch {
        if (!cancelled) setView("library");
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountKey, savedNav?.proposalId, savedNav?.view]);

  const openLibrary = useCallback(async () => {
    if (!(await runBeforeNavigate())) return;
    setAutoDownloadPdf(false);
    setActiveEmailTemplateId(null);
    setView("library");
    setLibraryRefreshKey((k) => k + 1);
    bumpSidebarRefresh();
    persistNav("library", { id: null, title: "", snapshot: null });
  }, [runBeforeNavigate, persistNav, bumpSidebarRefresh]);

  const openReports = useCallback(async () => {
    if (!isAdmin) return;
    if (!(await runBeforeNavigate())) return;
    setView("reports");
    persistNav("reports", { id: null, title: "", snapshot: null });
  }, [isAdmin, runBeforeNavigate, persistNav]);

  const openCampaigns = useCallback(async () => {
    if (!(await runBeforeNavigate())) return;
    setView("campaigns");
    persistNav("campaigns", { id: null, title: "", snapshot: null });
  }, [runBeforeNavigate, persistNav]);

  const openMedia = useCallback(
    async (section = "overview") => {
      if (!isAdmin) return;
      if (!(await runBeforeNavigate())) return;
      const nextSection = typeof section === "string" && MARKETING_SECTIONS.has(section) ? section : "overview";
      setMarketingSection(nextSection);
      setView("media");
      persistNav("media", { id: null, title: "", snapshot: null }, { marketingSection: nextSection });
    },
    [isAdmin, runBeforeNavigate, persistNav],
  );

  const openCalendar = useCallback(async () => {
    if (!(await runBeforeNavigate())) return;
    setView("calendar");
    persistNav("calendar", { id: null, title: "", snapshot: null });
  }, [runBeforeNavigate, persistNav]);

  const openEmailStudio = useCallback(async () => {
    if (!(await runBeforeNavigate())) return;
    setActiveEmailTemplateId(null);
    setView("email");
    persistNav("email", { id: null, title: "", snapshot: null });
  }, [runBeforeNavigate, persistNav]);

  const openSocial = useCallback(async () => {
    if (!(await runBeforeNavigate())) return;
    setView("social");
    persistNav("social", { id: null, title: "", snapshot: null });
  }, [runBeforeNavigate, persistNav]);

  const requestNewProject = useCallback(async () => {
    if (!(await runBeforeNavigate())) return;
    setAutoDownloadPdf(false);
    setActiveEmailTemplateId(null);
    setView("library");
    setPendingProjectFolderId(null);
    setPendingProjectCreate(true);
    bumpLibraryRefresh();
    bumpSidebarRefresh();
    persistNav("library", { id: null, title: "", snapshot: null });
  }, [runBeforeNavigate, persistNav, bumpLibraryRefresh, bumpSidebarRefresh]);

  const requestNewProjectInFolder = useCallback(
    async (folderId) => {
      if (!(await runBeforeNavigate())) return;
      setAutoDownloadPdf(false);
      setActiveEmailTemplateId(null);
      setView("library");
      setPendingProjectFolderId(folderId || null);
      setPendingProjectCreate(true);
      bumpLibraryRefresh();
      bumpSidebarRefresh();
      persistNav("library", { id: null, title: "", snapshot: null });
    },
    [runBeforeNavigate, persistNav, bumpLibraryRefresh, bumpSidebarRefresh],
  );

  const requestNewEmail = useCallback(async () => {
    if (!(await runBeforeNavigate())) return;
    setActiveEmailTemplateId(null);
    setView("email");
    setPendingEmailFolderId(null);
    setPendingEmailCreate(true);
    persistNav("email", { id: null, title: "", snapshot: null });
  }, [runBeforeNavigate, persistNav]);

  const requestNewEmailInFolder = useCallback(
    async (folderId) => {
      if (!(await runBeforeNavigate())) return;
      setActiveEmailTemplateId(null);
      setView("email");
      setPendingEmailFolderId(!folderId || folderId === "orphan" ? null : folderId);
      setPendingEmailCreate(true);
      persistNav("email", { id: null, title: "", snapshot: null });
    },
    [runBeforeNavigate, persistNav],
  );

  const openEmailTemplate = useCallback(
    async (templateId) => {
      if (!(await runBeforeNavigate())) return;
      setActiveEmailTemplateId(templateId || null);
      setView("email");
      persistNav("email", { id: null, title: "", snapshot: null });
    },
    [runBeforeNavigate, persistNav]
  );

  const handleEmailTemplateDeleted = useCallback((templateId) => {
    setActiveEmailTemplateId((current) => (current === templateId ? null : current));
  }, []);

  const handleProposalDeletedFromSidebar = useCallback(
    (proposalId) => {
      if (proposalId && proposalId === activeProposalRef.current?.id) {
        setActiveProposal({ id: null, title: "", snapshot: null });
        setView("library");
        persistNav("library", { id: null, title: "", snapshot: null });
      }
      bumpSidebarRefresh();
      setLibraryRefreshKey((k) => k + 1);
    },
    [persistNav, bumpSidebarRefresh],
  );

  const openSettings = useCallback(async () => {
    if (!(await runBeforeNavigate())) return;
    setView("settings");
  }, [runBeforeNavigate]);

  const openProposalRecord = useCallback(
    async (record, { downloadPdf = false } = {}) => {
      if (view === "editor" && record?.id === activeProposalRef.current?.id) return;
      if (!(await runBeforeNavigate())) return;

      let full = record;
      if (record?.id && !record?.snapshot) {
        full = await getProposalForUser(accountKey, record.id);
        if (!full) {
          window.alert("Could not load that project.");
          return;
        }
      }

      const next = {
        id: full.id,
        title: full.title || deriveProposalTitle(full.snapshot),
        snapshot: full.snapshot,
      };
      if (!next.snapshot) {
        window.alert("Could not load that project's saved data.");
        return;
      }
      setActiveProposal(next);
      setEditorKey((k) => k + 1);
      setAutoDownloadPdf(Boolean(downloadPdf));
      setView("editor");
      bumpSidebarRefresh();
      persistNav("editor", next);
    },
    [view, accountKey, runBeforeNavigate, persistNav, bumpSidebarRefresh]
  );

  const handleDownloadPdfFromLibrary = useCallback(
    (record) => openProposalRecord(record, { downloadPdf: true }),
    [openProposalRecord]
  );

  const handleDeleteActiveProposal = useCallback(async () => {
    const id = activeProposalRef.current?.id;
    if (!id) return;
    const label = activeProposalRef.current?.title || "this project";
    if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) return;
    try {
      await deleteProposal(id, accountKey);
      bumpSidebarRefresh();
      setLibraryRefreshKey((k) => k + 1);
      setActiveProposal({ id: null, title: "", snapshot: null });
      setView("library");
      persistNav("library", { id: null, title: "", snapshot: null });
    } catch (err) {
      window.alert(err.message || "Could not delete project.");
    }
  }, [accountKey, bumpSidebarRefresh, persistNav]);

  const handleTogglePinActiveProposal = useCallback(() => {
    const id = activeProposalRef.current?.id;
    if (!id) return;
    togglePinnedProposal(accountKey, id);
    bumpSidebarRefresh();
  }, [accountKey, bumpSidebarRefresh]);

  const startNewProposal = useCallback(
    async (projectName, folderId = null) => {
      const name = String(projectName || "").trim();
      if (!name) return false;
      if (creatingProposal.current) return false;
      if (!(await runBeforeNavigate())) return false;
      creatingProposal.current = true;
      try {
        const snapshot = { ...emptyEditorSnapshot(), proposalTitle: name };
        const newId = newProposalId();
        await saveProposal({
          userId: accountKey,
          id: newId,
          snapshot,
          title: deriveProposalTitle(snapshot),
          userEmail: currentUser.email,
        });
        await saveProposalCrmFields({
          userId: accountKey,
          id: newId,
          userEmail: currentUser.email,
          stage: CRM_STAGE_CREATED,
          proposalOwner: currentUser.name || currentUser.username || currentUser.email || null,
        });
        if (folderId) assignProposalToFolder(accountKey, newId, folderId);
        await clearSessionDraft(accountKey);
        setLibraryRefreshKey((k) => k + 1);
        bumpSidebarRefresh();
        return true;
      } catch (err) {
        window.alert(err.message || "Could not create proposal. Is the cloud API running?");
        return false;
      } finally {
        creatingProposal.current = false;
      }
    },
    [accountKey, currentUser.email, runBeforeNavigate, bumpSidebarRefresh]
  );

  const handleAutosave = useCallback(
    async ({ snapshot }) => {
      const { id, title } = activeProposalRef.current;
      if (!id) return null;
      if (autosaveInFlight.current) return autosaveInFlight.current;

      const run = (async () => {
        const nextTitle = deriveProposalTitle(snapshot) || title;
        const saved = await saveProposal({
          userId: accountKey,
          id,
          title: nextTitle,
          snapshot,
          userEmail: currentUser.email,
        });
        const next = {
          id: saved.id,
          title: saved.title,
          snapshot: saved.snapshot,
        };
        setActiveProposal(next);
        bumpSidebarRefresh();
        if (view === "editor") persistNav("editor", next);
        return saved;
      })();

      autosaveInFlight.current = run;
      try {
        return await run;
      } finally {
        if (autosaveInFlight.current === run) autosaveInFlight.current = null;
      }
    },
    [accountKey, currentUser.email, view, persistNav, bumpSidebarRefresh]
  );

  const handleSidebarSignOut = useCallback(async () => {
    if (!confirmSignOut({ withSaveHint: view === "editor" })) return;
    if (!(await runBeforeNavigate())) return;
    if (typeof onSignOut === "function") onSignOut();
  }, [view, runBeforeNavigate, onSignOut]);

  const toggleDarkMode = useCallback(
    (event) => {
      const next = !appDarkMode;
      const { x, y } = themeTransitionClickOrigin(event);
      runThemeTransition({ x, y, toDark: next }, () => {
        setAppDarkMode(next);
        if (typeof onDarkModeChange === "function") onDarkModeChange(next);
      });
    },
    [appDarkMode, onDarkModeChange]
  );

  const registerBeforeNavigate = useCallback((handler) => {
    beforeNavigateRef.current = typeof handler === "function" ? handler : null;
  }, []);

  if (restoring) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: appDarkMode ? "#000000" : "#F3F4F6",
          color: appDarkMode ? "#9CA3AF" : "#6F8096",
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: 14,
        }}
      >
        Restoring your proposal…
      </div>
    );
  }

  let page = null;
  if (view === "settings") {
    page = (
      <SettingsPage
        currentUser={currentUser}
        isDark={appDarkMode}
        onBack={openLibrary}
        onUserUpdate={onUserUpdate}
      />
    );
  } else if (view === "calendar") {
    page = (
      <CalendarPage
        isDark={appDarkMode}
        userName={currentUser.name}
        userEmail={currentUser.email}
        accountKey={accountKey}
        onBack={openLibrary}
      />
    );
  } else if (view === "social") {
    page = (
      <SocialCampaignsPage
        isDark={appDarkMode}
        userName={currentUser.name}
        userEmail={currentUser.email}
        onBack={openLibrary}
        onOpenAnalytics={isAdmin ? () => openMedia("social") : undefined}
      />
    );
  } else if (view === "media" && isAdmin) {
    page = (
      <MarketingReportPage
        isDark={appDarkMode}
        userName={currentUser.name}
        userEmail={currentUser.email}
        onBack={openLibrary}
        onOpenEmailStudio={openEmailStudio}
        section={marketingSection}
        onSectionChange={(next) => {
          const nextSection = MARKETING_SECTIONS.has(next) ? next : "overview";
          setMarketingSection(nextSection);
          persistNav("media", { id: null, title: "", snapshot: null }, { marketingSection: nextSection });
        }}
      />
    );
  } else if (view === "reports" && isAdmin) {
    page = (
      <ReportsDashboard
        isDark={appDarkMode}
        userName={currentUser.name}
        userEmail={currentUser.email}
        onBack={openLibrary}
      />
    );
  } else if (view === "campaigns") {
    page = (
      <EmailCampaignsPage
        isDark={appDarkMode}
        userName={currentUser.name}
        userEmail={currentUser.email}
        accountKey={accountKey}
        onBack={openLibrary}
        onOpenEmailStudio={openEmailStudio}
        onOpenEmailTemplate={openEmailTemplate}
      />
    );
  } else if (view === "email") {
    page = (
      <React.Suspense
        fallback={
          <div
            style={{
              minHeight: "100vh",
              display: "grid",
              placeItems: "center",
              color: appDarkMode ? "#9CA3AF" : "#6F8096",
              fontFamily: "Inter, system-ui, sans-serif",
              fontSize: 14,
            }}
          >
            Loading Email Studio…
          </div>
        }
      >
        <EmailStudioPage
          isDark={appDarkMode}
          accountKey={accountKey}
          templateId={activeEmailTemplateId}
          userName={currentUser.name}
          userEmail={currentUser.email}
          onActiveTemplateChange={setActiveEmailTemplateId}
          onPinsChanged={bumpSidebarRefresh}
          autoOpenCreate={pendingEmailCreate}
          autoOpenCreateFolderId={pendingEmailFolderId}
          onAutoOpenCreateHandled={() => {
            setPendingEmailCreate(false);
            setPendingEmailFolderId(null);
          }}
        />
      </React.Suspense>
    );
  } else if (view === "library") {
    page = (
      <ProposalsLibrary
        refreshKey={libraryRefreshKey}
        userId={accountKey}
        userName={currentUser.name}
        userEmail={currentUser.email}
        isDark={appDarkMode}
        onOpenProposal={openProposalRecord}
        onDownloadProposalPdf={handleDownloadPdfFromLibrary}
        onNewProposal={startNewProposal}
        onProposalUpdated={bumpSidebarRefresh}
        onPinsChanged={bumpSidebarRefresh}
        autoOpenCreate={pendingProjectCreate}
        autoOpenCreateFolderId={pendingProjectFolderId}
        onAutoOpenCreateHandled={() => {
          setPendingProjectCreate(false);
          setPendingProjectFolderId(null);
        }}
      />
    );
  } else {
    page = (
      <JantaProposal
        key={editorKey}
        currentUserId={accountKey}
        initialSnapshot={activeProposal.snapshot}
        savedProposalId={activeProposal.id}
        savedProposalTitle={activeProposal.title}
        autoDownloadPdf={autoDownloadPdf}
        onAutoDownloadPdfDone={openLibrary}
        onAutosaveProposal={handleAutosave}
        onRegisterBeforeNavigate={registerBeforeNavigate}
        onOpenProposals={openLibrary}
        onDeleteProposal={handleDeleteActiveProposal}
        onTogglePinProposal={handleTogglePinActiveProposal}
        proposalPinned={isProposalPinned(accountKey, activeProposal.id)}
        pinRefreshKey={sidebarRefreshKey}
        initialDarkMode={appDarkMode}
        onDarkModeChange={(next) => {
          setAppDarkMode(Boolean(next));
          if (typeof onDarkModeChange === "function") onDarkModeChange(next);
        }}
      />
    );
  }

  return (
    <AppShell
      isDark={appDarkMode}
      currentView={view}
      activeProposalId={activeProposal.id}
      activeEmailTemplateId={activeEmailTemplateId}
      userId={accountKey}
      isAdmin={isAdmin}
      sidebarRefreshKey={sidebarRefreshKey}
      onNavigateProjects={openLibrary}
      onNavigateReports={openReports}
      onNavigateMedia={openMedia}
      onNavigateCampaigns={openCampaigns}
      onNavigateCalendar={openCalendar}
      onNavigateEmail={openEmailStudio}
      onNavigateSocial={openSocial}
      onNewProject={requestNewProject}
      onNewEmail={requestNewEmail}
      onNewProjectInFolder={requestNewProjectInFolder}
      onNewEmailInFolder={requestNewEmailInFolder}
      onSidebarRefresh={handleSidebarRefresh}
      onOpenProposal={openProposalRecord}
      onOpenEmailTemplate={openEmailTemplate}
      onEmailTemplateDeleted={handleEmailTemplateDeleted}
      onProposalDeleted={handleProposalDeletedFromSidebar}
      onPinsChanged={bumpSidebarRefresh}
      onOpenSettings={openSettings}
      onSignOut={handleSidebarSignOut}
      onDarkModeToggle={toggleDarkMode}
    >
      {page}
    </AppShell>
  );
}
