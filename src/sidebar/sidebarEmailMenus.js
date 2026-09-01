import {
  createFolder,
  renameFolder,
  cutFolder,
  copyFolder,
  pasteFolder,
  deleteFolderDeep,
  togglePin,
  isPinned,
  updateTemplate,
  duplicateTemplate,
  duplicateBuiltinAsCustom,
  getClipboard,
  listChildFolders,
  listTemplatesInFolder,
  moveTemplate,
  listAllFoldersFlat,
} from "../email-studio/lib/store.js";

export function buildEmailLibraryMenuItems({ parentId = null, onRefresh }) {
  const clip = getClipboard();
  return [
    {
      label: "Create email folder",
      action: () => {
        const name = prompt("Email folder name", "New folder");
        if (!name?.trim()) return;
        createFolder({ name: name.trim(), parentId: parentId || null });
        onRefresh?.();
      },
    },
    {
      label: "Paste here",
      disabled: !(clip && clip.type === "folder"),
      action: () => {
        pasteFolder(parentId || null);
        onRefresh?.();
      },
    },
  ];
}

export function buildEmailFolderMenuItems({ folder, onRefresh, onOpenTemplate, onNewEmailInFolder }) {
  const clip = getClipboard();
  const canPaste = Boolean(clip && clip.type === "folder");
  return [
    {
      label: "New email",
      action: () => onNewEmailInFolder?.(folder.id),
    },
    {
      label: "Create email folder",
      action: () => {
        const name = prompt("Email folder name", "New folder");
        if (!name?.trim()) return;
        createFolder({ name: name.trim(), parentId: folder.id });
        onRefresh?.();
      },
    },
    {
      label: "Rename",
      action: () => {
        const name = prompt("Rename folder", folder.name);
        if (!name?.trim()) return;
        renameFolder(folder.id, name.trim());
        onRefresh?.();
      },
    },
    { separator: true },
    {
      label: "Cut",
      action: () => {
        cutFolder(folder.id);
        onRefresh?.();
      },
    },
    {
      label: "Copy",
      action: () => {
        copyFolder(folder.id);
        onRefresh?.();
      },
    },
    {
      label: "Paste here",
      disabled: !canPaste,
      action: () => {
        pasteFolder(folder.id);
        onRefresh?.();
      },
    },
    { separator: true },
    {
      label: isPinned(folder.id) ? "Unpin" : "Pin",
      action: () => {
        togglePin(folder.id);
        onRefresh?.();
      },
    },
    { separator: true },
    {
      label: "Delete",
      danger: true,
      action: () => {
        const hasKids =
          listChildFolders(folder.id).length > 0 || listTemplatesInFolder(folder.id).length > 0;
        if (hasKids) {
          const ok = confirm(
            `Delete “${folder.name}” and everything inside?\nBuilt-in emails will be moved up; custom drafts in this folder will be removed.`
          );
          if (!ok) return;
          deleteFolderDeep(folder.id, { recursive: true });
        } else {
          if (!confirm(`Delete folder “${folder.name}”?`)) return;
          deleteFolderDeep(folder.id, { recursive: false });
        }
        onRefresh?.();
      },
    },
  ];
}

export function buildEmailTemplateMenuItems({ template, onRefresh, onOpen, onDelete }) {
  const pinned = isPinned(template.id);
  const isBuiltin = template.kind === "builtin";
  const folders = listAllFoldersFlat().filter((f) => f.id !== template.folderId);
  const moveItems =
    !isBuiltin && folders.length
      ? [
          { separator: true },
          ...folders.map((f) => ({
            label: `Move to ${f.label || f.name}`,
            action: () => {
              moveTemplate(template.id, f.id);
              onRefresh?.();
            },
          })),
        ]
      : [];
  return [
    {
      label: isBuiltin ? "Open" : "Edit",
      action: () => onOpen?.(template.id),
    },
    {
      label: "Rename",
      disabled: isBuiltin,
      action: () => {
        const name = prompt("Rename email", template.title);
        if (!name?.trim()) return;
        updateTemplate(template.id, { title: name.trim() });
        onRefresh?.();
      },
    },
    {
      label: isBuiltin ? "Edit a copy" : "Duplicate",
      action: () => {
        const copy = isBuiltin ? duplicateBuiltinAsCustom(template.id) : duplicateTemplate(template.id);
        if (!copy) {
          alert("Could not duplicate this email.");
          return;
        }
        onRefresh?.();
        onOpen?.(copy.id);
      },
    },
    { separator: true },
    {
      label: pinned ? "Unpin" : "Pin",
      action: () => {
        togglePin(template.id);
        onRefresh?.();
      },
    },
    { separator: true },
    {
      label: "Delete",
      danger: true,
      disabled: isBuiltin,
      action: () => onDelete?.(template.id),
    },
    ...moveItems,
  ];
}
