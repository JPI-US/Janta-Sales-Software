import {
  createFolder,
  createTemplate,
  listAllFoldersFlat,
  getState,
  getFolder,
} from "../lib/store.js";
import { PRESET_GROUPS, getPreset, renderPresetWireframe } from "../lib/presets.js";

function ensureUnfiledFolder() {
  const existing = getState().folders.find(
    (f) => !f.parentId && f.name.toLowerCase() === "unfiled",
  );
  if (existing) return existing;
  return createFolder({ name: "Unfiled", parentId: null });
}

function presetOptionLabel(p) {
  return `${p.label} · ${p.size}`;
}

function renderPresetMenuHtml(selectedId) {
  return PRESET_GROUPS.map(
    (g) => `
      <div class="preset-menu-group" role="group" aria-label="${escapeHtml(g.label)}">
        <div class="preset-menu-label">${escapeHtml(g.label)}</div>
        ${g.presets
          .map(
            (p) => `
          <button
            type="button"
            class="preset-menu-item ${p.id === selectedId ? "is-selected" : ""}"
            role="option"
            data-preset-id="${escapeHtml(p.id)}"
            aria-selected="${p.id === selectedId ? "true" : "false"}"
          >
            <span class="preset-menu-item-label">${escapeHtml(p.label)}</span>
            <span class="preset-menu-item-size">${escapeHtml(p.size)}</span>
          </button>`,
          )
          .join("")}
      </div>`,
  ).join("");
}

/**
 * @param {HTMLElement} mount
 * @param {{ onOpenBuilder: (id: string) => void, onOpenTemplate: (id: string) => void }} api
 */
export function renderHome(mount, api) {
  const folders = listAllFoldersFlat();
  const recent = getState()
    .templates.filter((t) => t.kind === "custom")
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 6);

  let selectedPresetId = "blank";
  const initialPreset = getPreset(selectedPresetId);

  mount.innerHTML = `
    <section class="home">
      <div class="home-layout">
        <div class="home-rail">
          <div class="home-hero">
            <p class="eyebrow">Home</p>
            <h1>Create email</h1>
          </div>

          <form class="home-card home-create-form" id="create-form">
            <label class="field">
              <span>Title</span>
              <input name="title" type="text" required placeholder="e.g. DC cold intro — Q3" autocomplete="off" />
            </label>

            <label class="field">
              <span>Folder <em class="field-optional">(optional)</em></span>
              <select name="folderId" id="folder-select">
                <option value="">None — save to Unfiled</option>
                ${folders
                  .map((f) => `<option value="${f.id}">${escapeHtml(f.label || f.name)}</option>`)
                  .join("")}
              </select>
            </label>

            <div class="field preset-field">
              <span id="preset-label">Preset</span>
              <input type="hidden" name="preset" id="preset-input" value="${escapeHtml(selectedPresetId)}" />
              <div class="preset-picker" id="preset-picker">
                <button
                  type="button"
                  class="preset-trigger"
                  id="preset-trigger"
                  aria-haspopup="listbox"
                  aria-expanded="false"
                  aria-labelledby="preset-label preset-trigger"
                >
                  <span class="preset-trigger-text" id="preset-trigger-text">${escapeHtml(presetOptionLabel(initialPreset))}</span>
                  <span class="preset-trigger-chevron" aria-hidden="true"></span>
                </button>
                <div class="preset-menu" id="preset-menu" role="listbox" hidden>
                  ${renderPresetMenuHtml(selectedPresetId)}
                </div>
              </div>
            </div>

            <div class="home-actions">
              <button type="submit" class="btn btn-primary">Open email builder</button>
            </div>
          </form>

          <div class="home-card home-card-soft home-recent-card">
            <h2>Recent custom</h2>
            ${
              recent.length
                ? `<ul class="home-recent">${recent
                    .map(
                      (t) =>
                        `<li><button type="button" data-open="${t.id}">${escapeHtml(t.title)}</button></li>`,
                    )
                    .join("")}</ul>`
                : `<p class="home-muted">No custom templates yet.</p>`
            }
          </div>
        </div>

        <aside class="home-stage" aria-label="Structure preview">
          <div class="home-stage-label">Structure preview</div>
          <div id="preset-wire" class="home-wire-mount">
            ${renderPresetWireframe(selectedPresetId)}
          </div>
        </aside>
      </div>
    </section>
  `;

  const form = mount.querySelector("#create-form");
  const presetInput = mount.querySelector("#preset-input");
  const presetPicker = mount.querySelector("#preset-picker");
  const presetTrigger = mount.querySelector("#preset-trigger");
  const presetTriggerText = mount.querySelector("#preset-trigger-text");
  const presetMenu = mount.querySelector("#preset-menu");
  const wireMount = mount.querySelector("#preset-wire");

  let paintRaf = 0;

  const paintWire = (presetId) => {
    if (!wireMount) return;
    const id = presetId || selectedPresetId || "blank";
    cancelAnimationFrame(paintRaf);
    paintRaf = requestAnimationFrame(() => {
      if (wireMount.dataset.previewId === id && wireMount.querySelector(".wire-frame-live")) return;
      wireMount.dataset.previewId = id;
      wireMount.innerHTML = renderPresetWireframe(id);
    });
  };

  const setSelectedPreset = (id, { paint = true } = {}) => {
    selectedPresetId = id || "blank";
    if (presetInput) presetInput.value = selectedPresetId;
    const preset = getPreset(selectedPresetId);
    if (presetTriggerText) presetTriggerText.textContent = presetOptionLabel(preset);
    presetMenu?.querySelectorAll(".preset-menu-item").forEach((btn) => {
      const active = btn.getAttribute("data-preset-id") === selectedPresetId;
      btn.classList.toggle("is-selected", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
    if (paint) paintWire(selectedPresetId);
  };

  const closePresetMenu = ({ restore = true } = {}) => {
    if (!presetMenu || presetMenu.hidden) return;
    presetMenu.hidden = true;
    presetPicker?.classList.remove("is-open");
    presetTrigger?.setAttribute("aria-expanded", "false");
    if (restore) paintWire(selectedPresetId);
  };

  const openPresetMenu = () => {
    if (!presetMenu) return;
    presetMenu.hidden = false;
    presetPicker?.classList.add("is-open");
    presetTrigger?.setAttribute("aria-expanded", "true");
  };

  const togglePresetMenu = () => {
    if (presetMenu?.hidden) openPresetMenu();
    else closePresetMenu({ restore: true });
  };

  presetTrigger?.addEventListener("click", (e) => {
    e.preventDefault();
    togglePresetMenu();
  });

  presetMenu?.addEventListener("pointerover", (e) => {
    const item = e.target.closest("[data-preset-id]");
    if (!item || !presetMenu.contains(item)) return;
    const id = item.getAttribute("data-preset-id");
    if (id) paintWire(id);
  });

  presetMenu?.addEventListener("click", (e) => {
    const item = e.target.closest("[data-preset-id]");
    if (!item || !presetMenu.contains(item)) return;
    const id = item.getAttribute("data-preset-id") || "blank";
    setSelectedPreset(id, { paint: true });
    closePresetMenu({ restore: false });
  });

  document.addEventListener("pointerdown", (e) => {
    if (!presetPicker || presetMenu?.hidden) return;
    if (presetPicker.contains(e.target)) return;
    closePresetMenu({ restore: true });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePresetMenu({ restore: true });
  });

  paintWire(selectedPresetId);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const title = String(fd.get("title") || "").trim();
    let folderId = String(fd.get("folderId") || "");
    const preset = String(fd.get("preset") || selectedPresetId || "blank");
    if (!title) return;
    if (!folderId || !getFolder(folderId)) {
      folderId = ensureUnfiledFolder().id;
    }
    const tpl = createTemplate({ title, folderId, preset });
    api.onOpenBuilder(tpl.id);
  });

  mount.querySelectorAll("[data-open]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-open");
      const t = getState().templates.find((x) => x.id === id);
      if (!t) return;
      if (t.kind === "custom") api.onOpenBuilder(t.id);
      else api.onOpenTemplate(t.id);
    });
  });
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
