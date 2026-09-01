import {
  createProposalFolder,
  deleteProposalFolder,
  renameProposalFolder,
} from "../proposalFolders.js";

export function buildProposalFolderMenuItems({ folder, userId, onRefresh, onNewProjectInFolder }) {
  return [
    {
      label: "New project",
      action: () => onNewProjectInFolder?.(folder.id),
    },
    {
      label: "Rename",
      action: () => {
        const name = prompt("Rename folder", folder.name);
        if (!name?.trim()) return;
        renameProposalFolder(userId, folder.id, name.trim());
        onRefresh?.();
      },
    },
    { separator: true },
    {
      label: "Delete folder",
      danger: true,
      action: () => {
        if (!window.confirm(`Delete folder "${folder.name}"? Projects inside will move to Uncategorized.`)) return;
        deleteProposalFolder(userId, folder.id);
        onRefresh?.();
      },
    },
  ];
}

export function buildEmptyProposalFolderMenuItems({ folderId, onNewProjectInFolder }) {
  return [{ label: "New project", action: () => onNewProjectInFolder?.(folderId) }];
}

export function buildEmptyEmailFolderMenuItems({ folderId, onNewEmailInFolder }) {
  return [{ label: "New email", action: () => onNewEmailInFolder?.(folderId) }];
}

export { createProposalFolder };
