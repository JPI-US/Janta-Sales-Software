/**
 * Simple context menu helper.
 * @param {{ x: number, y: number, items: { label: string, action?: () => void, disabled?: boolean, danger?: boolean, separator?: boolean }[] }} opts
 */
export function showContextMenu({ x, y, items }) {
  hideContextMenu();

  const menu = document.createElement("div");
  menu.className = "ctx-menu";
  menu.setAttribute("role", "menu");
  menu.id = "janta-ctx-menu";

  for (const item of items) {
    if (item.separator) {
      const hr = document.createElement("div");
      hr.className = "ctx-sep";
      menu.appendChild(hr);
      continue;
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `ctx-item ${item.danger ? "is-danger" : ""}`;
    btn.setAttribute("role", "menuitem");
    btn.textContent = item.label;
    btn.disabled = Boolean(item.disabled);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      hideContextMenu();
      item.action?.();
    });
    menu.appendChild(btn);
  }

  document.body.appendChild(menu);

  const pad = 8;
  const rect = menu.getBoundingClientRect();
  let left = x;
  let top = y;
  if (left + rect.width > window.innerWidth - pad) left = window.innerWidth - rect.width - pad;
  if (top + rect.height > window.innerHeight - pad) top = window.innerHeight - rect.height - pad;
  menu.style.left = `${Math.max(pad, left)}px`;
  menu.style.top = `${Math.max(pad, top)}px`;

  const onDown = (e) => {
    if (menu.contains(e.target)) return;
    // Ignore the opening gesture / other buttons so the menu isn't dismissed instantly
    if (e.button === 2) return;
    hideContextMenu();
  };
  const onKey = (e) => {
    if (e.key === "Escape") hideContextMenu();
  };
  const onCtx = (e) => {
    if (!menu.contains(e.target)) hideContextMenu();
  };
  // Defer bind so the opening contextmenu/mouseup doesn't close us
  setTimeout(() => {
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("contextmenu", onCtx, true);
  }, 0);
  menu._cleanup = () => {
    document.removeEventListener("pointerdown", onDown, true);
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("contextmenu", onCtx, true);
  };
}

export function hideContextMenu() {
  const menu = document.getElementById("janta-ctx-menu");
  if (!menu) return;
  menu._cleanup?.();
  menu.remove();
}
