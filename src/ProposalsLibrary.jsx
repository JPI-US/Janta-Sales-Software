import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CRM_LIKELIHOOD_OPTIONS,
  CRM_PRIORITY_OPTIONS,
  CRM_STAGE_CREATED,
  CRM_STAGE_OPTIONS,
  CRM_STAGE_OPTIONS_OPEN,
  CRM_STAGE_OPTIONS_CLOSED,
  isClosedProposal,
  crmAddress,
  crmCanDownloadPdf,
  crmDealTypeDisplay,
  crmDealTypeShortDisplay,
  CRM_PROJECT_TYPE_SELECT_OPTIONS,
  CRM_FINANCING_OPTIONS,
  storedDealType,
  storedProjectCategory,
  crmLikelihoodColor,
  crmLikelihoodLabel,
  crmProjectName,
  crmStageColor,
  crmStageLabel,
  crmDealTypeShortLabel,
  CRM_DEAL_TYPE_FILTER_OPTIONS,
  resolveDealType,
  crmSystemSizeDisplay,
  deriveAutoRevenue,
  deriveEstimatedRevenue,
  normalizeCrmStage,
  resolvePriority,
  crmFormatDate,
  crmFormatDateShort,
  crmResolveCloseDate,
} from "./proposalCrm.js";
import { parseOptionalNumber, isClosedStage, CRM_PRIORITY_HIGH, CRM_PRIORITY_LOW, CRM_PRIORITY_MEDIUM } from "../shared/proposalCrmFields.js";
import { getQuarterlyPeriod, deriveSystemSizeKw } from "../shared/reportMetrics.js";
import {
  getAppTheme,
  fontSans,
  pageShellStyle,
} from "./appTheme.js";
import {
  PageGuide,
  PageHeader,
  RibbonLabeledButton,
  SearchField,
  TableIconButton,
  tableActionBtnStyle,
} from "./appIcons.jsx";
import { getHubSpotStatus, syncHubSpot } from "./hubspotApi.js";
import * as authApi from "./authApi.js";
import { formatUsd } from "./solarPricing.js";
import {
  deleteProposal,
  deriveProposalTitle,
  editableProjectTitle,
  listTeamProposals,
  PROPOSAL_STATUS_CLOSED,
  saveProposal,
  saveProposalCrmFields,
} from "./proposalStorage.js";
import { canCreateProjects, canEditOwnedRecord } from "../shared/roles.js";
import { isProposalPinned, readPinnedProposalIds, togglePinnedProposal } from "./pinnedProposals.js";
import CollapsibleTableSection from "./CollapsibleTableSection.jsx";
import EmptyTablePlaceholder from "./EmptyTablePlaceholder.jsx";
import SidebarContextMenu from "./sidebar/SidebarContextMenu.jsx";
import { buildEmptyProposalFolderMenuItems } from "./sidebar/sidebarProposalMenus.js";
import {
  assignProposalToFolder,
  createProposalFolder,
  folderTableKey,
  groupProposalsByFolder,
  isProposalTableCollapsed,
  listProposalFolders,
  toggleProposalTableCollapsed,
} from "./proposalFolders.js";

/** All pipeline stages for open-deal table selects (deduped — no duplicate keys). */
const ACTIVE_STAGE_OPTIONS = CRM_STAGE_OPTIONS;

export default function ProposalsLibrary({
  userId,
  userName,
  userEmail,
  isDark,
  refreshKey = 0,
  onOpenProposal,
  onDownloadProposalPdf,
  onNewProposal,
  onProposalUpdated,
  onPinsChanged,
  autoOpenCreate = false,
  autoOpenCreateFolderId = null,
  onAutoOpenCreateHandled,
  topSlot = null,
  currentUser = null,
}) {
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [teamOwners, setTeamOwners] = useState([]);
  const [downloadingId, setDownloadingId] = useState(null);
  const [crmBusyId, setCrmBusyId] = useState(null);
  const [titleBusyId, setTitleBusyId] = useState(null);
  const [hubspotConfigured, setHubspotConfigured] = useState(false);
  const [hubspotSyncing, setHubspotSyncing] = useState(false);
  const [hubspotNote, setHubspotNote] = useState("");
  const [listFilter, setListFilter] = useState("open");
  const [stageFilter, setStageFilter] = useState(null);
  const [priorityFilter, setPriorityFilter] = useState(null);
  const [ownerFilter, setOwnerFilter] = useState(null);
  const [typeFilter, setTypeFilter] = useState(null);
  const [likelihoodFilter, setLikelihoodFilter] = useState(null);
  const [closeFilter, setCloseFilter] = useState(null);
  const [revenueFilter, setRevenueFilter] = useState(null);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [pinnedIds, setPinnedIds] = useState(() => readPinnedProposalIds(userId));
  const [rowMenu, setRowMenu] = useState(null);
  const [tableMenu, setTableMenu] = useState(null);
  const [folderTick, setFolderTick] = useState(0);
  const [createFolderId, setCreateFolderId] = useState(null);

  useEffect(() => {
    if (!autoOpenCreate) return;
    if (!canCreateProjects(currentUser)) {
      onAutoOpenCreateHandled?.();
      return;
    }
    setCreateFolderId(autoOpenCreateFolderId || null);
    setCreateDialogOpen(true);
    onAutoOpenCreateHandled?.();
  }, [autoOpenCreate, autoOpenCreateFolderId, onAutoOpenCreateHandled, currentUser]);

  const loadProposals = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await listTeamProposals(userId, { userEmail });
      setProposals(rows);
    } catch (err) {
      setError(err.message || "Could not load proposals from cloud.");
      setProposals([]);
    } finally {
      setLoading(false);
    }
  }, [userId, userEmail]);

  useEffect(() => {
    loadProposals();
  }, [loadProposals, refreshKey]);

  useEffect(() => {
    setPinnedIds(readPinnedProposalIds(userId));
  }, [userId, refreshKey]);

  useEffect(() => {
    if (!rowMenu) return undefined;
    const close = () => setRowMenu(null);
    const onDoc = (e) => {
      if (!e.target.closest?.("[data-project-row-menu]")) close();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("scroll", close, true);
    };
  }, [rowMenu]);

  function handleTogglePin(proposal) {
    if (!proposal?.id) return;
    togglePinnedProposal(userId, proposal.id);
    setPinnedIds(readPinnedProposalIds(userId));
    if (typeof onPinsChanged === "function") onPinsChanged();
    setRowMenu(null);
  }

  function openRowMenu(e, proposal) {
    e.preventDefault();
    setRowMenu({ x: e.clientX, y: e.clientY, proposal });
  }

  const runHubSpotSync = useCallback(async () => {
    if (!userEmail) return;
    setHubspotSyncing(true);
    setHubspotNote("");
    try {
      const result = await syncHubSpot(userId, userEmail);
      if (!result.configured) {
        setHubspotNote(result.message || "HubSpot not configured on server.");
        return;
      }
      const parts = [];
      if (result.imported) parts.push(`${result.imported} imported`);
      if (result.updated) parts.push(`${result.updated} updated from HubSpot`);
      if (result.message) parts.push(result.message);
      if (!parts.length) parts.push("Already in sync");
      setHubspotNote(parts.join(" | "));
      await loadProposals();
    } catch (err) {
      setHubspotNote(err.message || "HubSpot sync failed");
    } finally {
      setHubspotSyncing(false);
    }
  }, [userId, userEmail, loadProposals]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await getHubSpotStatus();
        if (!cancelled) setHubspotConfigured(Boolean(status.configured));
      } catch {
        if (!cancelled) setHubspotConfigured(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    authApi
      .listTeam()
      .then((members) => {
        const names = members.map((m) => m.name || m.username).filter(Boolean);
        setTeamOwners([...new Set(names)]);
      })
      .catch(() => setTeamOwners([]));
  }, []);

  const t = getAppTheme(isDark);
  const { panel, border, title, subtle, headBg, inputBg, accent, accentText, errorBg, errorBorder, errorText } = t;
  const allowCreate = canCreateProjects(currentUser);
  const canEditRow = (p) => canEditOwnedRecord(currentUser, p?.userId, userId);

  const searchFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return proposals.filter((p) => {
      if (!q) return true;
      const hay = [
        crmProjectName(p),
        crmAddress(p),
        p.proposalOwner,
        crmStageLabel(p.stage),
        crmDealTypeDisplay(p),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [proposals, search]);

  const tagFiltered = useMemo(() => {
    let rows = searchFiltered;
    if (stageFilter) {
      rows = rows.filter((p) => normalizeCrmStage(p.stage) === stageFilter);
    }
    if (priorityFilter) {
      rows = rows.filter((p) => {
        const pr = p.priorityManual ? p.priority : resolvePriority(p, deriveAutoRevenue(p));
        return pr === priorityFilter;
      });
    }
    if (ownerFilter) {
      rows = rows.filter((p) => (p.proposalOwner || "").trim() === ownerFilter);
    }
    if (typeFilter) {
      rows = rows.filter((p) => {
        const kw = deriveSystemSizeKw(p.snapshot);
        return resolveDealType(p, kw) === typeFilter;
      });
    }
    if (likelihoodFilter) {
      rows = rows.filter((p) => likelihoodBucket(p.closeLikelihoodPct) === likelihoodFilter);
    }
    if (closeFilter === "this_quarter") {
      rows = rows.filter((p) => closeDateBucket(p) === "this_quarter");
    } else if (closeFilter === "no_date") {
      rows = rows.filter((p) => closeDateBucket(p) === "no_date");
    }
    if (revenueFilter) {
      rows = rows.filter((p) => revenueBucket(proposalRevenue(p)) === revenueFilter);
    }
    return rows;
  }, [searchFiltered, stageFilter, priorityFilter, ownerFilter, typeFilter, likelihoodFilter, closeFilter, revenueFilter]);

  const activeProjects = useMemo(() => {
    if (listFilter === "closed") return [];
    return tagFiltered.filter((p) => !isClosedProposal(p));
  }, [tagFiltered, listFilter]);

  const closedProjects = useMemo(() => {
    if (listFilter === "open") return [];
    return tagFiltered.filter((p) => isClosedProposal(p));
  }, [tagFiltered, listFilter]);

  const activeFolderLayout = useMemo(() => {
    void folderTick;
    return groupProposalsByFolder(userId, activeProjects);
  }, [userId, activeProjects, folderTick]);

  const scopeForFilterCounts = useMemo(() => {
    let rows = searchFiltered;
    if (listFilter === "open") rows = rows.filter((p) => !isClosedProposal(p));
    else if (listFilter === "closed") rows = rows.filter((p) => isClosedProposal(p));
    return rows;
  }, [searchFiltered, listFilter]);

  const filterCounts = useMemo(() => {
    const open = searchFiltered.filter((p) => !isClosedProposal(p)).length;
    const closed = searchFiltered.filter((p) => isClosedProposal(p)).length;
    const stages = {};
    const priorities = { high: 0, medium: 0, low: 0 };
    const owners = {};
    const types = {};
    const likelihoods = { "0-25": 0, "26-50": 0, "51-75": 0, "76-100": 0, unset: 0 };
    const closeDates = { this_quarter: 0, no_date: 0 };
    const revenues = { under_500k: 0, "500k_2m": 0, over_2m: 0 };
    for (const p of scopeForFilterCounts) {
      const stageKey = normalizeCrmStage(p.stage);
      if (stageKey) stages[stageKey] = (stages[stageKey] || 0) + 1;
      const pr = p.priorityManual ? p.priority : resolvePriority(p, deriveAutoRevenue(p));
      if (pr && priorities[pr] != null) priorities[pr]++;
      const owner = (p.proposalOwner || "").trim();
      if (owner) owners[owner] = (owners[owner] || 0) + 1;
      const kw = deriveSystemSizeKw(p.snapshot);
      const dt = resolveDealType(p, kw);
      if (dt) types[dt] = (types[dt] || 0) + 1;
      likelihoods[likelihoodBucket(p.closeLikelihoodPct)]++;
      const closeKey = closeDateBucket(p);
      if (closeKey === "this_quarter") closeDates.this_quarter++;
      if (closeKey === "no_date") closeDates.no_date++;
      revenues[revenueBucket(proposalRevenue(p))]++;
    }
    const showing =
      listFilter === "closed"
        ? closedProjects.length
        : listFilter === "all"
          ? activeProjects.length + closedProjects.length
          : activeProjects.length;
    return { open, closed, all: searchFiltered.length, stages, priorities, owners, types, likelihoods, closeDates, revenues, showing };
  }, [searchFiltered, scopeForFilterCounts, activeProjects.length, closedProjects.length, listFilter]);

  async function handleDelete(p) {
    if (!canEditRow(p)) return;
    const label = crmProjectName(p);
    if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) return;
    try {
      await deleteProposal(p.id, p.userId || userId);
      await loadProposals();
      if (typeof onPinsChanged === "function") onPinsChanged();
    } catch (err) {
      window.alert(err.message || "Delete failed");
    }
  }

  async function handleReopen(p) {
    if (!canEditRow(p)) return;
    setCrmBusyId(p.id);
    try {
      await saveProposal({
        userId: p.userId || userId,
        id: p.id,
        title: p.title,
        snapshot: p.snapshot,
        status: "in_progress",
        userEmail,
      });
      await saveProposalCrmFields({ userId: p.userId || userId, id: p.id, userEmail, stage: CRM_STAGE_CREATED });
      if (isProposalTableCollapsed(userId, "closed")) toggleProposalTableCollapsed(userId, "closed");
      setFolderTick((n) => n + 1);
      await loadProposals();
      if (typeof onProposalUpdated === "function") onProposalUpdated();
    } catch (err) {
      window.alert(err.message || "Could not reopen project");
    } finally {
      setCrmBusyId(null);
    }
  }

  async function handleCrmChange(p, patch) {
    if (!canEditRow(p)) return;
    setCrmBusyId(p.id);
    try {
      const nextStage = patch.stage !== undefined ? patch.stage || null : normalizeCrmStage(p.stage);
      const closing = patch.stage !== undefined && isClosedStage(nextStage);
      const reopening = patch.stage !== undefined && isClosedProposal(p) && !isClosedStage(nextStage);
      const needsStatusUpdate = closing || reopening;

      if (needsStatusUpdate) {
        await saveProposal({
          userId: p.userId || userId,
          id: p.id,
          title: p.title,
          snapshot: p.snapshot,
          status: closing ? PROPOSAL_STATUS_CLOSED : "in_progress",
          userEmail,
        });
        if (reopening && isProposalTableCollapsed(userId, "closed")) {
          toggleProposalTableCollapsed(userId, "closed");
          setFolderTick((n) => n + 1);
        }
      }

      await saveProposalCrmFields({
        userId: p.userId || userId,
        id: p.id,
        userEmail,
        ...patch,
      });
      if (closing && isProposalTableCollapsed(userId, "closed")) {
        toggleProposalTableCollapsed(userId, "closed");
        setFolderTick((n) => n + 1);
      }
      await loadProposals();
    } catch (err) {
      window.alert(err.message || "Could not update CRM fields");
    } finally {
      setCrmBusyId(null);
    }
  }
  async function handleDownload(p) {
    if (!crmCanDownloadPdf(p)) {
      window.alert("Open this project and complete the Proposal step before downloading a PDF.");
      return;
    }
    setDownloadingId(p.id);
    try {
      if (typeof onDownloadProposalPdf === "function") {
        await onDownloadProposalPdf(p);
      }
    } finally {
      setDownloadingId(null);
    }
  }

  const clearWorkspaceFilters = useCallback(() => {
    setListFilter("open");
    setStageFilter(null);
    setPriorityFilter(null);
    setOwnerFilter(null);
    setTypeFilter(null);
    setLikelihoodFilter(null);
    setCloseFilter(null);
    setRevenueFilter(null);
    setSearch("");
  }, []);

  const hasWorkspaceFilters = Boolean(
    search.trim() ||
      stageFilter ||
      priorityFilter ||
      ownerFilter ||
      typeFilter ||
      likelihoodFilter ||
      closeFilter ||
      revenueFilter ||
      listFilter !== "open"
  );

  async function handleTitleChange(p, rawName) {
    if (!canEditRow(p)) return;
    const name = String(rawName || "").trim();
    const current = editableProjectTitle(p);
    if (!name || name === current) return;
    setTitleBusyId(p.id);
    try {
      const snapshot = { ...(p.snapshot || {}), proposalTitle: name };
      await saveProposal({
        userId: p.userId || userId,
        id: p.id,
        title: deriveProposalTitle(snapshot),
        snapshot,
        status: p.status,
        userEmail,
      });
      await loadProposals();
      if (typeof onProposalUpdated === "function") onProposalUpdated();
    } catch (err) {
      window.alert(err.message || "Could not update project name");
    } finally {
      setTitleBusyId(null);
    }
  }

  async function handleNew() {
    if (!allowCreate) return;
    setCreateDialogOpen(true);
  }

  function handleNewFolder() {
    if (!allowCreate) return;
    const name = window.prompt("Folder name", "New folder");
    if (!name?.trim()) return;
    createProposalFolder(userId, name.trim());
    setFolderTick((n) => n + 1);
  }

  async function handleCreateProject(name) {
    if (!allowCreate) return;
    setCreating(true);
    try {
      if (typeof onNewProposal !== "function") return;
      const ok = await onNewProposal(name, createFolderId);
      if (ok) {
        setCreateDialogOpen(false);
        setCreateFolderId(null);
        await loadProposals();
      }
    } finally {
      setCreating(false);
    }
  }

  function openCreateForFolder(folderId) {
    if (!allowCreate) return;
    setCreateFolderId(folderId || null);
    setCreateDialogOpen(true);
  }

  function projectEmptyHandlers(folderId) {
    const act = () => openCreateForFolder(folderId);
    return {
      onEmptyAction: act,
      onEmptyContextMenu: (e) => {
        e.preventDefault();
        setTableMenu({
          x: e.clientX,
          y: e.clientY,
          items: buildEmptyProposalFolderMenuItems({
            folderId,
            onNewProjectInFolder: act,
          }),
        });
      },
      emptyActionLabel: "Click or right-click to add a project",
      emptyHint: "This folder is empty.",
    };
  }

  return (
    <>
      <PageHeader
        theme={t}
        title="Projects"
        subtitle={[userName, userEmail].filter(Boolean).join(" · ")}
      >
        {hubspotConfigured && allowCreate ? (
          <RibbonLabeledButton
            theme={t}
            icon="link"
            variant="surface"
            title={hubspotSyncing ? "Syncing HubSpot…" : "Import from HubSpot"}
            onClick={runHubSpotSync}
            disabled={hubspotSyncing}
          >
            HubSpot
          </RibbonLabeledButton>
        ) : null}
        {allowCreate ? (
          <RibbonLabeledButton
            theme={t}
            icon="folder"
            variant="surface"
            title="Create a folder for projects"
            onClick={handleNewFolder}
          >
            Create projects folder
          </RibbonLabeledButton>
        ) : null}
        {allowCreate ? (
          <RibbonLabeledButton
            theme={t}
            icon="plus"
            variant="primary"
            title="Create a new solar proposal"
            onClick={handleNew}
            disabled={creating}
          >
            {creating ? "Creating…" : "New project"}
          </RibbonLabeledButton>
        ) : null}
      </PageHeader>

      <div style={{ ...pageShellStyle(), flex: 1, overflow: "auto" }}>
        {topSlot || null}
        {hubspotNote ? (
          <div
            style={{
              background: t.successBg,
              border: `1px solid ${t.successBorder}`,
              borderRadius: 10,
              padding: "10px 14px",
              marginBottom: 14,
              fontSize: 12,
              color: t.successText,
            }}
          >
            {hubspotNote}
          </div>
        ) : null}

        {!loading && proposals.length === 0 ? (
          <PageGuide theme={t} title="Get started">
            Create your first project with a name, then open it from the table when you are ready to build the proposal.
          </PageGuide>
        ) : null}

        {!loading && proposals.length > 0 ? (
          <WorkspaceCard
            theme={t}
            isDark={isDark}
            title={title}
            subtle={subtle}
            search={search}
            onSearchChange={setSearch}
            listFilter={listFilter}
            stageFilter={stageFilter}
            priorityFilter={priorityFilter}
            ownerFilter={ownerFilter}
            typeFilter={typeFilter}
            likelihoodFilter={likelihoodFilter}
            closeFilter={closeFilter}
            revenueFilter={revenueFilter}
            filtersExpanded={filtersExpanded}
            counts={filterCounts}
            hasActiveFilters={hasWorkspaceFilters}
            onListFilter={setListFilter}
            onStageFilter={(val) => setStageFilter((prev) => (prev === val ? null : val))}
            onPriorityFilter={(val) => setPriorityFilter((prev) => (prev === val ? null : val))}
            onOwnerFilter={(val) => setOwnerFilter((prev) => (prev === val ? null : val))}
            onTypeFilter={(val) => setTypeFilter((prev) => (prev === val ? null : val))}
            onLikelihoodFilter={(val) => setLikelihoodFilter((prev) => (prev === val ? null : val))}
            onCloseFilter={(val) => setCloseFilter((prev) => (prev === val ? null : val))}
            onRevenueFilter={(val) => setRevenueFilter((prev) => (prev === val ? null : val))}
            onToggleExpanded={() => setFiltersExpanded((v) => !v)}
            onClearFilters={clearWorkspaceFilters}
          />
        ) : null}

        {error ? (
          <div
            style={{
              background: errorBg,
              border: `1px solid ${errorBorder}`,
              borderRadius: 10,
              padding: 14,
              marginBottom: 14,
              color: errorText,
              fontSize: 13,
            }}
          >
            {error}
            <button
              type="button"
              onClick={loadProposals}
              style={{ ...actionBtn(isDark, "primary"), marginTop: 10, display: "block" }}
            >
              Retry
            </button>
          </div>
        ) : null}

        {loading ? (
          <div style={{ color: subtle, fontSize: 14, padding: 24, textAlign: "center" }}>Loading projects...</div>
        ) : (
          <>
            {activeProjects.length === 0 && proposals.length === 0 ? (
              <div
                style={{
                  background: panel,
                  border: `1px solid ${border}`,
                  borderRadius: 12,
                  padding: "36px 28px",
                  textAlign: "center",
                  color: subtle,
                  fontSize: 14,
                  lineHeight: 1.6,
                  marginBottom: 14,
                }}
              >
                <div style={{ fontSize: 16, fontWeight: 700, color: title, marginBottom: 8 }}>No projects yet</div>
                <p style={{ margin: "0 0 16px" }}>Start with a new project — you'll walk through bill analysis, system design, and the proposal PDF.</p>
                <RibbonLabeledButton theme={t} icon="plus" variant="primary" onClick={handleNew} disabled={creating}>
                  {creating ? "Creating…" : "New project"}
                </RibbonLabeledButton>
              </div>
            ) : activeProjects.length === 0 && closedProjects.length === 0 ? (
              <div
                style={{
                  background: panel,
                  border: `1px solid ${border}`,
                  borderRadius: 10,
                  padding: 20,
                  textAlign: "center",
                  color: subtle,
                  fontSize: 14,
                  marginBottom: 14,
                }}
              >
                No projects match your search or filters.
              </div>
            ) : activeProjects.length > 0 || activeFolderLayout.folders.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {activeFolderLayout.folders.length > 0
                  ? activeFolderLayout.folders.map((folder) => {
                      const rows = activeFolderLayout.groups.get(folder.id) || [];
                      const key = folderTableKey(folder.id);
                      return (
                        <CollapsibleTableSection
                          key={folder.id}
                          title={folder.name}
                          count={rows.length}
                          collapsed={isProposalTableCollapsed(userId, key)}
                          onToggle={() => {
                            toggleProposalTableCollapsed(userId, key);
                            setFolderTick((n) => n + 1);
                          }}
                          isDark={isDark}
                          border={border}
                          headBg={headBg}
                          titleColor={title}
                          subtle={subtle}
                        >
                          <ProjectsTable
                            rows={rows}
                            stageOptions={ACTIVE_STAGE_OPTIONS}
                            isDark={isDark}
                            panel={panel}
                            border={border}
                            title={title}
                            subtle={subtle}
                            headBg={headBg}
                            crmBusyId={crmBusyId}
                            downloadingId={downloadingId}
                            teamOwners={teamOwners}
                            onOpenProposal={onOpenProposal}
                            onCrmChange={handleCrmChange}
                            onDownload={handleDownload}
                            onDelete={handleDelete}
                            onTitleChange={handleTitleChange}
                            canEditRow={canEditRow}
                            titleBusyId={titleBusyId}
                            pinnedIds={pinnedIds}
                            onRowContextMenu={openRowMenu}
                            embedded
                            roundedBottom
                            {...projectEmptyHandlers(folder.id)}
                          />
                        </CollapsibleTableSection>
                      );
                    })
                  : null}
                {activeFolderLayout.folders.length > 0 ? (
                  <CollapsibleTableSection
                    title="Uncategorized"
                    count={activeFolderLayout.uncategorized.length}
                    collapsed={isProposalTableCollapsed(userId, folderTableKey(null))}
                    onToggle={() => {
                      toggleProposalTableCollapsed(userId, folderTableKey(null));
                      setFolderTick((n) => n + 1);
                    }}
                    isDark={isDark}
                    border={border}
                    headBg={headBg}
                    titleColor={title}
                    subtle={subtle}
                  >
                    <ProjectsTable
                      rows={activeFolderLayout.uncategorized}
                      stageOptions={ACTIVE_STAGE_OPTIONS}
                      isDark={isDark}
                      panel={panel}
                      border={border}
                      title={title}
                      subtle={subtle}
                      headBg={headBg}
                      crmBusyId={crmBusyId}
                      downloadingId={downloadingId}
                      teamOwners={teamOwners}
                      onOpenProposal={onOpenProposal}
                      onCrmChange={handleCrmChange}
                      onDownload={handleDownload}
                      onDelete={handleDelete}
                      onTitleChange={handleTitleChange}
                      canEditRow={canEditRow}
                      titleBusyId={titleBusyId}
                      pinnedIds={pinnedIds}
                      onRowContextMenu={openRowMenu}
                      embedded
                      roundedBottom
                      {...projectEmptyHandlers(null)}
                    />
                  </CollapsibleTableSection>
                ) : (
                  <ProjectsTable
                    rows={activeProjects}
                    stageOptions={ACTIVE_STAGE_OPTIONS}
                    isDark={isDark}
                    panel={panel}
                    border={border}
                    title={title}
                    subtle={subtle}
                    headBg={headBg}
                    crmBusyId={crmBusyId}
                    downloadingId={downloadingId}
                    teamOwners={teamOwners}
                    onOpenProposal={onOpenProposal}
                    onCrmChange={handleCrmChange}
                    onDownload={handleDownload}
                    onDelete={handleDelete}
                    onTitleChange={handleTitleChange}
                    canEditRow={canEditRow}
                    titleBusyId={titleBusyId}
                    pinnedIds={pinnedIds}
                    onRowContextMenu={openRowMenu}
                  />
                )}
              </div>
            ) : null}

            {closedProjects.length > 0 ? (
              <div style={{ marginTop: activeProjects.length > 0 || activeFolderLayout.folders.length > 0 ? 14 : 0 }}>
                {listFilter === "open" ? (
                  <CollapsibleTableSection
                    title="Closed projects"
                    count={closedProjects.length}
                    collapsed={isProposalTableCollapsed(userId, "closed")}
                    onToggle={() => {
                      toggleProposalTableCollapsed(userId, "closed");
                      setFolderTick((n) => n + 1);
                    }}
                    isDark={isDark}
                    border={border}
                    headBg={headBg}
                    titleColor={title}
                    subtle={subtle}
                  >
                    <ProjectsTable
                      rows={closedProjects}
                      stageOptions={CRM_STAGE_OPTIONS_CLOSED}
                      isDark={isDark}
                      panel={panel}
                      border={border}
                      title={title}
                      subtle={subtle}
                      headBg={headBg}
                      crmBusyId={crmBusyId}
                      downloadingId={downloadingId}
                      teamOwners={teamOwners}
                      onOpenProposal={onOpenProposal}
                      onCrmChange={handleCrmChange}
                      onDownload={handleDownload}
                      onDelete={handleDelete}
                      onReopen={handleReopen}
                      onTitleChange={handleTitleChange}
                      canEditRow={canEditRow}
                      titleBusyId={titleBusyId}
                      isClosedSection
                      pinnedIds={pinnedIds}
                      onRowContextMenu={openRowMenu}
                      embedded
                      roundedBottom
                    />
                  </CollapsibleTableSection>
                ) : (
                  <>
                    <div
                      style={{
                        padding: "10px 16px",
                        borderRadius: "10px 10px 0 0",
                        border: `1px solid ${border}`,
                        borderBottom: "none",
                        background: headBg,
                        color: title,
                        fontWeight: 600,
                        fontSize: 13,
                        fontFamily: fontSans,
                      }}
                    >
                      Closed projects ({closedProjects.length})
                    </div>
                    <ProjectsTable
                      rows={closedProjects}
                      stageOptions={CRM_STAGE_OPTIONS_CLOSED}
                      isDark={isDark}
                      panel={panel}
                      border={border}
                      title={title}
                      subtle={subtle}
                      headBg={headBg}
                      crmBusyId={crmBusyId}
                      downloadingId={downloadingId}
                      teamOwners={teamOwners}
                      onOpenProposal={onOpenProposal}
                      onCrmChange={handleCrmChange}
                      onDownload={handleDownload}
                      onDelete={handleDelete}
                      onReopen={handleReopen}
                      onTitleChange={handleTitleChange}
                      canEditRow={canEditRow}
                      titleBusyId={titleBusyId}
                      isClosedSection
                      roundedBottom
                      pinnedIds={pinnedIds}
                      onRowContextMenu={openRowMenu}
                      embedded
                    />
                  </>
                )}
              </div>
            ) : null}
          </>
        )}
      </div>

      {rowMenu ? (
        <ProjectRowContextMenu
          isDark={isDark}
          x={rowMenu.x}
          y={rowMenu.y}
          pinned={isProposalPinned(userId, rowMenu.proposal?.id)}
          folders={listProposalFolders(userId)}
          onPin={() => handleTogglePin(rowMenu.proposal)}
          onOpen={() => {
            setRowMenu(null);
            onOpenProposal(rowMenu.proposal);
          }}
          onMoveToFolder={(folderId) => {
            assignProposalToFolder(userId, rowMenu.proposal?.id, folderId);
            setFolderTick((n) => n + 1);
            setRowMenu(null);
          }}
        />
      ) : null}

      {tableMenu ? (
        <SidebarContextMenu
          isDark={isDark}
          x={tableMenu.x}
          y={tableMenu.y}
          items={tableMenu.items}
          onClose={() => setTableMenu(null)}
        />
      ) : null}

      {createDialogOpen ? (
        <NewProjectNameDialog
          isDark={isDark}
          busy={creating}
          onCancel={() => {
            if (!creating) {
              setCreateDialogOpen(false);
              setCreateFolderId(null);
            }
          }}
          onCreate={handleCreateProject}
        />
      ) : null}
    </>
  );
}

function ProjectRowContextMenu({ isDark, x, y, pinned, onPin, onOpen, folders = [], onMoveToFolder }) {
  const t = getAppTheme(isDark);
  const moveItems =
    folders.length > 0
      ? [
          { separator: true },
          ...folders.map((f) => ({
            label: `Move to ${f.name}`,
            action: () => onMoveToFolder?.(f.id),
          })),
          {
            label: "Move to Uncategorized",
            action: () => onMoveToFolder?.(null),
          },
        ]
      : [];
  return createPortal(
    <div
      data-project-row-menu
      style={{
        position: "fixed",
        top: y,
        left: x,
        zIndex: 10000,
        minWidth: 160,
        padding: 4,
        borderRadius: 8,
        border: `1px solid ${t.border}`,
        background: t.panel,
        boxShadow: isDark ? "0 10px 28px rgba(0,0,0,0.45)" : "0 10px 28px rgba(0,0,0,0.14)",
        fontFamily: fontSans,
      }}
    >
      <button type="button" onClick={onOpen} style={rowMenuBtn(t)}>
        Open
      </button>
      <button type="button" onClick={onPin} style={rowMenuBtn(t)}>
        {pinned ? "Unpin from sidebar" : "Pin to sidebar"}
      </button>
      {moveItems.map((item, i) =>
        item.separator ? (
          <div key={`sep-${i}`} style={{ height: 1, background: t.border, margin: "4px 0" }} />
        ) : (
          <button key={item.label} type="button" onClick={item.action} style={rowMenuBtn(t)}>
            {item.label}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}

function rowMenuBtn(t) {
  return {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "8px 10px",
    border: "none",
    borderRadius: 6,
    background: "transparent",
    color: t.title,
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: fontSans,
  };
}

function NewProjectNameDialog({ isDark, busy, onCancel, onCreate }) {
  const [name, setName] = useState("");
  const t = getAppTheme(isDark);

  function submit() {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    onCreate(trimmed);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-project-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 3000,
        display: "grid",
        placeItems: "center",
        padding: 20,
        background: "rgba(0, 0, 0, 0.45)",
      }}
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: t.panel,
          border: `1px solid ${t.border}`,
          borderRadius: 12,
          padding: 20,
          fontFamily: fontSans,
          boxShadow: "0 18px 40px rgba(0,0,0,0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="new-project-title" style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700, color: t.title }}>
          New project
        </h2>
        <p style={{ margin: "0 0 14px", fontSize: 13, color: t.subtle, lineHeight: 1.45 }}>
          Enter a project name. It will appear in the table and pre-fill the proposal title when you open it.
        </p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. 2265 Monitor St"
          disabled={busy}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape" && !busy) onCancel();
          }}
          style={{
            width: "100%",
            boxSizing: "border-box",
            border: `1px solid ${t.border}`,
            borderRadius: 8,
            padding: "10px 12px",
            marginBottom: 14,
            outline: "none",
            background: t.inputBg,
            color: t.title,
            fontFamily: fontSans,
            fontSize: 14,
          }}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{
              border: `1px solid ${t.border}`,
              borderRadius: 8,
              padding: "9px 14px",
              background: t.inputBg,
              color: t.title,
              cursor: busy ? "default" : "pointer",
              fontFamily: fontSans,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !name.trim()}
            style={{
              border: "none",
              borderRadius: 8,
              padding: "9px 14px",
              background: t.ctaBg,
              color: t.ctaText,
              cursor: busy || !name.trim() ? "default" : "pointer",
              fontFamily: fontSans,
              fontSize: 13,
              fontWeight: 600,
              opacity: busy || !name.trim() ? 0.6 : 1,
            }}
          >
            {busy ? "Creating…" : "Create project"}
          </button>
        </div>
      </div>
    </div>
  );
}


const TABLE_HEADERS = [
  { key: "project", label: "Project", width: "17%" },
  { key: "created", label: "Created", width: "8%" },
  { key: "stage", label: "Stage", width: "10%" },
  { key: "owner", label: "Owner", width: "7%" },
  { key: "size", label: "Size", width: "6%" },
  { key: "close", label: "Close", width: "8%" },
  { key: "revenue", label: "Revenue", width: "7%" },
  { key: "likelihood", label: "Likelihood", width: "7%" },
  { key: "priority", label: "Priority", width: "7%" },
  { key: "type", label: "Type (auto)", width: "9%" },
  { key: "financing", label: "Financing", width: "8%" },
  { key: "actions", label: "", width: "10%" },
];

const STAGE_SHORT_LABELS = {
  proposal_created: "Created",
  drafting_proposal: "Drafting",
  proposal_approved: "Approved",
  proposal_revision: "Revision",
  proposal_sent: "Sent",
  proposal_negotiation: "Negotiation",
  needs_follow_up: "Follow-up",
  signed: "Signed",
  lead_lost: "Lost",
};

const LIST_FILTER_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
];

const PRIORITY_FILTER_OPTIONS = [
  { value: CRM_PRIORITY_HIGH, label: "High" },
  { value: CRM_PRIORITY_MEDIUM, label: "Medium" },
  { value: CRM_PRIORITY_LOW, label: "Low" },
];

const LIKELIHOOD_FILTER_OPTIONS = [
  { value: "76-100", label: "76–100%" },
  { value: "51-75", label: "51–75%" },
  { value: "26-50", label: "26–50%" },
  { value: "0-25", label: "0–25%" },
  { value: "unset", label: "Unset" },
];

const CLOSE_FILTER_OPTIONS = [
  { value: "this_quarter", label: "This quarter" },
  { value: "no_date", label: "No close date" },
];

const REVENUE_FILTER_OPTIONS = [
  { value: "under_500k", label: "< $500K" },
  { value: "500k_2m", label: "$500K–$2M" },
  { value: "over_2m", label: "$2M+" },
];

function proposalRevenue(p) {
  return deriveEstimatedRevenue(p) || deriveAutoRevenue(p) || 0;
}

function likelihoodBucket(pct) {
  if (!Number.isFinite(pct)) return "unset";
  if (pct <= 25) return "0-25";
  if (pct <= 50) return "26-50";
  if (pct <= 75) return "51-75";
  return "76-100";
}

function closeDateBucket(p) {
  const raw = crmResolveCloseDate(p);
  if (!raw) return "no_date";
  const q = getQuarterlyPeriod();
  const t = new Date(raw).getTime();
  if (t >= new Date(q.from).getTime() && t <= new Date(q.to).getTime()) return "this_quarter";
  return "other";
}

function revenueBucket(rev) {
  if (rev < 500_000) return "under_500k";
  if (rev < 2_000_000) return "500k_2m";
  return "over_2m";
}

function WorkspaceCard({
  theme,
  isDark,
  title,
  subtle,
  search,
  onSearchChange,
  listFilter,
  stageFilter,
  priorityFilter,
  ownerFilter,
  typeFilter,
  likelihoodFilter,
  closeFilter,
  revenueFilter,
  filtersExpanded,
  counts,
  hasActiveFilters,
  onListFilter,
  onStageFilter,
  onPriorityFilter,
  onOwnerFilter,
  onTypeFilter,
  onLikelihoodFilter,
  onCloseFilter,
  onRevenueFilter,
  onToggleExpanded,
  onClearFilters,
}) {
  const { panel, border } = theme;

  const activePills = useMemo(() => {
    const pills = [];
    if (listFilter !== "open") {
      const opt = LIST_FILTER_OPTIONS.find((o) => o.value === listFilter);
      pills.push({ key: "list", label: opt?.label || listFilter, onClear: () => onListFilter("open") });
    }
    if (stageFilter) {
      pills.push({
        key: "stage",
        label: STAGE_SHORT_LABELS[stageFilter] || crmStageLabel(stageFilter),
        onClear: () => onStageFilter(stageFilter),
      });
    }
    if (priorityFilter) {
      const opt = PRIORITY_FILTER_OPTIONS.find((o) => o.value === priorityFilter);
      pills.push({ key: "priority", label: opt?.label || priorityFilter, onClear: () => onPriorityFilter(priorityFilter) });
    }
    if (ownerFilter) {
      pills.push({ key: "owner", label: ownerFilter, onClear: () => onOwnerFilter(ownerFilter) });
    }
    if (typeFilter) {
      pills.push({
        key: "type",
        label: crmDealTypeShortLabel(typeFilter),
        onClear: () => onTypeFilter(typeFilter),
      });
    }
    if (likelihoodFilter) {
      const opt = LIKELIHOOD_FILTER_OPTIONS.find((o) => o.value === likelihoodFilter);
      pills.push({ key: "likelihood", label: opt?.label || likelihoodFilter, onClear: () => onLikelihoodFilter(likelihoodFilter) });
    }
    if (closeFilter) {
      const opt = CLOSE_FILTER_OPTIONS.find((o) => o.value === closeFilter);
      pills.push({ key: "close", label: opt?.label || closeFilter, onClear: () => onCloseFilter(closeFilter) });
    }
    if (revenueFilter) {
      const opt = REVENUE_FILTER_OPTIONS.find((o) => o.value === revenueFilter);
      pills.push({ key: "revenue", label: opt?.label || revenueFilter, onClear: () => onRevenueFilter(revenueFilter) });
    }
    if (search.trim()) {
      pills.push({ key: "search", label: `Search: ${search.trim()}`, onClear: () => onSearchChange({ target: { value: "" } }) });
    }
    return pills;
  }, [
    listFilter,
    stageFilter,
    priorityFilter,
    ownerFilter,
    typeFilter,
    likelihoodFilter,
    closeFilter,
    revenueFilter,
    search,
    onListFilter,
    onStageFilter,
    onPriorityFilter,
    onOwnerFilter,
    onTypeFilter,
    onLikelihoodFilter,
    onCloseFilter,
    onRevenueFilter,
    onSearchChange,
  ]);

  const extraFilterCount = activePills.filter((p) => p.key !== "search").length;

  return (
    <section
      style={{
        marginBottom: 16,
        padding: "12px 16px",
        background: panel,
        border: `1px solid ${border}`,
        borderRadius: 12,
        fontFamily: fontSans,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: filtersExpanded || (!filtersExpanded && activePills.length > 0) ? 12 : 0,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start", minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: title, lineHeight: 1.3 }}>Your workspace</h2>
          <button
            type="button"
            onClick={onToggleExpanded}
            style={filterMoreBtn(isDark, filtersExpanded || extraFilterCount > 0, true)}
            aria-expanded={filtersExpanded}
          >
            Filters {filtersExpanded ? "▴" : "▾"}
            {extraFilterCount > 0 && !filtersExpanded ? ` · ${extraFilterCount}` : ""}
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "flex-end", flex: "0 1 360px" }}>
          <SearchField value={search} onChange={onSearchChange} placeholder="Search projects…" theme={theme} />
          {hasActiveFilters ? (
            <button type="button" onClick={onClearFilters} style={filterClearBtn(isDark)}>
              Reset
            </button>
          ) : null}
        </div>
      </div>

      {!filtersExpanded && activePills.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {activePills.map((pill) => (
            <ActiveFilterPill key={pill.key} label={pill.label} isDark={isDark} onClear={pill.onClear} />
          ))}
        </div>
      ) : null}

      {filtersExpanded ? (
        <WorkspaceFilterPanel
          isDark={isDark}
          border={border}
          counts={counts}
          listFilter={listFilter}
          stageFilter={stageFilter}
          priorityFilter={priorityFilter}
          ownerFilter={ownerFilter}
          typeFilter={typeFilter}
          likelihoodFilter={likelihoodFilter}
          closeFilter={closeFilter}
          revenueFilter={revenueFilter}
          onListFilter={onListFilter}
          onStageFilter={onStageFilter}
          onPriorityFilter={onPriorityFilter}
          onOwnerFilter={onOwnerFilter}
          onTypeFilter={onTypeFilter}
          onLikelihoodFilter={onLikelihoodFilter}
          onCloseFilter={onCloseFilter}
          onRevenueFilter={onRevenueFilter}
        />
      ) : null}
    </section>
  );
}

function ActiveFilterPill({ label, isDark, onClear }) {
  const t = getAppTheme(isDark);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 8px 3px 10px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 500,
        color: t.title,
        background: t.headBg,
        border: `1px solid ${t.border}`,
      }}
    >
      {label}
      <button
        type="button"
        onClick={onClear}
        aria-label={`Remove ${label} filter`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 16,
          height: 16,
          padding: 0,
          margin: 0,
          border: "none",
          borderRadius: 999,
          background: "transparent",
          color: t.subtle,
          fontSize: 14,
          lineHeight: 1,
          cursor: "pointer",
          fontFamily: fontSans,
        }}
      >
        ×
      </button>
    </span>
  );
}

function WorkspaceFilterPanel({
  isDark,
  border,
  counts,
  listFilter,
  stageFilter,
  priorityFilter,
  ownerFilter,
  typeFilter,
  likelihoodFilter,
  closeFilter,
  revenueFilter,
  onListFilter,
  onStageFilter,
  onPriorityFilter,
  onOwnerFilter,
  onTypeFilter,
  onLikelihoodFilter,
  onCloseFilter,
  onRevenueFilter,
}) {
  const listTags = LIST_FILTER_OPTIONS.map((opt) => ({
    ...opt,
    count: counts[opt.value] || 0,
  }));

  const stageTags = CRM_STAGE_OPTIONS_OPEN.filter((o) => o.value).map((o) => ({
    value: o.value,
    label: STAGE_SHORT_LABELS[o.value] || o.label,
    count: counts.stages[o.value] || 0,
    color: crmStageColor(o.value).bg,
  }));

  const priorityTags = PRIORITY_FILTER_OPTIONS.map((opt) => ({
    ...opt,
    count: counts.priorities[opt.value] || 0,
    color: CRM_PRIORITY_OPTIONS.find((p) => p.value === opt.value)?.color,
  }));

  const ownerTags = Object.entries(counts.owners || {})
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, count]) => ({ value, label: value, count }));

  const typeTags = CRM_DEAL_TYPE_FILTER_OPTIONS.map((opt) => ({
    value: opt.value,
    label: opt.label,
    count: counts.types?.[opt.value] || 0,
  }));

  const likelihoodTags = LIKELIHOOD_FILTER_OPTIONS.map((opt) => ({
    ...opt,
    count: counts.likelihoods?.[opt.value] || 0,
  }));

  const closeTags = CLOSE_FILTER_OPTIONS.map((opt) => ({
    ...opt,
    count: counts.closeDates?.[opt.value] || 0,
  }));

  const revenueTags = REVENUE_FILTER_OPTIONS.map((opt) => ({
    ...opt,
    count: counts.revenues?.[opt.value] || 0,
  }));

  const visible = (tags, activeValue) => tags.filter((tag) => tag.count > 0 || activeValue === tag.value);

  return (
    <div
      style={{
        marginTop: 12,
        paddingTop: 12,
        borderTop: `1px solid ${border}`,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <FilterGroup label="Status" isDark={isDark}>
        {listTags.map((tag) => (
          <FilterChip
            key={tag.value}
            label={tag.label}
            active={listFilter === tag.value}
            isDark={isDark}
            onClick={() => onListFilter(tag.value)}
          />
        ))}
      </FilterGroup>

      <FilterGroup label="Stage" isDark={isDark}>
        {visible(stageTags, stageFilter).map((tag) => (
          <FilterChip
            key={tag.value}
            label={tag.label}
            active={stageFilter === tag.value}
            isDark={isDark}
            onClick={() => onStageFilter(tag.value)}
          />
        ))}
      </FilterGroup>

      <FilterGroup label="Priority" isDark={isDark}>
        {visible(priorityTags, priorityFilter).map((tag) => (
          <FilterChip
            key={tag.value}
            label={tag.label}
            active={priorityFilter === tag.value}
            isDark={isDark}
            onClick={() => onPriorityFilter(tag.value)}
          />
        ))}
      </FilterGroup>

      {ownerTags.some((tag) => tag.count > 0 || ownerFilter === tag.value) ? (
        <FilterGroup label="Owner" isDark={isDark}>
          {visible(ownerTags, ownerFilter).map((tag) => (
            <FilterChip
              key={tag.value}
              label={tag.label}
              active={ownerFilter === tag.value}
              isDark={isDark}
              onClick={() => onOwnerFilter(tag.value)}
            />
          ))}
        </FilterGroup>
      ) : null}

      <FilterGroup label="Type" isDark={isDark}>
        {typeTags.map((tag) => (
          <FilterChip
            key={tag.value}
            label={tag.count > 0 ? `${tag.label} (${tag.count})` : tag.label}
            active={typeFilter === tag.value}
            isDark={isDark}
            onClick={() => onTypeFilter(tag.value)}
          />
        ))}
      </FilterGroup>

      <FilterGroup label="Likelihood" isDark={isDark}>
        {visible(likelihoodTags, likelihoodFilter).map((tag) => (
          <FilterChip
            key={tag.value}
            label={tag.label}
            active={likelihoodFilter === tag.value}
            isDark={isDark}
            onClick={() => onLikelihoodFilter(tag.value)}
          />
        ))}
      </FilterGroup>

      <FilterGroup label="Close" isDark={isDark}>
        {visible(closeTags, closeFilter).map((tag) => (
          <FilterChip
            key={tag.value}
            label={tag.label}
            active={closeFilter === tag.value}
            isDark={isDark}
            onClick={() => onCloseFilter(tag.value)}
          />
        ))}
      </FilterGroup>

      <FilterGroup label="Revenue" isDark={isDark}>
        {visible(revenueTags, revenueFilter).map((tag) => (
          <FilterChip
            key={tag.value}
            label={tag.label}
            active={revenueFilter === tag.value}
            isDark={isDark}
            onClick={() => onRevenueFilter(tag.value)}
          />
        ))}
      </FilterGroup>
    </div>
  );
}

function FilterGroup({ label, isDark, children }) {
  const t = getAppTheme(isDark);
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <span
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: t.subtle,
          width: 68,
          flexShrink: 0,
          paddingTop: 5,
          fontFamily: fontSans,
        }}
      >
        {label}
      </span>
      <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 6, minWidth: 0 }}>{children}</div>
    </div>
  );
}

function FilterChip({ label, active, isDark, onClick }) {
  const t = getAppTheme(isDark);
  const highlight = isDark
    ? { border: t.amber, bg: "rgba(243,182,100,0.18)", color: t.amber }
    : { border: t.amber, bg: "#FFF3DE", color: t.navy };
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "5px 10px",
        borderRadius: 999,
        border: `1px solid ${active ? highlight.border : t.border}`,
        background: active ? highlight.bg : t.inputBg,
        color: active ? highlight.color : t.subtle,
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: fontSans,
        whiteSpace: "nowrap",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      {active ? (
        <span aria-hidden style={{ fontSize: 10, lineHeight: 1, fontWeight: 700 }}>
          ✓
        </span>
      ) : null}
      {label}
    </button>
  );
}

function filterMoreBtn(isDark, active, aligned = false) {
  const t = getAppTheme(isDark);
  return {
    padding: 0,
    margin: 0,
    border: "none",
    background: "transparent",
    color: active ? t.title : t.subtle,
    fontSize: aligned ? 13 : 12,
    fontWeight: 500,
    lineHeight: aligned ? 1.4 : 1.2,
    cursor: "pointer",
    fontFamily: fontSans,
    whiteSpace: "nowrap",
    opacity: active ? 0.95 : 0.72,
  };
}

function filterClearBtn(isDark) {
  const t = getAppTheme(isDark);
  return {
    padding: "6px 10px",
    borderRadius: 6,
    border: "none",
    background: "transparent",
    color: t.subtle,
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: fontSans,
    opacity: 0.85,
  };
}

const TABLE_LIKELIHOOD_OPTIONS = CRM_LIKELIHOOD_OPTIONS.map((o) => ({
  ...o,
  label: o.value === "" ? "—" : `${o.value}%`,
}));

const CELL_PAD = "6px 8px";

function ProjectsTable({
  rows,
  stageOptions,
  isDark,
  panel,
  border,
  title,
  subtle,
  headBg,
  crmBusyId,
  downloadingId,
  teamOwners,
  onOpenProposal,
  onCrmChange,
  onDownload,
  onDelete,
  onReopen,
  onTitleChange,
  canEditRow = () => true,
  titleBusyId,
  isClosedSection = false,
  roundedBottom = false,
  pinnedIds = [],
  onRowContextMenu,
  embedded = false,
  onEmptyAction,
  onEmptyContextMenu,
  emptyHint,
  emptyActionLabel,
}) {
  if (!rows.length) {
    return (
      <div
        style={{
          background: panel,
          border: embedded ? "none" : `1px solid ${border}`,
          borderRadius: embedded ? 0 : roundedBottom ? "0 0 10px 10px" : 10,
          overflow: "hidden",
        }}
      >
        <EmptyTablePlaceholder
          isDark={isDark}
          subtle={subtle}
          hint={emptyHint || "No projects in this folder yet."}
          actionLabel={emptyActionLabel}
          onAction={onEmptyAction}
          onContextMenu={onEmptyContextMenu}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        background: panel,
        border: embedded ? "none" : `1px solid ${border}`,
        borderRadius: embedded ? 0 : roundedBottom ? "0 0 10px 10px" : 10,
        overflow: "hidden",
      }}
    >
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed", minWidth: 980 }}>
          <thead>
            <tr style={{ background: headBg, borderBottom: `1px solid ${border}` }}>
              {TABLE_HEADERS.map((h) => (
                <th
                  key={h.key}
                  style={{
                    textAlign: h.key === "actions" ? "right" : "left",
                    padding: CELL_PAD,
                    fontWeight: 700,
                    color: title,
                    whiteSpace: "nowrap",
                    width: h.width,
                    fontSize: 11,
                    letterSpacing: h.key === "actions" ? undefined : "0.01em",
                  }}
                >
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const locked = !canEditRow(p);
              const pdfReady = crmCanDownloadPdf(p);
              const stageKey = normalizeCrmStage(p.stage);
              const likelihoodColor = crmLikelihoodColor(p.closeLikelihoodPct);
              const autoRev = deriveAutoRevenue(p);
              const displayPriority = p.priorityManual ? p.priority || "" : resolvePriority(p, autoRev) || "";
              const priorityOpt = CRM_PRIORITY_OPTIONS.find((o) => o.value === displayPriority);
              const address = crmAddress(p);
              const dealTypeHint = crmDealTypeDisplay(p);
              const dealTypeAuto = crmDealTypeShortDisplay(p);
              const dealTypeStored = storedProjectCategory(p);
              const systemSizeHint = crmSystemSizeDisplay(p);
              const dealTypeTitle = dealTypeStored
                ? dealTypeHint
                : dealTypeHint !== "—"
                  ? `Auto from size → ${dealTypeHint}`
                  : "Auto from system size";
              return (
                <tr
                  key={p.id}
                  style={{ borderBottom: `1px solid ${border}` }}
                  onContextMenu={onRowContextMenu ? (e) => onRowContextMenu(e, p) : undefined}
                >
                  <td style={{ padding: CELL_PAD, verticalAlign: "middle" }}>
                    <input
                      type="text"
                      key={`${p.id}-${editableProjectTitle(p)}`}
                      defaultValue={editableProjectTitle(p)}
                      placeholder="Project name"
                      disabled={locked || titleBusyId === p.id || crmBusyId === p.id}
                      title={[address !== "—" ? address : null, dealTypeHint !== "—" ? `Deal type: ${dealTypeHint}` : null]
                        .filter(Boolean)
                        .join(" · ") || "Project name — also used as proposal title"}
                      onBlur={(e) => onTitleChange(p, e.target.value)}
                      style={{
                        ...crmInputStyle(isDark),
                        width: "100%",
                        minWidth: 0,
                        fontWeight: 700,
                      }}
                    />
                  </td>
                  <td
                    style={{
                      padding: CELL_PAD,
                      verticalAlign: "middle",
                      color: subtle,
                      whiteSpace: "nowrap",
                      fontSize: 11,
                    }}
                    title={p.createdAt ? crmFormatDate(p.createdAt) : "Date created"}
                  >
                    {crmFormatDateShort(p.createdAt)}
                  </td>
                  <td style={{ padding: CELL_PAD, verticalAlign: "middle" }}>
                    <StageSelect
                      value={stageKey || ""}
                      options={stageOptions}
                      isDark={isDark}
                      disabled={locked || crmBusyId === p.id}
                      onChange={(val) => onCrmChange(p, { stage: val || null })}
                    />
                  </td>
                  <td style={{ padding: CELL_PAD, verticalAlign: "middle" }}>
                    <input
                      type="text"
                      list={`owners-${p.id}`}
                      key={`${p.id}-owner-${p.proposalOwner || ""}`}
                      defaultValue={p.proposalOwner || ""}
                      placeholder="Owner"
                      disabled={locked || crmBusyId === p.id}
                      onBlur={(e) => {
                        const val = e.target.value.trim();
                        if (val === (p.proposalOwner || "")) return;
                        onCrmChange(p, { proposalOwner: val || null });
                      }}
                      style={{ ...crmInputStyle(isDark), minWidth: 0 }}
                    />
                    <datalist id={`owners-${p.id}`}>
                      {teamOwners.map((name) => (
                        <option key={name} value={name} />
                      ))}
                    </datalist>
                  </td>
                  <td
                    style={{
                      padding: CELL_PAD,
                      verticalAlign: "middle",
                      color: subtle,
                      whiteSpace: "nowrap",
                      fontSize: 11,
                    }}
                  >
                    {systemSizeHint}
                  </td>
                  <td style={{ padding: CELL_PAD, verticalAlign: "middle" }}>
                    <CloseDatePicker
                      proposal={p}
                      isDark={isDark}
                      disabled={locked || crmBusyId === p.id}
                      onChange={(patch) => onCrmChange(p, patch)}
                    />
                  </td>
                  <td style={{ padding: CELL_PAD, verticalAlign: "middle" }}>
                    <RevenueInput
                      proposal={p}
                      isDark={isDark}
                      disabled={locked || crmBusyId === p.id}
                      onSave={(val, manual) =>
                        onCrmChange(p, {
                          estimatedRevenue: val,
                          estimatedRevenueManual: manual,
                        })
                      }
                    />
                  </td>
                  <td style={{ padding: CELL_PAD, verticalAlign: "middle" }}>
                    <select
                      value={p.closeLikelihoodPct ?? ""}
                      disabled={locked || crmBusyId === p.id}
                      title={Number.isFinite(p.closeLikelihoodPct) ? `${p.closeLikelihoodPct}%` : "Likelihood"}
                      onChange={(e) =>
                        onCrmChange(p, {
                          closeLikelihoodPct: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                      style={{
                        ...crmSelectStyle(isDark, { minWidth: 0, width: "100%", maxWidth: "none" }),
                        ...(likelihoodColor
                          ? { borderColor: likelihoodColor, color: isDark ? likelihoodColor : undefined }
                          : {}),
                      }}
                    >
                      {TABLE_LIKELIHOOD_OPTIONS.map((o) => (
                        <option key={String(o.value)} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: CELL_PAD, verticalAlign: "middle" }}>
                    <select
                      value={displayPriority}
                      disabled={locked || crmBusyId === p.id}
                      title={
                        p.priorityManual
                          ? "Manual priority"
                          : displayPriority
                            ? `Auto priority from deal size / gross price`
                            : "Priority"
                      }
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) {
                          onCrmChange(p, { priority: null, priorityManual: false });
                          return;
                        }
                        onCrmChange(p, { priority: val, priorityManual: true });
                      }}
                      style={{
                        ...crmSelectStyle(isDark, { minWidth: 0, width: "100%", maxWidth: "none" }),
                        ...(priorityOpt?.color ? { borderColor: priorityOpt.color } : {}),
                      }}
                    >
                      {CRM_PRIORITY_OPTIONS.map((o) => (
                        <option key={String(o.value)} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: CELL_PAD, verticalAlign: "middle" }}>
                    <select
                      value={dealTypeStored}
                      disabled={locked || crmBusyId === p.id}
                      title={dealTypeTitle}
                      onChange={(e) => onCrmChange(p, { dealType: e.target.value || null })}
                      style={crmSelectStyle(isDark, { minWidth: 0, width: "100%", maxWidth: "none", fontSize: 11 })}
                    >
                      <option value="" title="Auto (from size)">
                        {dealTypeStored ? "Auto (from size)" : dealTypeAuto !== "—" ? dealTypeAuto : "Auto"}
                      </option>
                      {CRM_PROJECT_TYPE_SELECT_OPTIONS.filter((o) => o.value).map((o) => (
                        <option key={o.value} value={o.value} title={o.label}>
                          {o.display}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: CELL_PAD, verticalAlign: "middle" }}>
                    <select
                      value={p.financing || ""}
                      disabled={locked || crmBusyId === p.id}
                      title="Project financing"
                      onChange={(e) => onCrmChange(p, { financing: e.target.value || null })}
                      style={crmSelectStyle(isDark, { minWidth: 0, width: "100%", maxWidth: "none", fontSize: 11 })}
                    >
                      {CRM_FINANCING_OPTIONS.map((o) => (
                        <option key={String(o.value)} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: CELL_PAD, verticalAlign: "middle" }}>
                    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4, flexWrap: "nowrap" }}>
                      <button type="button" onClick={() => onOpenProposal(p)} style={tableActionBtnStyle(isDark, "primary")}>
                        Open
                      </button>
                      <TableIconButton
                        isDark={isDark}
                        icon="download"
                        title={
                          pdfReady
                            ? "Download proposal PDF"
                            : "Complete the Proposal step to enable PDF download"
                        }
                        disabled={!pdfReady || downloadingId === p.id}
                        onClick={() => onDownload(p)}
                      />
                      {isClosedSection && onReopen && !locked ? (
                        <button type="button" onClick={() => onReopen(p)} style={tableActionBtnStyle(isDark, "secondary")}>
                          ↩
                        </button>
                      ) : null}
                      {!locked ? (
                        <TableIconButton
                          isDark={isDark}
                          icon="trash"
                          tone="danger"
                          title="Delete project"
                          onClick={() => onDelete(p)}
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StageSelect({ value, options, isDark, disabled, onChange }) {
  const [open, setOpen] = useState(false);
  const [menuRect, setMenuRect] = useState(null);
  const rootRef = useRef(null);
  const btnRef = useRef(null);
  const colors = crmStageColor(value);
  const selected = options.find((o) => o.value === value);
  const shortLabel = value ? STAGE_SHORT_LABELS[value] || selected?.label : selected?.label;
  const t = getAppTheme(isDark);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) {
      setMenuRect(null);
      return;
    }
    const update = () => {
      const rect = btnRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuRect({
        top: rect.bottom + 4,
        left: rect.left,
        minWidth: rect.width,
      });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (!rootRef.current?.contains(e.target) && !e.target.closest?.("[data-stage-select-menu]")) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const menu =
    open && !disabled && menuRect
      ? createPortal(
          <div
            data-stage-select-menu
            role="listbox"
            style={{
              position: "fixed",
              top: menuRect.top,
              left: menuRect.left,
              minWidth: menuRect.minWidth,
              width: "max-content",
              maxWidth: 240,
              zIndex: 10000,
              borderRadius: 8,
              border: `1px solid ${t.border}`,
              background: t.panel,
              boxShadow: isDark ? "0 10px 28px rgba(0,0,0,0.45)" : "0 10px 28px rgba(0,0,0,0.14)",
              maxHeight: 320,
              overflowY: "auto",
            }}
          >
            {options.map((o, idx) => {
              const optColors = crmStageColor(o.value);
              const active = o.value === value;
              return (
                <button
                  key={`${o.value || "empty"}-${idx}`}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 10px",
                    border: "none",
                    borderBottom: `1px solid ${t.border}`,
                    background: active ? (o.value ? optColors.bg : t.headBg) : t.panel,
                    color: o.value ? optColors.text : t.subtle,
                    fontSize: 12,
                    fontFamily: fontSans,
                    fontWeight: active ? 700 : 600,
                    cursor: "pointer",
                  }}
                >
                  {o.value ? (
                    <span
                      aria-hidden="true"
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: optColors.dot,
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <span style={{ width: 7, flexShrink: 0 }} />
                  )}
                  {o.label}
                </button>
              );
            })}
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={rootRef} style={{ position: "relative", width: "100%", minWidth: 0 }}>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={selected?.label || crmStageLabel(value) || "Stage"}
        onClick={() => {
          if (!disabled) setOpen((v) => !v);
        }}
        style={{
          width: "100%",
          textAlign: "left",
          padding: "5px 22px 5px 8px",
          borderRadius: 6,
          border: `1px solid ${value ? "transparent" : t.border}`,
          background: value ? colors.bg : t.inputBg,
          color: value ? colors.text : t.subtle,
          fontSize: 11,
          fontFamily: fontSans,
          fontWeight: 600,
          cursor: disabled ? "default" : "pointer",
          position: "relative",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {value ? (
          <span
            aria-hidden="true"
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: colors.dot,
              flexShrink: 0,
            }}
          />
        ) : null}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{shortLabel || "—"}</span>
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            right: 8,
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: 10,
            opacity: 0.85,
          }}
        >
          ▾
        </span>
      </button>
      {menu}
    </div>
  );
}

function RevenueInput({ proposal, isDark, disabled, onSave }) {
  const autoRev = deriveAutoRevenue(proposal);
  const displayRev = deriveEstimatedRevenue(proposal);
  const isManual = Boolean(proposal.estimatedRevenueManual);
  const formatted = displayRev > 0 ? formatUsd(displayRev) : "";

  return (
    <input
      type="text"
      key={`${proposal.id}-rev-${formatted}-${isManual}`}
      defaultValue={formatted}
      placeholder="—"
      disabled={disabled}
      title={
        isManual
          ? `Manual override (${formatUsd(proposal.estimatedRevenue)})`
          : autoRev > 0
            ? `Auto from proposal gross price (${formatUsd(autoRev)})`
            : "Set pricing in the proposal to auto-fill"
      }
      onBlur={(e) => {
        const raw = e.target.value.trim();
        if (!raw) {
          if (!isManual && autoRev <= 0) return;
          onSave(null, false);
          return;
        }
        const val = parseOptionalNumber(raw);
        if (!isManual && val === autoRev) return;
        if (isManual && val === proposal.estimatedRevenue) return;
        onSave(val, true);
      }}
      style={{
        ...crmInputStyle(isDark),
        fontStyle: isManual ? "normal" : formatted ? "normal" : "italic",
      }}
    />
  );
}


function CloseDatePicker({ proposal, isDark, disabled, onChange }) {
  const dateValue = proposal.expectedCloseDate || crmResolveCloseDate(proposal) || "";

  return (
    <input
      type="date"
      value={dateValue}
      disabled={disabled}
      title="Expected close date"
      onChange={(e) => {
        const date = e.target.value;
        if (!date) {
          onChange({ expectedCloseDate: null, expectedCloseMonth: null });
          return;
        }
        onChange({ expectedCloseDate: date, expectedCloseMonth: date.slice(0, 7) });
      }}
      style={{
        ...crmInputStyle(isDark),
        minWidth: 0,
        width: "100%",
        padding: "4px 4px",
        colorScheme: isDark ? "dark" : "light",
      }}
    />
  );
}

function crmSelectStyle(isDark, extra = {}) {
  const t = getAppTheme(isDark);
  return {
    padding: "4px 5px",
    borderRadius: 6,
    border: `1px solid ${t.border}`,
    background: t.inputBg,
    color: t.title,
    fontSize: 11,
    fontFamily: fontSans,
    cursor: "pointer",
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    ...extra,
  };
}

function crmInputStyle(isDark) {
  const t = getAppTheme(isDark);
  return {
    padding: "4px 5px",
    borderRadius: 6,
    border: `1px solid ${t.border}`,
    background: t.inputBg,
    color: t.title,
    fontSize: 11,
    fontFamily: fontSans,
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
  };
}

function actionBtn(isDark, tone) {
  return tableActionBtnStyle(isDark, tone);
}

