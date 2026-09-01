import {
  getState,
  listRootFolders,
  listChildFolders,
  listTemplatesInFolder,
  countInFolder,
  isCollapsed,
  toggleCollapsed,
  isPinned,
  pinItem,
  unpinItem,
  togglePin,
  moveTemplate,
  getFolder,
  getTemplate,
  getClipboard,
  cutFolder,
  copyFolder,
  pasteFolder,
  deleteFolderDeep,
  renameFolder,
  createFolder,
  moveFolder,
  updateTemplate,
  duplicateTemplate,
} from "../lib/store.js";
import { showContextMenu } from "./contextMenu.js";

/**
 * @param {HTMLElement} root
 * @param {{ onSelectTemplate: (id: string) => void, onHome: () => void, onDeleteTemplate?: (id: string) => void, currentId: string | null, view: string }} api
 */
export function renderNav(root, api) {
  const state = getState();
  root.innerHTML = "";
  // Do not hideContextMenu() here — store subscribe re-renders the nav on autosave
  // and was dismissing open right-click menus mid-use.

  const pinSection = document.createElement("div");
  pinSection.className = "nav-section";
  pinSection.dataset.drop = "pins";

  const pinHead = folderButton({
    id: "__pins__",
    name: "Pinned",
    count: state.pins.length,
    depth: 0,
    open: !isCollapsed("__pins__"),
    variant: "pins",
  });
  pinHead.addEventListener("click", () => {
    toggleCollapsed("__pins__");
    renderNav(root, api);
  });
  pinSection.appendChild(pinHead);
  enableFolderDrop(pinSection, null, "pins", api, root);

  if (!isCollapsed("__pins__")) {
    const nest = document.createElement("div");
    nest.className = "nav-nest";
    if (!state.pins.length) {
      const empty = document.createElement("p");
      empty.className = "nav-empty";
      empty.textContent = "Drop templates or folders here";
      nest.appendChild(empty);
    } else {
      for (const id of state.pins) {
        const folder = getFolder(id);
        const tpl = getTemplate(id);
        if (folder) nest.appendChild(pinnedFolderRow(folder, api, root));
        else if (tpl) nest.appendChild(fileRow(tpl, 1, api, root));
      }
    }
    pinSection.appendChild(nest);
  }
  root.appendChild(pinSection);

  const lib = document.createElement("div");
  lib.className = "nav-section";
  const libLabel = document.createElement("div");
  libLabel.className = "nav-section-label";
  libLabel.innerHTML = `<span class="nav-label">Library</span>`;
  libLabel.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    openLibraryMenu(e.clientX, e.clientY, null, api, root);
  });
  lib.appendChild(libLabel);
  enableFolderDrop(lib, null, "library-root", api, root);

  for (const folder of listRootFolders()) {
    renderFolderNode(lib, folder, 0, api, root);
  }
  root.appendChild(lib);
}

function openFolderMenu(e, folder, api, root) {
  e.preventDefault();
  e.stopPropagation();
  const clip = getClipboard();
  const canPaste = Boolean(clip && clip.type === "folder");

  showContextMenu({
    x: e.clientX,
    y: e.clientY,
    items: [
      {
        label: "New folder",
        action: () => {
          const name = prompt("Folder name", "New folder");
          if (!name?.trim()) return;
          // Created inside this folder only if you started from here
          createFolder({ name: name.trim(), parentId: folder.id });
          renderNav(root, api);
        },
      },
      {
        label: "Rename",
        action: () => {
          const name = prompt("Rename folder", folder.name);
          if (!name?.trim()) return;
          renameFolder(folder.id, name.trim());
          renderNav(root, api);
        },
      },
      { separator: true },
      {
        label: "Cut",
        action: () => {
          cutFolder(folder.id);
          renderNav(root, api);
        },
      },
      {
        label: "Copy",
        action: () => {
          copyFolder(folder.id);
          renderNav(root, api);
        },
      },
      {
        label: "Paste here",
        disabled: !canPaste,
        action: () => {
          pasteFolder(folder.id);
          renderNav(root, api);
        },
      },
      { separator: true },
      {
        label: isPinned(folder.id) ? "Unpin" : "Pin",
        action: () => {
          togglePin(folder.id);
          renderNav(root, api);
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
              `Delete “${folder.name}” and everything inside?\nBuilt-in emails will be moved up; custom drafts in this folder will be removed.`,
            );
            if (!ok) return;
            deleteFolderDeep(folder.id, { recursive: true });
          } else {
            if (!confirm(`Delete folder “${folder.name}”?`)) return;
            deleteFolderDeep(folder.id, { recursive: false });
          }
          renderNav(root, api);
        },
      },
    ],
  });
}

function openLibraryMenu(x, y, parentId, api, root) {
  const clip = getClipboard();
  showContextMenu({
    x,
    y,
    items: [
      {
        label: "New folder",
        action: () => {
          const name = prompt("Folder name", "New folder");
          if (!name?.trim()) return;
          // No parent selected → top-level; pass parentId only when nesting
          createFolder({ name: name.trim(), parentId: parentId || null });
          renderNav(root, api);
        },
      },
      {
        label: "Paste here",
        disabled: !(clip && clip.type === "folder"),
        action: () => {
          pasteFolder(parentId || null);
          renderNav(root, api);
        },
      },
    ],
  });
}

function openFileMenu(e, template, api, root) {
  e.preventDefault();
  e.stopPropagation();
  const pinned = isPinned(template.id);
  const isBuiltin = template.kind === "builtin";

  showContextMenu({
    x: e.clientX,
    y: e.clientY,
    items: [
      {
        label: isBuiltin ? "Open" : "Edit",
        action: () => api.onSelectTemplate(template.id),
      },
      {
        label: "Rename",
        disabled: isBuiltin,
        action: () => {
          const name = prompt("Rename email", template.title);
          if (!name?.trim()) return;
          updateTemplate(template.id, { title: name.trim() });
          renderNav(root, api);
        },
      },
      {
        label: isBuiltin ? "Edit a copy" : "Duplicate",
        action: () => {
          const copy = duplicateTemplate(template.id);
          if (!copy) {
            alert("Could not duplicate this email.");
            return;
          }
          renderNav(root, api);
          api.onSelectTemplate(copy.id);
        },
      },
      { separator: true },
      {
        label: pinned ? "Unpin" : "Pin",
        action: () => {
          togglePin(template.id);
          renderNav(root, api);
        },
      },
      { separator: true },
      {
        label: "Delete",
        danger: true,
        disabled: isBuiltin,
        action: () => {
          api.onDeleteTemplate?.(template.id);
          renderNav(root, api);
        },
      },
    ],
  });
}

function folderButton({ id, name, count, depth, open, variant }) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = `nav-folder ${variant === "pins" ? "nav-pins-head" : ""} ${getClipboard()?.id === id && getClipboard()?.mode === "cut" ? "is-cut" : ""}`;
  row.style.setProperty("--depth", String(depth));
  row.dataset.folderId = id;
  row.setAttribute("aria-expanded", open ? "true" : "false");
  row.title = name;
  row.draggable = id !== "__pins__";
  row.innerHTML = `
    <span class="nav-chevron" aria-hidden="true"></span>
    <span class="${variant === "pins" ? "nav-pin-head-ico" : "nav-folder-ico"}" aria-hidden="true"></span>
    <span class="nav-label">${escapeHtml(name)}</span>
    <span class="nav-count">${count}</span>
  `;
  if (id !== "__pins__") {
    row.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("application/x-janta", JSON.stringify({ type: "folder", id }));
      e.dataTransfer.effectAllowed = "move";
      row.classList.add("is-dragging");
    });
    row.addEventListener("dragend", () => row.classList.remove("is-dragging"));
  }
  return row;
}

function renderFolderNode(parent, folder, depth, api, root) {
  const open = !isCollapsed(folder.id);
  const row = folderButton({
    id: folder.id,
    name: folder.name,
    count: countInFolder(folder.id),
    depth,
    open,
  });
  row.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleCollapsed(folder.id);
    renderNav(root, api);
  });
  row.addEventListener("contextmenu", (e) => openFolderMenu(e, folder, api, root));
  parent.appendChild(row);

  const dropWrap = document.createElement("div");
  dropWrap.className = "nav-drop-target";
  dropWrap.dataset.folderId = folder.id;
  enableFolderDrop(dropWrap, folder.id, "folder", api, root);

  if (!open) {
    parent.appendChild(dropWrap);
    return;
  }

  const nest = document.createElement("div");
  nest.className = "nav-nest";
  dropWrap.appendChild(nest);
  parent.appendChild(dropWrap);

  for (const child of listChildFolders(folder.id)) {
    renderFolderNode(nest, child, depth + 1, api, root);
  }
  for (const t of listTemplatesInFolder(folder.id)) {
    nest.appendChild(fileRow(t, depth + 1, api, root));
  }
}

function pinnedFolderRow(folder, api, root) {
  const row = document.createElement("div");
  row.className = "nav-file nav-pinned-folder";
  row.style.setProperty("--depth", "1");
  row.draggable = true;
  row.title = folder.name;
  row.innerHTML = `
    <button type="button" class="nav-file-main">
      <span class="nav-folder-ico" aria-hidden="true"></span>
      <span class="nav-label">${escapeHtml(folder.name)}</span>
    </button>
    <button type="button" class="nav-pin is-pinned" title="Unpin" aria-label="Unpin"></button>
    <span class="nav-trash-spacer" aria-hidden="true"></span>
  `;
  row.querySelector(".nav-pin").addEventListener("click", (e) => {
    e.stopPropagation();
    unpinItem(folder.id);
    renderNav(root, api);
  });
  row.addEventListener("contextmenu", (e) => openFolderMenu(e, folder, api, root));
  row.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("application/x-janta", JSON.stringify({ type: "folder", id: folder.id }));
    e.dataTransfer.effectAllowed = "move";
  });
  return row;
}

function fileRow(t, depth, api, root) {
  const pinned = isPinned(t.id);
  const row = document.createElement("div");
  row.className = "nav-file";
  row.dataset.id = t.id;
  row.style.setProperty("--depth", String(depth));
  row.draggable = true;
  row.title = t.title;
  row.setAttribute("aria-current", api.currentId === t.id ? "true" : "false");
  row.innerHTML = `
    <button type="button" class="nav-file-main" title="${escapeHtml(t.title)}">
      <span class="nav-file-dot" aria-hidden="true"></span>
      <span class="nav-label">${escapeHtml(t.title)}</span>
    </button>
    <button type="button" class="nav-pin ${pinned ? "is-pinned" : ""}" title="${pinned ? "Unpin" : "Pin"}" aria-label="${pinned ? "Unpin" : "Pin"}"></button>
    <button type="button" class="nav-trash" title="Delete" aria-label="Delete">
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
        <path fill="currentColor" d="M6 2h4l.5 1H13v1.5H3V3h2.5L6 2zm-1 4h1.2l.4 7h2.8l.4-7H11l-.5 8.5a1 1 0 0 1-1 .9H6.5a1 1 0 0 1-1-.9L5 6z"/>
      </svg>
    </button>
  `;
  row.querySelector(".nav-file-main").addEventListener("click", () => api.onSelectTemplate(t.id));
  row.querySelector(".nav-pin").addEventListener("click", (e) => {
    e.stopPropagation();
    togglePin(t.id);
    renderNav(root, api);
  });
  row.querySelector(".nav-trash").addEventListener("click", (e) => {
    e.stopPropagation();
    api.onDeleteTemplate?.(t.id);
  });
  row.addEventListener("contextmenu", (e) => openFileMenu(e, t, api, root));
  row.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("application/x-janta", JSON.stringify({ type: "template", id: t.id }));
    e.dataTransfer.effectAllowed = "move";
    row.classList.add("is-dragging");
  });
  row.addEventListener("dragend", () => row.classList.remove("is-dragging"));
  return row;
}

function enableFolderDrop(el, folderId, mode, api, root) {
  el.addEventListener("dragover", (e) => {
    e.preventDefault();
    el.classList.add("is-drop");
  });
  el.addEventListener("dragleave", () => el.classList.remove("is-drop"));
  el.addEventListener("drop", (e) => {
    e.preventDefault();
    el.classList.remove("is-drop");
    let payload;
    try {
      payload = JSON.parse(e.dataTransfer.getData("application/x-janta") || "{}");
    } catch {
      return;
    }
    if (!payload?.id || !payload?.type) return;

    if (mode === "pins") {
      pinItem(payload.id);
      renderNav(root, api);
      return;
    }

    if (payload.type === "template" && folderId) {
      moveTemplate(payload.id, folderId);
      renderNav(root, api);
      return;
    }

    if (payload.type === "folder") {
      if (mode === "folder" && folderId) {
        moveFolder(payload.id, folderId);
        unpinItem(payload.id);
        renderNav(root, api);
        return;
      }
      if (mode === "library-root") {
        moveFolder(payload.id, null);
        unpinItem(payload.id);
        renderNav(root, api);
      }
    }
  });
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
