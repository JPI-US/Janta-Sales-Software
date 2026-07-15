import React, { useCallback, useEffect, useRef, useState } from "react";
import JantaProposal from "../janta-proposal-generator-v3 (1).jsx";
import ProposalsLibrary from "./ProposalsLibrary.jsx";
import { getProposalForUser } from "./proposalStorage.js";
import { SNAPSHOT_VERSION } from "./proposalSnapshot.js";
import { newProposalId } from "./proposalIds.js";
import {
  clearSessionDraft,
  deriveProposalTitle,
  migrateLegacyProposalAccount,
  proposalStorageKey,
  saveProposal,
} from "./proposalStorage.js";

const NAV_SESSION_PREFIX = "janta_app_nav_v1_";

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
    if (parsed?.view !== "library" && parsed?.view !== "editor") return null;
    return parsed;
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
  onOpenSettings,
  onSignOut,
  initialDarkMode,
  onDarkModeChange,
}) {
  const accountKey = proposalStorageKey(currentUser);
  const savedNav = useRef(readNavState(accountKey)).current;
  const [view, setView] = useState(savedNav?.view === "editor" ? "editor" : "library");
  const [editorKey, setEditorKey] = useState(0);
  const [appDarkMode, setAppDarkMode] = useState(Boolean(initialDarkMode));
  const [activeProposal, setActiveProposal] = useState({
    id: savedNav?.proposalId || null,
    title: savedNav?.proposalTitle || "",
    snapshot: null,
  });
  const [libraryKey, setLibraryKey] = useState(0);
  const [autoDownloadPdf, setAutoDownloadPdf] = useState(false);
  const [restoring, setRestoring] = useState(
    Boolean(savedNav?.view === "editor" && savedNav?.proposalId)
  );
  const restoreStarted = useRef(false);
  const creatingProposal = useRef(false);
  const autosaveInFlight = useRef(null);
  const activeProposalRef = useRef(activeProposal);
  activeProposalRef.current = activeProposal;

  const persistNav = useCallback(
    (nextView, proposal = activeProposal) => {
      writeNavState(accountKey, {
        view: nextView,
        proposalId: proposal?.id || null,
        proposalTitle: proposal?.title || "",
      });
    },
    [accountKey, activeProposal]
  );

  useEffect(() => {
    if (!accountKey) return;
    migrateLegacyProposalAccount(accountKey, currentUser.id).catch(() => {});
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

  const openLibrary = useCallback(() => {
    setAutoDownloadPdf(false);
    setView("library");
    setLibraryKey((k) => k + 1);
    persistNav("library", { id: null, title: "", snapshot: null });
  }, [persistNav]);

  const openProposalRecord = useCallback(
    (record, { downloadPdf = false } = {}) => {
      const next = {
        id: record.id,
        title: record.title || deriveProposalTitle(record.snapshot),
        snapshot: record.snapshot,
      };
      setActiveProposal(next);
      setEditorKey((k) => k + 1);
      setAutoDownloadPdf(Boolean(downloadPdf));
      setView("editor");
      persistNav("editor", next);
    },
    [persistNav]
  );

  const handleDownloadPdfFromLibrary = useCallback(
    (record) => openProposalRecord(record, { downloadPdf: true }),
    [openProposalRecord]
  );

  const startNewProposal = useCallback(async () => {
    if (creatingProposal.current) return;
    creatingProposal.current = true;
    try {
      const snapshot = emptyEditorSnapshot();
      const newId = newProposalId();
      const created = await saveProposal({
        userId: accountKey,
        id: newId,
        snapshot,
        title: deriveProposalTitle(snapshot),
        userEmail: currentUser.email,
      });
      await clearSessionDraft(accountKey);
      const next = {
        id: created.id,
        title: created.title,
        snapshot: created.snapshot,
      };
      setActiveProposal(next);
      setEditorKey((k) => k + 1);
      setView("editor");
      persistNav("editor", next);
    } catch (err) {
      window.alert(err.message || "Could not create proposal. Is the cloud API running?");
    } finally {
      creatingProposal.current = false;
    }
  }, [accountKey, currentUser.email, persistNav]);

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
    [accountKey, currentUser.email, view, persistNav]
  );

  if (restoring) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: appDarkMode ? "#000000" : "#F3F4F6",
          color: appDarkMode ? "#D8C6AE" : "#6F8096",
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: 14,
        }}
      >
        Restoring your proposal…
      </div>
    );
  }

  if (view === "library") {
    return (
      <ProposalsLibrary
        key={libraryKey}
        userId={accountKey}
        userName={currentUser.name}
        userEmail={currentUser.email}
        isDark={appDarkMode}
        onOpenProposal={openProposalRecord}
        onDownloadProposalPdf={handleDownloadPdfFromLibrary}
        onNewProposal={startNewProposal}
        onOpenSettings={onOpenSettings}
        onSignOut={onSignOut}
        onDarkModeToggle={() => {
          const next = !appDarkMode;
          setAppDarkMode(next);
          if (typeof onDarkModeChange === "function") onDarkModeChange(next);
        }}
      />
    );
  }

  return (
    <JantaProposal
      key={editorKey}
      currentUserId={accountKey}
      initialSnapshot={activeProposal.snapshot}
      savedProposalId={activeProposal.id}
      savedProposalTitle={activeProposal.title}
      onOpenProposals={openLibrary}
      autoDownloadPdf={autoDownloadPdf}
      onAutoDownloadPdfDone={openLibrary}
      onAutosaveProposal={handleAutosave}
      onOpenSettings={onOpenSettings}
      onSignOut={onSignOut}
      initialDarkMode={appDarkMode}
      onDarkModeChange={(next) => {
        setAppDarkMode(Boolean(next));
        if (typeof onDarkModeChange === "function") onDarkModeChange(next);
      }}
    />
  );
}
