import React, { useEffect, useMemo, useState } from "react";
import { getAppTheme, pageShellStyle } from "./appTheme.js";
import { PageGuide, PageHeader, RibbonLabeledButton } from "./appIcons.jsx";
import CollapsibleTableSection from "./CollapsibleTableSection.jsx";
import EmailFilesTable, { formatEmailUpdated } from "./EmailFilesTable.jsx";
import NewEmailWizard from "./NewEmailWizard.jsx";
import SidebarContextMenu from "./sidebar/SidebarContextMenu.jsx";
import { buildEmptyEmailFolderMenuItems } from "./sidebar/sidebarProposalMenus.js";
import {
  createFolder,
  createTemplate,
  deleteTemplate,
  duplicateBuiltinAsCustom,
  isCollapsed,
  isPinned as isEmailPinned,
  listAllFoldersFlat,
  toggleCollapsed,
  togglePin as toggleEmailPin,
} from "./email-studio/lib/store.js";
import { initEmailStudioStore, listEmailTemplates, subscribe } from "./emailStudioStoreBridge.js";

const TEMPLATES_FOLDER_ID = "folder-templates";

export default function EmailStudioLibrary({
  isDark,
  accountKey,
  userName,
  userEmail,
  onOpenTemplate,
  onPinsChanged,
  autoOpenCreate = false,
  autoOpenCreateFolderId = null,
  onAutoOpenCreateHandled,
}) {
  const t = getAppTheme(isDark);
  const [ready, setReady] = useState(false);
  const [emailTick, setEmailTick] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createFolderId, setCreateFolderId] = useState(null);
  const [tableMenu, setTableMenu] = useState(null);

  useEffect(() => {
    let cancelled = false;
    initEmailStudioStore(accountKey).finally(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [accountKey]);

  useEffect(() => subscribe(() => setEmailTick((n) => n + 1)), []);

  useEffect(() => {
    if (!autoOpenCreate || !ready) return;
    setCreateFolderId(autoOpenCreateFolderId || null);
    setCreateOpen(true);
    onAutoOpenCreateHandled?.();
  }, [autoOpenCreate, autoOpenCreateFolderId, ready, onAutoOpenCreateHandled]);

  const customEmails = useMemo(() => {
    void emailTick;
    return listEmailTemplates()
      .filter((tpl) => tpl.kind === "custom")
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }, [emailTick, ready]);

  const templateEmails = useMemo(() => {
    void emailTick;
    return listEmailTemplates()
      .filter((tpl) => tpl.kind === "builtin")
      .sort((a, b) => String(a.title).localeCompare(String(b.title)));
  }, [emailTick, ready]);

  const folderSections = useMemo(() => {
    void emailTick;
    const folders = listAllFoldersFlat();
    const byFolder = new Map(folders.map((f) => [f.id, []]));
    const orphan = [];
    for (const tpl of customEmails) {
      if (tpl.folderId && byFolder.has(tpl.folderId)) byFolder.get(tpl.folderId).push(tpl);
      else orphan.push(tpl);
    }
    for (const tpl of templateEmails) {
      if (tpl.folderId && byFolder.has(tpl.folderId)) byFolder.get(tpl.folderId).push(tpl);
    }
    const sections = folders.map((folder) => {
      const rows = byFolder.get(folder.id) || [];
      rows.sort((a, b) => {
        if (a.kind === "builtin" && b.kind !== "builtin") return -1;
        if (a.kind !== "builtin" && b.kind === "builtin") return 1;
        if (a.kind === "builtin" && b.kind === "builtin") {
          return String(a.title).localeCompare(String(b.title));
        }
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });
      return { folder, rows };
    });
    if (orphan.length) {
      sections.push({ folder: { id: "orphan", name: "Uncategorized", label: "Uncategorized" }, rows: orphan });
    }
    return sections;
  }, [customEmails, templateEmails, emailTick]);

  function handleDeleteEmail(template) {
    if (!template || template.kind === "builtin") return;
    if (!window.confirm(`Delete "${template.title}"? This cannot be undone.`)) return;
    deleteTemplate(template.id);
    if (typeof onPinsChanged === "function") onPinsChanged();
    setEmailTick((n) => n + 1);
  }

  function handleToggleEmailPin(template) {
    if (!template?.id) return;
    toggleEmailPin(template.id);
    if (typeof onPinsChanged === "function") onPinsChanged();
    setEmailTick((n) => n + 1);
  }

  function handleOpenBuiltin(template) {
    const copy = duplicateBuiltinAsCustom(template.id);
    if (!copy) {
      window.alert("Could not create an editable copy.");
      return;
    }
    onOpenTemplate?.(copy.id);
  }

  function openCreateForFolder(folderId) {
    const resolved =
      !folderId || folderId === "orphan"
        ? null
        : folderId;
    setCreateFolderId(resolved);
    setCreateOpen(true);
  }

  function buildEmptyFolderHandlers(folderId) {
    const act = () => openCreateForFolder(folderId);
    return {
      onEmptyAction: act,
      onEmptyContextMenu: (e) => {
        e.preventDefault();
        setTableMenu({
          x: e.clientX,
          y: e.clientY,
          items: buildEmptyEmailFolderMenuItems({
            folderId: folderId === "orphan" ? null : folderId,
            onNewEmailInFolder: act,
          }),
        });
      },
      emptyActionLabel: "Click or right-click to add an email",
      emptyHint: "This folder is empty.",
    };
  }

  function handleNewFolder() {
    const name = window.prompt("Folder name", "New folder");
    if (!name?.trim()) return;
    createFolder({ name: name.trim(), parentId: null });
    setEmailTick((n) => n + 1);
  }

  async function handleCreateEmail({ title, folderId, preset }) {
    setCreating(true);
    try {
      const tpl = createTemplate({ title, folderId, preset: preset || "blank" });
      setCreateOpen(false);
      setCreateFolderId(null);
      onOpenTemplate?.(tpl.id);
    } finally {
      setCreating(false);
    }
  }

  const panel = t.panel;
  const border = t.border;
  const titleColor = t.title;
  const subtle = t.subtle;
  const headBg = isDark ? "#1E2530" : "#F3F5F8";

  const emailTableProps = {
    isDark,
    panel,
    border,
    titleColor,
    subtle,
    headBg,
    embedded: true,
    onOpen: (row) => onOpenTemplate?.(row.id),
    onPin: handleToggleEmailPin,
    onDelete: handleDeleteEmail,
    isPinned: (id) => isEmailPinned(id),
    formatUpdated: formatEmailUpdated,
  };

  return (
    <>
      <PageHeader theme={t} title="Email Studio" subtitle={[userName, userEmail].filter(Boolean).join(" · ")}>
        <RibbonLabeledButton
          theme={t}
          icon="folder"
          variant="surface"
          title="Create a folder for emails"
          onClick={handleNewFolder}
          disabled={!ready}
        >
          Create email folder
        </RibbonLabeledButton>
        <RibbonLabeledButton
          theme={t}
          icon="plus"
          variant="primary"
          title="Create a new custom email"
          onClick={() => setCreateOpen(true)}
          disabled={!ready || creating}
        >
          {creating ? "Creating…" : "New email"}
        </RibbonLabeledButton>
      </PageHeader>

      <div style={{ ...pageShellStyle(), flex: 1, overflow: "auto" }}>
        {!ready ? (
          <div style={{ padding: 24, color: subtle, fontSize: 13 }}>Loading emails…</div>
        ) : (
          <>
            {customEmails.length === 0 && templateEmails.length === 0 && folderSections.length === 0 ? (
              <PageGuide theme={t} title="Get started">
                Create your first email with a name and preset, then open it from the table when you are ready to design.
              </PageGuide>
            ) : null}

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {folderSections.map(({ folder, rows }) => {
                const collapseKey = folder.id === "orphan" ? "orphan" : folder.id;
                const collapsed = isCollapsed(collapseKey);
                const isTemplatesFolder = folder.id === TEMPLATES_FOLDER_ID;
                return (
                  <CollapsibleTableSection
                    key={collapseKey}
                    title={folder.label || folder.name}
                    count={rows.length}
                    collapsed={collapsed}
                    onToggle={() => {
                      toggleCollapsed(collapseKey);
                      setEmailTick((n) => n + 1);
                    }}
                    isDark={isDark}
                    border={border}
                    headBg={headBg}
                    titleColor={titleColor}
                    subtle={subtle}
                  >
                    <EmailFilesTable
                      {...emailTableProps}
                      {...(isTemplatesFolder ? {} : buildEmptyFolderHandlers(folder.id))}
                      rows={rows}
                      onOpen={(row) =>
                        row.kind === "builtin" ? handleOpenBuiltin(row) : onOpenTemplate?.(row.id)
                      }
                      emptyHint={
                        rows.length
                          ? undefined
                          : isTemplatesFolder
                            ? "Built-in starter templates will appear here."
                            : "This folder is empty."
                      }
                    />
                  </CollapsibleTableSection>
                );
              })}
            </div>
          </>
        )}
      </div>

      {tableMenu ? (
        <SidebarContextMenu
          isDark={isDark}
          x={tableMenu.x}
          y={tableMenu.y}
          items={tableMenu.items}
          onClose={() => setTableMenu(null)}
        />
      ) : null}

      {createOpen ? (
        <NewEmailWizard
          isDark={isDark}
          busy={creating}
          onCancel={() => {
            if (!creating) {
              setCreateOpen(false);
              setCreateFolderId(null);
            }
          }}
          onCreate={handleCreateEmail}
          initialFolderId={createFolderId}
        />
      ) : null}
    </>
  );
}
