import { createFolder } from "../email-studio/lib/store.js";
import { createProposalFolder } from "../proposalFolders.js";

export function buildRecentsAreaMenuItems({
  userId,
  onNewProject,
  onNewEmail,
  onRefresh,
}) {
  return [
    { label: "New project", action: () => onNewProject?.() },
    { label: "New email", action: () => onNewEmail?.() },
    { separator: true },
    {
      label: "Create projects folder",
      action: () => {
        const name = prompt("Project folder name", "New folder");
        if (!name?.trim()) return;
        createProposalFolder(userId, name.trim());
        onRefresh?.();
      },
    },
    {
      label: "Create email folder",
      action: () => {
        const name = prompt("Email folder name", "New folder");
        if (!name?.trim()) return;
        createFolder({ name: name.trim(), parentId: null });
        onRefresh?.();
      },
    },
  ];
}

export function buildProjectsNavMenuItems({ onNavigateProjects, onNewProject, userId, onRefresh }) {
  return [
    { label: "New project", action: () => onNewProject?.() },
    {
      label: "Create projects folder",
      action: () => {
        const name = prompt("Project folder name", "New folder");
        if (!name?.trim()) return;
        createProposalFolder(userId, name.trim());
        onRefresh?.();
      },
    },
    { separator: true },
    { label: "Open projects library", action: () => onNavigateProjects?.() },
  ];
}

export function buildEmailNavMenuItems({
  onNavigateEmail,
  onNewEmail,
  onRefresh,
  isAdmin,
  onNavigateMedia,
}) {
  return [
    { label: "New email", action: () => onNewEmail?.() },
    {
      label: "Create email folder",
      action: () => {
        const name = prompt("Email folder name", "New folder");
        if (!name?.trim()) return;
        createFolder({ name: name.trim(), parentId: null });
        onRefresh?.();
      },
    },
    { separator: true },
    { label: "Open Email Studio", action: () => onNavigateEmail?.() },
    ...(isAdmin ? [{ label: "Open marketing report", action: () => onNavigateMedia?.("email") }] : []),
  ];
}
