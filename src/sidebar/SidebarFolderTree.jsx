import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AppIcon } from "../appIcons.jsx";
import { crmProjectName } from "../proposalCrm.js";
import { listProposalsForUser, deleteProposal } from "../proposalStorage.js";
import {
  isProposalPinned,
  readPinnedProposalIds,
  togglePinnedProposal,
} from "../pinnedProposals.js";
import {
  groupProposalsByFolder,
  folderTableKey,
  isProposalTableCollapsed,
  toggleProposalTableCollapsed,
  listProposalFolders,
} from "../proposalFolders.js";
import {
  getTemplate,
  deleteTemplate,
  isPinned,
  togglePin,
  listAllFoldersFlat,
  isCollapsed,
  toggleCollapsed,
} from "../email-studio/lib/store.js";
import { subscribe, readEmailStudioState } from "../emailStudioStoreBridge.js";
import { buildEmailFolderMenuItems, buildEmailTemplateMenuItems } from "./sidebarEmailMenus.js";
import { buildRecentsAreaMenuItems } from "./sidebarRecentsMenus.js";
import { buildProposalFolderMenuItems } from "./sidebarProposalMenus.js";
import {
  openSidebarContextMenu,
  shouldShowSidebarAreaMenu,
  sidebarIconWrap,
  sidebarRowStyle,
  sidebarRowActionBtn,
  sidebarChevronStyle,
  SIDEBAR_ICON_SIZE,
  SIDEBAR_NESTED_ICON_SIZE,
} from "./sidebarRowStyles.js";

function SidebarTreeIcon({ name, nested = false }) {
  const size = nested ? SIDEBAR_NESTED_ICON_SIZE : SIDEBAR_ICON_SIZE;
  return (
    <span style={sidebarIconWrap(size)}>
      <AppIcon name={name} size={size} />
    </span>
  );
}

function sectionSubLabel(sidebar) {
  return {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: sidebar.muted,
    padding: "8px 12px 4px",
  };
}

function sortProposals(rows, userId) {
  const pinnedIds = new Set(readPinnedProposalIds(userId));
  return [...rows].sort((a, b) => {
    const ap = pinnedIds.has(a.id) ? 0 : 1;
    const bp = pinnedIds.has(b.id) ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
  });
}

function sortEmailTemplates(templates, pinSet) {
  return [...templates].sort((a, b) => {
    const ap = pinSet.has(a.id) ? 0 : 1;
    const bp = pinSet.has(b.id) ? 0 : 1;
    if (ap !== bp) return ap - bp;
    if (a.kind === "builtin" && b.kind !== "builtin") return -1;
    if (a.kind !== "builtin" && b.kind === "builtin") return 1;
    if (a.kind === "builtin" && b.kind === "builtin") {
      return String(a.title).localeCompare(String(b.title));
    }
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
}

export default function SidebarFolderTree({
  sidebar,
  expanded,
  userId,
  refreshKey,
  currentView,
  activeProposalId,
  activeEmailTemplateId,
  onOpenProposal,
  onOpenEmailTemplate,
  onDeleteEmailTemplate,
  onProposalDeleted,
  onPinsChanged,
  onNavigateEmail,
  onNewProject,
  onNewEmail,
  onNewProjectInFolder,
  onNewEmailInFolder,
  onSidebarRefresh,
  setContextMenu,
}) {
  const emailState = useSyncExternalStore(subscribe, readEmailStudioState, readEmailStudioState);
  const [allProposals, setAllProposals] = useState([]);
  const [proposalTick, setProposalTick] = useState(0);
  const [emailTick, setEmailTick] = useState(0);

  const bumpEmail = useCallback(() => setEmailTick((n) => n + 1), []);
  const bumpProposals = useCallback(() => setProposalTick((n) => n + 1), []);
  const wasExpandedRef = useRef(expanded);

  useEffect(() => {
    const wasExpanded = wasExpandedRef.current;
    wasExpandedRef.current = expanded;
    if (!wasExpanded || expanded) return;

    let emailChanged = false;
    for (const folder of listAllFoldersFlat()) {
      if (!isCollapsed(folder.id)) {
        toggleCollapsed(folder.id);
        emailChanged = true;
      }
    }
    if (!isCollapsed("orphan")) {
      toggleCollapsed("orphan");
      emailChanged = true;
    }
    if (emailChanged) bumpEmail();

    let proposalChanged = false;
    if (userId) {
      for (const folder of listProposalFolders(userId)) {
        const key = folderTableKey(folder.id);
        if (!isProposalTableCollapsed(userId, key)) {
          toggleProposalTableCollapsed(userId, key);
          proposalChanged = true;
        }
      }
      const uncategorizedKey = folderTableKey(null);
      if (!isProposalTableCollapsed(userId, uncategorizedKey)) {
        toggleProposalTableCollapsed(userId, uncategorizedKey);
        proposalChanged = true;
      }
    }
    if (proposalChanged) bumpProposals();
  }, [expanded, userId, bumpEmail, bumpProposals]);

  const openMenu = useCallback(
    (e, items) => openSidebarContextMenu(e, setContextMenu, items),
    [setContextMenu],
  );

  const refreshAll = useCallback(() => {
    bumpEmail();
    bumpProposals();
    onSidebarRefresh?.();
  }, [bumpEmail, bumpProposals, onSidebarRefresh]);

  const openRecentsMenu = useCallback(
    (e) => {
      if (!shouldShowSidebarAreaMenu(e)) return;
      openMenu(
        e,
        buildRecentsAreaMenuItems({
          userId,
          onNewProject,
          onNewEmail,
          onRefresh: refreshAll,
        }),
      );
    },
    [openMenu, userId, onNewProject, onNewEmail, refreshAll],
  );

  useEffect(() => {
    if (!userId) {
      setAllProposals([]);
      return;
    }
    let cancelled = false;
    listProposalsForUser(userId)
      .then((rows) => {
        if (!cancelled) setAllProposals(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setAllProposals([]);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, refreshKey, proposalTick]);

  const projectLayout = useMemo(() => {
    void proposalTick;
    const grouped = groupProposalsByFolder(userId, allProposals);
    const folders = grouped.folders.map((folder) => ({
      folder,
      rows: sortProposals(grouped.groups.get(folder.id) || [], userId),
    }));
    const uncategorized = sortProposals(grouped.uncategorized, userId);
    return { folders, uncategorized };
  }, [userId, allProposals, proposalTick, refreshKey]);

  const emailLayout = useMemo(() => {
    void emailTick;
    const pinSet = new Set(emailState.pins || []);
    const allTemplates = emailState.templates || [];
    const customEmails = allTemplates.filter((t) => t.kind === "custom");
    const builtinEmails = allTemplates.filter((t) => t.kind === "builtin");
    const flatFolders = listAllFoldersFlat();
    const byFolder = new Map(flatFolders.map((f) => [f.id, []]));
    const orphan = [];
    for (const tpl of customEmails) {
      if (tpl.folderId && byFolder.has(tpl.folderId)) byFolder.get(tpl.folderId).push(tpl);
      else orphan.push(tpl);
    }
    for (const tpl of builtinEmails) {
      if (tpl.folderId && byFolder.has(tpl.folderId)) byFolder.get(tpl.folderId).push(tpl);
    }
    const folders = flatFolders.map((folder) => ({
      folder,
      rows: sortEmailTemplates(byFolder.get(folder.id) || [], pinSet),
    }));
    const uncategorized = sortEmailTemplates(orphan, pinSet);
    return { folders, uncategorized };
  }, [emailState.templates, emailState.pins, emailTick]);

  function handleDeleteEmailTemplate(id) {
    const t = getTemplate(id);
    if (!t) return;
    if (t.kind === "builtin") {
      alert("Built-in templates can't be deleted. Use Edit a copy to customize.");
      return;
    }
    if (!window.confirm(`Delete "${t.title}"? This can't be undone.`)) return;
    deleteTemplate(id);
    onDeleteEmailTemplate?.(id);
    bumpEmail();
  }

  function toggleProjectFolder(folderId) {
    toggleProposalTableCollapsed(userId, folderTableKey(folderId));
    bumpProposals();
  }

  function toggleEmailFolder(folderId) {
    toggleCollapsed(folderId);
    bumpEmail();
  }

  function openEmailItem(template) {
    onOpenEmailTemplate?.(template.id);
  }

  function renderEmailTemplate(template, { depth = 1, compact = false } = {}) {
    const active = currentView === "email" && activeEmailTemplateId === template.id;
    const isBuiltin = template.kind === "builtin";
    const pinned = !isBuiltin && isPinned(template.id);
    const rowBtn = (
      <button
        type="button"
        title={template.title}
        aria-current={active ? "page" : undefined}
        style={{
          ...sidebarRowStyle(sidebar, { active, depth, expanded, compact, dense: depth > 0 }),
          ...(expanded && !compact && !isBuiltin ? { flex: 1, minWidth: 0, width: "auto" } : {}),
        }}
        onClick={() => openEmailItem(template)}
        onContextMenu={(e) =>
          openMenu(
            e,
            buildEmailTemplateMenuItems({
              template,
              onRefresh: bumpEmail,
              onOpen: (id) => {
                const tpl = getTemplate(id);
                if (tpl) openEmailItem(tpl);
              },
              onDelete: handleDeleteEmailTemplate,
            }),
          )
        }
      >
        <SidebarTreeIcon name="mail" nested />
        {expanded ? (
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {template.title}
          </span>
        ) : null}
      </button>
    );

    if (!expanded || compact || isBuiltin) {
      return (
        <React.Fragment key={template.id}>{rowBtn}</React.Fragment>
      );
    }

    return (
      <div
        key={template.id}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          paddingRight: 4,
        }}
      >
        {rowBtn}
        <button
          type="button"
          title={pinned ? "Unpin" : "Pin"}
          aria-label={pinned ? "Unpin" : "Pin"}
          style={sidebarRowActionBtn(sidebar, { active: pinned })}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            togglePin(template.id);
            bumpEmail();
            onPinsChanged?.();
          }}
        >
          <AppIcon name="pin" size={12} />
        </button>
        <button
          type="button"
          title="Delete"
          aria-label="Delete email"
          style={sidebarRowActionBtn(sidebar, { danger: true })}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleDeleteEmailTemplate(template.id);
          }}
        >
          <AppIcon name="trash" size={12} />
        </button>
      </div>
    );
  }

  function renderProposalButton(proposal, { depth = 1, compact = false } = {}) {
    const active = currentView === "editor" && proposal.id === activeProposalId;
    const pinned = isProposalPinned(userId, proposal.id);
    const name = crmProjectName(proposal);
    const rowBtn = (
      <button
        type="button"
        title={name}
        aria-current={active ? "page" : undefined}
        style={{
          ...sidebarRowStyle(sidebar, { active, depth, expanded, compact, dense: depth > 0 }),
          ...(expanded && !compact ? { flex: 1, minWidth: 0, width: "auto" } : {}),
        }}
        onClick={() => onOpenProposal?.(proposal)}
        onContextMenu={(e) =>
          openMenu(e, [
            { label: "Open", action: () => onOpenProposal?.(proposal) },
            {
              label: pinned ? "Unpin" : "Pin",
              action: () => {
                togglePinnedProposal(userId, proposal.id);
                bumpProposals();
                onPinsChanged?.();
              },
            },
            { separator: true },
            {
              label: "Delete",
              danger: true,
              action: () => deleteProposalFromSidebar(proposal),
            },
          ])
        }
      >
        <SidebarTreeIcon name="file" nested />
        {expanded ? (
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
        ) : null}
      </button>
    );

    if (!expanded || compact) {
      return <React.Fragment key={proposal.id}>{rowBtn}</React.Fragment>;
    }

    return (
      <div
        key={proposal.id}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          paddingRight: 4,
        }}
      >
        {rowBtn}
        <button
          type="button"
          title={pinned ? "Unpin" : "Pin"}
          aria-label={pinned ? "Unpin" : "Pin"}
          style={sidebarRowActionBtn(sidebar, { active: pinned })}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            togglePinnedProposal(userId, proposal.id);
            bumpProposals();
            onPinsChanged?.();
          }}
        >
          <AppIcon name="pin" size={12} />
        </button>
        <button
          type="button"
          title="Delete"
          aria-label="Delete project"
          style={sidebarRowActionBtn(sidebar, { danger: true })}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            deleteProposalFromSidebar(proposal);
          }}
        >
          <AppIcon name="trash" size={12} />
        </button>
      </div>
    );
  }

  async function deleteProposalFromSidebar(proposal) {
    const name = crmProjectName(proposal);
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await deleteProposal(proposal.id, userId);
      onProposalDeleted?.(proposal.id);
      bumpProposals();
      onSidebarRefresh?.();
    } catch (err) {
      alert(err.message || "Could not delete project.");
    }
  }

  function renderProjectFolder({ folder, rows }, { compact = false } = {}) {
    const collapseKey = folderTableKey(folder.id);
    const open = !isProposalTableCollapsed(userId, collapseKey);
    const label = folder.name;
    return (
      <React.Fragment key={folder.id}>
        <button
          type="button"
          title={label}
          style={sidebarRowStyle(sidebar, { depth: 0, expanded, compact })}
          onClick={() => toggleProjectFolder(folder.id)}
          onContextMenu={(e) =>
            openMenu(
              e,
              buildProposalFolderMenuItems({
                folder,
                userId,
                onRefresh: refreshAll,
                onNewProjectInFolder,
              }),
            )
          }
        >
          {expanded ? <span style={sidebarChevronStyle(open)}>▸</span> : null}
          <SidebarTreeIcon name="folderProject" nested={compact} />
          {expanded ? (
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
              {label}
              {rows.length ? (
                <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.65 }}>{rows.length}</span>
              ) : null}
            </span>
          ) : null}
        </button>
        {open && rows.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {rows.map((p) => renderProposalButton(p, { compact }))}
          </div>
        ) : null}
      </React.Fragment>
    );
  }

  function renderEmailFolder({ folder, rows }, { compact = false } = {}) {
    const collapseKey = folder.id;
    const open = !isCollapsed(collapseKey);
    const label = folder.label || folder.name;
    return (
      <React.Fragment key={folder.id}>
        <button
          type="button"
          title={label}
          style={sidebarRowStyle(sidebar, { depth: 0, expanded, compact })}
          onClick={() => toggleEmailFolder(folder.id)}
          onContextMenu={(e) =>
            openMenu(
              e,
              buildEmailFolderMenuItems({
                folder,
                onRefresh: bumpEmail,
                onOpenTemplate: onOpenEmailTemplate,
                onNewEmailInFolder,
              }),
            )
          }
        >
          {expanded ? <span style={sidebarChevronStyle(open)}>▸</span> : null}
          <SidebarTreeIcon name="folderMail" nested={compact} />
          {expanded ? (
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
              {label}
              {rows.length ? (
                <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.65 }}>{rows.length}</span>
              ) : null}
            </span>
          ) : null}
        </button>
        {open && rows.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {rows.map((t) => renderEmailTemplate(t, { compact }))}
          </div>
        ) : null}
      </React.Fragment>
    );
  }

  function renderUncategorizedProject(rows, { compact = false } = {}) {
    if (!rows.length) return null;
    const collapseKey = folderTableKey(null);
    const open = !isProposalTableCollapsed(userId, collapseKey);
    return (
      <React.Fragment key="uncategorized-projects">
        <button
          type="button"
          title="Uncategorized"
          style={sidebarRowStyle(sidebar, { depth: 0, expanded, compact })}
          onClick={() => toggleProjectFolder(null)}
        >
          {expanded ? <span style={sidebarChevronStyle(open)}>▸</span> : null}
          <SidebarTreeIcon name="folderProject" nested={compact} />
          {expanded ? (
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
              Uncategorized
              <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.65 }}>{rows.length}</span>
            </span>
          ) : null}
        </button>
        {open && rows.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {rows.map((p) => renderProposalButton(p, { compact }))}
          </div>
        ) : null}
      </React.Fragment>
    );
  }

  function renderUncategorizedEmail(rows, { compact = false } = {}) {
    if (!rows.length) return null;
    const open = !isCollapsed("orphan");
    return (
      <React.Fragment key="uncategorized-emails">
        <button
          type="button"
          title="Uncategorized"
          style={sidebarRowStyle(sidebar, { depth: 0, expanded, compact })}
          onClick={() => toggleEmailFolder("orphan")}
        >
          {expanded ? <span style={sidebarChevronStyle(open)}>▸</span> : null}
          <SidebarTreeIcon name="folderMail" nested={compact} />
          {expanded ? (
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
              Uncategorized
              <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.65 }}>{rows.length}</span>
            </span>
          ) : null}
        </button>
        {open ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {rows.map((t) => renderEmailTemplate(t, { compact }))}
          </div>
        ) : null}
      </React.Fragment>
    );
  }

  const hasProjects =
    projectLayout.folders.length > 0 ||
    projectLayout.uncategorized.length > 0;
  const hasEmails =
    emailLayout.folders.length > 0 ||
    emailLayout.uncategorized.length > 0;

  if (!expanded) {
    return (
      <div
        style={{
          padding: "4px 8px 8px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          alignItems: "center",
          minHeight: "100%",
          flex: 1,
        }}
        onContextMenu={openRecentsMenu}
      >
        {projectLayout.folders.map((entry) => renderProjectFolder(entry, { compact: true }))}
        {renderUncategorizedProject(projectLayout.uncategorized, { compact: true })}
        {emailLayout.folders.map((entry) => renderEmailFolder(entry, { compact: true }))}
        {renderUncategorizedEmail(emailLayout.uncategorized, { compact: true })}
      </div>
    );
  }

  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 2, minHeight: "100%", flex: 1 }}
      onContextMenu={openRecentsMenu}
    >
      <div style={sectionSubLabel(sidebar)}>Projects</div>
      {!hasProjects ? (
        <div style={{ padding: "2px 12px 8px", fontSize: 12, color: sidebar.muted }}>No projects yet</div>
      ) : (
        <>
          {projectLayout.folders.map((entry) => renderProjectFolder(entry))}
          {renderUncategorizedProject(projectLayout.uncategorized)}
        </>
      )}

      <div style={{ ...sectionSubLabel(sidebar), paddingTop: 10 }}>Emails</div>
      {!hasEmails ? (
        <div style={{ padding: "2px 12px 8px", fontSize: 12, color: sidebar.muted }}>
          <button
            type="button"
            onClick={() => onNavigateEmail?.()}
            style={{
              border: "none",
              background: "transparent",
              color: sidebar.text,
              fontSize: 12,
              cursor: "pointer",
              padding: 0,
              textDecoration: "underline",
            }}
          >
            Create an email
          </button>
        </div>
      ) : (
        <>
          {emailLayout.folders.map((entry) => renderEmailFolder(entry))}
          {renderUncategorizedEmail(emailLayout.uncategorized)}
        </>
      )}
    </div>
  );
}
