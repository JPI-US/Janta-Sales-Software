import {
  getTemplate,
  updateTemplate,
  uid,
  folderPath,
  listModules,
  saveModule,
  deleteModule,
  getModule,
  deleteTemplate,
} from "../lib/store.js";
import { compileEmailHtml, formatBytes, renderBlock, renderBlockCell, estimateEmailBytes, emailSizeLevel, GMAIL_MESSAGE_LIMIT_BYTES, MAX_EMBEDDED_IMAGE_BYTES, copyRichHtmlToClipboard, compilePlainText } from "../lib/compile.js";
import {
  enableGridLayout,
  ensureDocGrid,
  ensureCanvas,
  defaultSpanForType,
  normalizeBlockGrid,
  normalizeBlockPadding,
  fitBlockGridHeight,
  findNextSlot,
  findSlotAtCanvasEdge,
  placeBlockAtCanvasEdge,
  resolveCollision,
  snapPxToGrid,
  snapSizeToGrid,
  previewLayoutShift,
  applyLayoutPositions,
  previewResizeShift,
  blockFrameStyle,
  syncImageWidthFromGrid,
  refitImageBlockFromSrc,
  fitImageBlockToGrid,
  measureImageDisplayHeight,
  contentBottom,
  rectsOverlap,
  PHANTOM_ID,
  pushOverlapsBelow,
  blockFitsCanvasRows,
  clampBlockGridPos,
  clampLayoutPositions,
  canvasRowLimit,
  CANVAS_ROWS_MIN,
  CANVAS_ROWS_MAX,
  CANVAS_ROWS_DEFAULT,
  CANVAS_WIDTH_MIN,
  CANVAS_WIDTH_MAX,
  CANVAS_WIDTH_DEFAULT,
} from "../lib/grid.js";
import {
  isContainerType,
  ensureChildren,
  findBlockAnywhere,
  findBlockPath,
  getScopeBlocks,
  getScopeParent,
  scopeCanvasWidth,
  scopeGrid,
  placeChildInScope,
} from "../lib/nesting.js";
import { plainToHtml, richToolbarHtml, wireRichEditor, sanitizeRichHtml } from "../lib/richtext.js";
import { runQa } from "../lib/qa.js";

const SEGMENTS = [
  { type: "header", label: "Header", hint: "Brand bar — drag like any block" },
  { type: "text", label: "Text", hint: "Resizable text addon" },
  { type: "image", label: "Image", hint: "Photo or GIF addon" },
  { type: "button", label: "Button", hint: "CTA button addon" },
  { type: "metrics", label: "Metrics", hint: "Proof numbers addon" },
  { type: "columns", label: "Columns", hint: "Two columns" },
  { type: "callout", label: "Callout", hint: "Highlighted box" },
  { type: "list", label: "List", hint: "Bullet list addon" },
  { type: "divider", label: "Divider", hint: "Hairline" },
  { type: "footer", label: "Footer", hint: "Links, social, logos" },
  { type: "custom", label: "Custom", hint: "Fully custom section" },
];

/** @type {{ id: string, label: string, types: string[] }[]} */
const SEGMENT_GROUPS = [
  { id: "essentials", label: "Essentials", types: ["header", "text", "button", "image"] },
  { id: "copy", label: "More", types: ["list", "callout", "columns", "metrics"] },
  { id: "structure", label: "Spacing", types: ["divider", "footer"] },
  { id: "custom", label: "Custom", types: ["custom"] },
];

/** Preset label colors for Order panel (not exported to email HTML). */
/** Preset label colors for Order panel — 2×13, hue order (bright / deep). */
const LAYER_LABEL_COLORS = [
  // Row 1 — bright
  "#ef4444",
  "#f97316",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#f8fafc",
  "#3a84dc",
  // Row 2 — deep / muted
  "#9f1239",
  "#9a3412",
  "#854d0e",
  "#3f6212",
  "#065f46",
  "#115e59",
  "#0e7490",
  "#1e3a8a",
  "#4c1d95",
  "#86198f",
  "#1a2332",
  "#64748b",
  "#0f172a",
];

const PREVIEW_WIDTHS = { desktop: CANVAS_WIDTH_DEFAULT, mobile: 375 };
const HISTORY_LIMIT = 60;

const TOOL_ICONS = {
  select: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4l7.5 17 2-6.5L20 12.5 4 4z"/></svg>`,
  fill: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m19.4 11.4-8.5-8.5a1.4 1.4 0 0 0-2 0L2.2 9.6a2.1 2.1 0 0 0 0 3l7.9 7.9a2.1 2.1 0 0 0 3 0l6.3-6.3a1.4 1.4 0 0 0 0-2z"/><path d="m8.5 6.5 9 9"/><path d="M3.5 20.5S6 19 7.5 17"/></svg>`,
  duplicate: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  trash: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>`,
  undo: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 1 1 0 11H13"/></svg>`,
  redo: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 1 0 0 11H11"/></svg>`,
  grid: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>`,
  eye: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`,
  edit: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`,
};

/**
 * @param {HTMLElement} mount
 * @param {string} templateId
 * @param {{ onBack: () => void, onCopyHtml?: (payload: object) => void, registerFlushSave?: (fn: () => void) => void }} api
 */
export function renderBuilder(mount, templateId, api) {
  const template = getTemplate(templateId);
  if (!template || template.kind !== "custom") {
    mount.innerHTML = `<div class="home"><p class="home-muted">Built-in templates are read-only. Use <strong>Edit a copy</strong> on a built-in, or create a custom draft from Home.</p><button type="button" class="btn btn-ghost" id="back">Back</button></div>`;
    mount.querySelector("#back")?.addEventListener("click", api.onBack);
    return;
  }

  let doc = structuredClone(template.doc) || { subject: "", preheader: "", blocks: [] };
  if (!Array.isArray(doc.blocks)) doc.blocks = [];
  // One unified canvas editor (migrates older stack docs automatically)
  enableGridLayout(doc);
  let selectedId = doc.blocks[0]?.id || null;
  /** @type {Set<string>} */
  let selectedIds = new Set(selectedId ? [selectedId] : []);
  /** @type {null | "canvas"} — email canvas base vs addon elements */
  let canvasFocus = null;
  /** @type {string | null} — when set, editing inside this section (children only; outer canvas frozen) */
  let editScopeId = null;
  /** @type {"select" | "fill"} */
  let canvasTool = "select";
  let fillColor = "#3a84dc";
  let fillOpacity = 100;
  let scrollToSelected = false;
  /** @type {{ mode: "move" | "new" | "module", id?: string, type?: string } | null} */
  let dragPayload = null;
  /** Set when a palette drop successfully inserts/moves on the canvas (suppresses stray click). */
  let paletteDropSucceeded = false;
  /** Clears palette drop ghost / neighbor preview (set by wireGridInteractions). */
  let clearCanvasDropPreview = () => {};
  /** @type {Map<string, { bgColor: string, bgOpacity: number }>} */
  const bgColorUndo = new Map();
  let dirty = false;
  let saveTimer = null;
  /** @type {any[]} */
  const past = [];
  /** @type {any[]} */
  const future = [];
  let applyingHistory = false;
  /** @type {Set<string>} */
  const openCats = new Set(["essentials"]);
  let segFilter = "";
  /** Viewport pan/zoom (survives refresh) */
  let viewZoom = 1;
  let viewPanX = null; // null = auto-center on next apply
  let viewPanY = null;
  const VIEW_ZOOM_MIN = 0.2;
  const VIEW_ZOOM_MAX = 2.5;
  let viewKeyCleanup = null;
  let viewCenteredOnce = false;
  let viewDidPan = false;
  let resizing = false;
  /** @type {string | null} */
  let inlineEditId = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let selectClickTimer = null;
  /** @type {"order" | "edit"} */
  let inspTab = "edit";
  /** Locked canvas = Gmail-accurate preview (no edit chrome). */
  let gmailPreview = false;
  /** Studio guide lines on the canvas (not exported). */
  let showGridLines = (() => {
    try {
      return sessionStorage.getItem("janta-show-gridlines") !== "0";
    } catch {
      return true;
    }
  })();

  const TEXT_BOX_TYPES = new Set(["text", "callout", "custom", "list", "button"]);

  function snapshotDoc() {
    return structuredClone(doc);
  }

  function pushHistory() {
    if (applyingHistory) return;
    past.push(snapshotDoc());
    if (past.length > HISTORY_LIMIT) past.shift();
    future.length = 0;
    paintHistoryButtons();
  }

  function undo() {
    if (!past.length) return;
    future.push(snapshotDoc());
    applyingHistory = true;
    doc = past.pop();
    pruneSelection();
    if (!doc.blocks.find((b) => b.id === selectedId)) {
      setSelection(doc.blocks[0] ? [doc.blocks[0].id] : []);
    }
    applyingHistory = false;
    markDirty();
    scheduleSave();
    refresh();
  }

  function redo() {
    if (!future.length) return;
    past.push(snapshotDoc());
    applyingHistory = true;
    doc = future.pop();
    pruneSelection();
    if (!doc.blocks.find((b) => b.id === selectedId)) {
      setSelection(doc.blocks[0] ? [doc.blocks[0].id] : []);
    }
    applyingHistory = false;
    markDirty();
    scheduleSave();
    refresh();
  }

  function paintHistoryButtons() {
    const u = mount.querySelector("#btn-undo");
    const r = mount.querySelector("#btn-redo");
    if (u) u.disabled = !past.length;
    if (r) r.disabled = !future.length;
  }

  function markDirty() {
    dirty = true;
    const el = mount.querySelector("#save-status");
    if (el) {
      el.textContent = "Unsaved";
      el.classList.add("is-dirty");
    }
  }

  function markClean() {
    dirty = false;
    const el = mount.querySelector("#save-status");
    if (el) {
      el.textContent = "Saved";
      el.classList.remove("is-dirty");
    }
  }

  function persistNow(partial = {}) {
    updateTemplate(templateId, {
      title: partial.title ?? mount.querySelector("#tpl-title")?.value ?? template.title,
      doc,
      attachments: doc.blocks.find((b) => b.type === "attachments")?.items || [],
    });
    Object.assign(template, getTemplate(templateId));
    markClean();
  }

  function scheduleSave(partial = {}) {
    markDirty();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persistNow(partial), 450);
  }

  function save(partial = {}) {
    clearTimeout(saveTimer);
    persistNow(partial);
  }

  function mutate(fn, { refreshUi = true, soft = false } = {}) {
    pushHistory();
    fn();
    scheduleSave();
    if (soft) softPaint();
    else if (refreshUi) refresh();
  }

  function selected() {
    if (!selectedId) return null;
    return findBlockAnywhere(doc, selectedId) || doc.blocks.find((b) => b.id === selectedId) || null;
  }

  function selectedBlocks() {
    return [...selectedIds].map((id) => findBlockAnywhere(doc, id)).filter(Boolean);
  }

  function scopeList() {
    return getScopeBlocks(doc, editScopeId);
  }

  function activeGrid() {
    return editScopeId ? scopeGrid(doc) : ensureDocGrid(doc);
  }

  function activeSheetWidth() {
    if (editScopeId) return scopeCanvasWidth(doc, editScopeId, sheetWidth());
    return sheetWidth();
  }

  function enterScope(id) {
    const b = findBlockAnywhere(doc, id);
    if (!b || !isContainerType(b.type)) return;
    ensureChildren(b);
    editScopeId = id;
    canvasFocus = null;
    setSelection([]);
    inlineEditId = null;
    inspTab = "edit";
    refresh();
  }

  function exitScope() {
    if (!editScopeId) return;
    const leaving = editScopeId;
    const path = findBlockPath(doc, leaving);
    editScopeId = path && path.length > 1 ? path[path.length - 2].id : null;
    setSelection([leaving], { primary: leaving });
    refresh();
  }

  function removeBlockById(id) {
    const path = findBlockPath(doc, id);
    if (!path?.length) {
      doc.blocks = doc.blocks.filter((b) => b.id !== id);
      return;
    }
    if (path.length === 1) {
      doc.blocks = doc.blocks.filter((b) => b.id !== id);
    } else {
      const parent = path[path.length - 2];
      parent.children = (parent.children || []).filter((b) => b.id !== id);
    }
    if (editScopeId === id) editScopeId = path.length > 1 ? path[path.length - 2].id : null;
  }

  function setSelection(ids, { primary = null, scroll = false } = {}) {
    const list = [...new Set((ids || []).filter(Boolean))];
    selectedIds = new Set(list);
    if (primary && selectedIds.has(primary)) selectedId = primary;
    else selectedId = list[list.length - 1] || null;
    if (list.length) canvasFocus = null;
    if (scroll) scrollToSelected = true;
  }

  function selectCanvasBase(_kind = "canvas") {
    canvasFocus = "canvas";
    selectedId = null;
    selectedIds = new Set();
    inspTab = "edit";
  }

  function pruneSelection() {
    selectedIds = new Set([...selectedIds].filter((id) => doc.blocks.some((b) => b.id === id)));
    if (!selectedIds.has(selectedId)) selectedId = [...selectedIds].at(-1) || null;
  }

  function applyFillToTargets(ids) {
    const targets = (ids || [])
      .map((id) => doc.blocks.find((b) => b.id === id))
      .filter((b) => b && !b.locked);
    if (!targets.length) return;
    pushHistory();
    for (const b of targets) {
      normalizeBgFields(b);
      b.bgColor = fillColor;
      b.bgOpacity = fillOpacity;
    }
    scheduleSave();
    refresh();
  }

  function sheetWidth() {
    const w = Number(doc.canvasWidth) || PREVIEW_WIDTHS.desktop;
    return Math.min(CANVAS_WIDTH_MAX, Math.max(CANVAS_WIDTH_MIN, w));
  }

  /** Content bottom on the root email canvas (not inside a section). */
  function rootContentBottom() {
    return contentBottom({
      blocks: doc.blocks || [],
      grid: ensureDocGrid(doc),
    });
  }

  /** Keep minRows in a valid range — do not auto-grow to content (height is user-controlled). */
  function syncMinRowsToContent() {
    if (editScopeId) return;
    const canvas = ensureCanvas(doc);
    const raw = Number(canvas.minRows) || CANVAS_ROWS_DEFAULT;
    canvas.minRows = Math.min(CANVAS_ROWS_MAX, Math.max(CANVAS_ROWS_MIN, raw));
  }

  /** Grow artboard toward content but never past CANVAS_ROWS_MAX. */
  function growCanvasToContent() {
    if (editScopeId) return;
    const canvas = ensureCanvas(doc);
    const bottom = rootContentBottom();
    canvas.minRows = Math.min(
      CANVAS_ROWS_MAX,
      Math.max(canvas.minRows || CANVAS_ROWS_DEFAULT, bottom, CANVAS_ROWS_MIN),
    );
  }

  /** Set canvas height in rows — capped at CANVAS_ROWS_MAX. */
  function setCanvasMinRows(rows) {
    const next = Math.min(
      CANVAS_ROWS_MAX,
      Math.max(CANVAS_ROWS_MIN, Math.round(Number(rows) || CANVAS_ROWS_DEFAULT)),
    );
    ensureCanvas(doc).minRows = next;
    return next;
  }

  function warnCanvasCapacity() {
    const rows = canvasRowLimit(doc);
    alert(
      `Email canvas is full (${rows} rows). Remove or rearrange blocks, or increase canvas height before adding more.`,
    );
  }

  function prepareBlockForCanvas(block) {
    const grid = ensureDocGrid(doc);
    normalizeBlockPadding(block);
    fitBlockGridHeight(block, grid);
    const span = defaultSpanForType(block.type, block, grid);
    block.gw = block.gw || span.gw;
    block.gh = block.gh || span.gh;
    return block;
  }

  function wouldExceedGmailAfterAdd(block, pos) {
    if (editScopeId) return false;
    const trial = structuredClone(doc);
    const b = structuredClone(block);
    Object.assign(b, pos);
    if (!b.id) b.id = uid("block");
    trial.blocks = [...(trial.blocks || []), b];
    const bytes = estimateEmailBytes(trial, { absoluteLogoOrigin: window.location.origin });
    if (bytes >= GMAIL_MESSAGE_LIMIT_BYTES) {
      alert(
        `Adding this block would exceed Gmail's ~${formatBytes(GMAIL_MESSAGE_LIMIT_BYTES)} message size limit (estimated ${formatBytes(bytes)}). Remove images or other heavy content first.`,
      );
      return true;
    }
    return false;
  }

  function canPlaceBlockAt(block, pos) {
    if (editScopeId) return true;
    const clamped = clampBlockGridPos(doc, {
      gx: pos.gx,
      gy: pos.gy,
      gw: block.gw || pos.gw,
      gh: block.gh || pos.gh,
    });
    Object.assign(pos, clamped);
    if (wouldExceedGmailAfterAdd(block, clamped)) return false;
    return true;
  }

  function canvasRowCap() {
    return editScopeId ? 240 : canvasRowLimit(doc);
  }

  function pushScopeOverlaps(blockId) {
    pushOverlapsBelow(scopeDoc(), blockId, canvasRowCap());
  }

  function paintArtboardFrame() {
    const sheet = mount.querySelector("#mail-sheet");
    const frame = mount.querySelector(".mail-artboard-frame");
    const root = mount.querySelector(".mail-canvas-root");
    const surface = mount.querySelector(".mail-grid-surface");
    const grid = activeGrid();
    if (editScopeId) {
      if (!surface) return;
      let maxRow = 8;
      for (const b of scopeList()) {
        normalizeBlockGrid(b, grid.cols);
        maxRow = Math.max(maxRow, b.gy + b.gh);
      }
      surface.style.minHeight = `${Math.max(360, maxRow * grid.rowHeight + 48)}px`;
      return;
    }
    syncMinRowsToContent();
    const w = sheetWidth();
    const rows = ensureCanvas(doc).minRows || CANVAS_ROWS_DEFAULT;
    const h = Math.max(CANVAS_ROWS_MIN * grid.rowHeight, rows * grid.rowHeight);
    if (sheet) {
      sheet.style.width = `${w}px`;
      sheet.style.maxWidth = `${w}px`;
    }
    if (frame) {
      frame.style.width = `${w}px`;
      frame.style.minHeight = `${h}px`;
    }
    if (root) root.style.minHeight = `${h}px`;
    if (surface) surface.style.minHeight = `${h}px`;
  }

  function paintSurfaceHeight() {
    paintArtboardFrame();
  }

  function deleteSelected() {
    const ids = [...selectedIds];
    if (!ids.length) return;
    const removable = ids.filter((id) => {
      const b = findBlockAnywhere(doc, id);
      return b && !b.locked;
    });
    if (!removable.length) return;
    mutate(() => {
      for (const id of removable) removeBlockById(id);
      const remain = scopeList();
      setSelection(remain[0] ? [remain[0].id] : []);
    });
  }

  function nudgeSelected(dx, dy) {
    const block = selected();
    if (!block || block.locked) return;
    pushHistory();
    const grid = activeGrid();
    normalizeBlockGrid(block, grid.cols);
    if (dx) block.gx = Math.max(0, Math.min(grid.cols - block.gw, block.gx + Math.sign(dx)));
    if (dy) block.gy = Math.max(0, block.gy + Math.sign(dy));
    resolveCollision(editScopeId ? { blocks: scopeList(), grid, canvasWidth: activeSheetWidth() } : doc, block.id);
    syncImageWidthFromGrid(block, activeSheetWidth(), grid.cols);
    scheduleSave();
    softPaint();
  }

  function insertAt(index, block) {
    if (!editScopeId) {
      prepareBlockForCanvas(block);
      const slot = findNextSlot(doc, block.gw, block.gh);
      if (!slot || !canPlaceBlockAt(block, slot)) return;
    }

    mutate(() => {
      if (isContainerType(block.type)) ensureChildren(block);

      if (editScopeId) {
        if (!block.labelColor) {
          block.labelColor = LAYER_LABEL_COLORS[scopeList().length % LAYER_LABEL_COLORS.length];
        }
        placeChildInScope(doc, editScopeId, block);
        if (block.type === "button") block.buttonFill = true;
        syncImageWidthFromGrid(block, activeSheetWidth(), activeGrid().cols);
        setSelection([block.id], { primary: block.id });
        return;
      }

      const i = Math.max(0, Math.min(index, doc.blocks.length));
      if (!block.labelColor) {
        block.labelColor = LAYER_LABEL_COLORS[i % LAYER_LABEL_COLORS.length];
      }
      const grid = ensureDocGrid(doc);
      normalizeBlockPadding(block);
      fitBlockGridHeight(block, grid);
      const span = defaultSpanForType(block.type, block, grid);
      block.gw = block.gw || span.gw;
      block.gh = block.gh || span.gh;
      const slot = findNextSlot(doc, block.gw, block.gh);
      if (!slot) return;
      Object.assign(block, slot);
      normalizeBlockGrid(block, grid.cols);
      syncImageWidthFromGrid(block, sheetWidth(), grid.cols);
      if (block.type === "button") block.buttonFill = true;
      doc.blocks.splice(i, 0, block);
      growCanvasToContent();
      setSelection([block.id], { primary: block.id });
    });
  }

  function addPaletteType(type) {
    if (!type) return;
    insertAt(doc.blocks.length, defaultBlock(type));
  }

  function addPaletteModule(moduleId) {
    const mod = getModule(moduleId);
    if (!mod?.block) return;
    const copy = structuredClone(mod.block);
    copy.id = uid("block");
    insertAt(doc.blocks.length, copy);
  }

  function isPointerOverCanvas(clientX, clientY) {
    const sheet = mount.querySelector("#mail-sheet");
    const stage = mount.querySelector("#mail-stage");
    const target = sheet || stage;
    if (!target) return false;
    const rect = target.getBoundingClientRect();
    return (
      clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
    );
  }

  /** Add a section at the top or bottom of the artboard without changing canvas height. */
  function insertSectionAtEdge(edge) {
    if (editScopeId) {
      editScopeId = null;
    }
    const block = defaultBlock("section");
    ensureChildren(block);
    prepareBlockForCanvas(block);
    const edgeName = edge === "top" ? "top" : "bottom";
    const slot = findSlotAtCanvasEdge(doc, block.gw, block.gh, edgeName);
    if (!slot || !canPlaceBlockAt(block, slot)) {
      if (!slot) warnCanvasCapacity();
      return;
    }
    mutate(() => {
      const lockedRows = ensureCanvas(doc).minRows;
      const placed = placeBlockAtCanvasEdge(doc, block, edgeName);
      if (!placed) return;
      ensureCanvas(doc).minRows = lockedRows;
      if (!block.labelColor) {
        block.labelColor = LAYER_LABEL_COLORS[doc.blocks.length % LAYER_LABEL_COLORS.length];
      }
      setSelection([block.id], { primary: block.id });
    });
  }

  function editPanelInnerHtml() {
    if (canvasFocus === "canvas") return canvasInspectorHtml(doc);
    const block = selected();
    if (selectedIds.size > 1) {
      return `<div class="multi-sel-panel">
          <p class="home-muted">${selectedIds.size} selected</p>
          <button type="button" class="btn btn-ghost" id="btn-fill-selection">Fill</button>
          <button type="button" class="btn btn-ghost" id="btn-hide-selection">Hide</button>
          <button type="button" class="btn btn-ghost" id="btn-clear-selection">Deselect</button>
        </div>`;
    }
    if (block) return inspectorHtml(block);
    return `<p class="home-muted">Click the white canvas to edit the email base, or an addon box to edit that element.</p>`;
  }

  function refreshEditPanel() {
    const panel = mount.querySelector('.insp-tab-panel[data-insp-panel="design"]');
    if (!panel) return;
    panel.innerHTML = editPanelInnerHtml();
    if (selectedIds.size > 1) wireMultiSelPanel();
    else if (canvasFocus === "canvas") wireCanvasInspector();
    else {
      const block = selected();
      if (block) wireInspector(block);
    }
  }

  function closeLayerColorMenus() {
    mount.querySelectorAll(".layer-color-menu.is-open").forEach((menu) => menu.classList.remove("is-open"));
  }

  function wireInspTabs() {
    mount.querySelectorAll("[data-insp-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.getAttribute("data-insp-tab");
        if (!tab || tab === inspTab) return;
        inspTab = /** @type {"order" | "edit"} */ (tab);
        mount.querySelectorAll("[data-insp-tab]").forEach((el) => {
          const on = el.getAttribute("data-insp-tab") === inspTab;
          el.classList.toggle("is-active", on);
          el.setAttribute("aria-selected", on ? "true" : "false");
        });
        mount.querySelectorAll(".insp-tab-panel").forEach((panel) => {
          const panelId = panel.getAttribute("data-insp-panel");
          const on = (inspTab === "order" && panelId === "layers") || (inspTab === "edit" && panelId === "design");
          panel.classList.toggle("is-hidden", !on);
        });
        closeLayerColorMenus();
        const main = mount.closest(".main");
        if (main) {
          main.scrollTop = 0;
          main.scrollLeft = 0;
        }
      });
    });
  }

  function moveTo(fromId, toIndex) {
    mutate(() => {
      const from = doc.blocks.findIndex((b) => b.id === fromId);
      if (from < 0) return;
      const [item] = doc.blocks.splice(from, 1);
      let idx = toIndex;
      if (from < toIndex) idx -= 1;
      idx = Math.max(0, Math.min(idx, doc.blocks.length));
      doc.blocks.splice(idx, 0, item);
      setSelection([item.id], { primary: item.id });
    });
  }

  function handleDropAt(index) {
    if (!dragPayload) return;
    if (dragPayload.mode === "new" && dragPayload.type) {
      insertAt(index, defaultBlock(dragPayload.type));
    } else if (dragPayload.mode === "module" && dragPayload.id) {
      const mod = getModule(dragPayload.id);
      if (mod?.block) {
        const copy = structuredClone(mod.block);
        copy.id = uid("block");
        insertAt(index, copy);
      }
    } else if (dragPayload.mode === "move" && dragPayload.id) {
      moveTo(dragPayload.id, index);
    }
    dragPayload = null;
  }

  function isFileDrag(e) {
    const types = e.dataTransfer?.types;
    if (!types) return false;
    return [...types].includes("Files");
  }

  function imageFilesFrom(list) {
    return [...(list || [])].filter((f) => f && (f.type.startsWith("image/") || /\.gif$/i.test(f.name || "")));
  }

  async function applyImageFileToBlock(block, file) {
    const dataUrl = await readAsDataURL(file);
    if (block.type === "image") {
      block.src = dataUrl;
      block.alt = block.alt || file.name;
      block.ghManual = false;
      normalizeBlockGrid(block, activeGrid().cols);
      syncImageWidthFromGrid(block, activeSheetWidth(), activeGrid().cols);
      await refitImageBlockFromSrc(block, activeGrid(), activeSheetWidth());
    } else if (block.type === "custom") {
      block.imageSrc = dataUrl;
      block.showImage = true;
      block.imageAlt = block.imageAlt || file.name;
      if ((block.imagePosition === "left" || block.imagePosition === "right") && (!block.imageWidth || block.imageWidth > 280)) {
        block.imageWidth = 200;
      }
    } else {
      block.bgImage = dataUrl;
      block.bgSize = block.bgSize || "cover";
    }
  }

  async function ingestDroppedImages(files, { index = null, targetId = null } = {}) {
    const images = imageFilesFrom(files);
    if (!images.length) return false;

    const target =
      (targetId && doc.blocks.find((b) => b.id === targetId)) ||
      selected() ||
      null;

    let primaryId = null;

    if (target && (target.type === "image" || target.type === "custom") && !target.locked) {
      if (rejectOversizedImage(images[0])) return true;
      pushHistory();
      await applyImageFileToBlock(target, images[0]);
      primaryId = target.id;
      // Extra files become new image blocks after the target
      const at = doc.blocks.findIndex((b) => b.id === target.id) + 1;
      for (let i = 1; i < images.length; i++) {
        if (rejectOversizedImage(images[i])) continue;
        const block = defaultBlock("image");
        block.src = await readAsDataURL(images[i]);
        block.alt = images[i].name;
        block.width = 220;
        block.layout = "left";
        block.html = "Add copy beside this GIF…";
        await refitImageBlockFromSrc(block, activeGrid(), activeSheetWidth());
        doc.blocks.splice(at + i - 1, 0, block);
      }
    } else {
      pushHistory();
      let at = index != null ? index : doc.blocks.length;
      for (const file of images) {
        if (rejectOversizedImage(file)) continue;
        const block = defaultBlock("image");
        block.src = await readAsDataURL(file);
        block.alt = file.name;
        if (images.length === 1) {
          // Side-by-side ready default for a single GIF drop onto empty canvas
          block.width = 220;
          block.layout = "left";
          block.html = "Add copy beside this GIF…";
          block.align = "left";
        }
        await refitImageBlockFromSrc(block, activeGrid(), activeSheetWidth());
        doc.blocks.splice(at, 0, block);
        if (!primaryId) primaryId = block.id;
        at += 1;
      }
    }

    if (primaryId) setSelection([primaryId], { primary: primaryId });
    scheduleSave();
    refresh();
    return true;
  }

  function renderMailSheetBlocks(sheetW) {
    const grid = activeGrid();
    const canvas = ensureCanvas(doc);
    const scopeParent = editScopeId ? getScopeParent(doc, editScopeId) : null;
    const workingW = activeSheetWidth();
    const addonBlocks = scopeList();
    if (!editScopeId) syncMinRowsToContent();
    let maxRow = editScopeId ? 8 : canvas.minRows || 16;
    if (editScopeId) {
      for (const b of addonBlocks) {
        normalizeBlockGrid(b, grid.cols);
        maxRow = Math.max(maxRow, b.gy + b.gh);
      }
    }
    const minH = editScopeId
      ? Math.max(360, maxRow * grid.rowHeight + 48)
      : Math.max(CANVAS_ROWS_MIN * grid.rowHeight, (canvas.minRows || CANVAS_ROWS_DEFAULT) * grid.rowHeight);

    const path = editScopeId ? findBlockPath(doc, editScopeId) || [] : [];
    const crumb = `
        <div class="mail-scope-bar">
          <button type="button" class="mail-scope-crumb" data-scope-goto="">Email canvas</button>
          ${path
            .map(
              (p, i) =>
                `<span class="mail-scope-sep">/</span><button type="button" class="mail-scope-crumb ${i === path.length - 1 ? "is-current" : ""}" data-scope-goto="${p.id}">${escapeHtml(p.segmentName || labelFor(p))}</button>`,
            )
            .join("")}
          <span class="mail-scope-hint">${editScopeId ? "Editing inside container — outer canvas is locked" : "Drag to place · resize handles on selected blocks"}</span>
        </div>`;

    const hitboxes = addonBlocks
      .map((b) => {
        if (isContainerType(b.type)) ensureChildren(b);
        normalizeBlockGrid(b, grid.cols);
        const frame = blockFrameStyle(b, workingW, grid);
        const childCount = b.children?.length || 0;
        const editing = inlineEditId === b.id;
        const cellW = b.gw * (workingW / grid.cols);
        return `
            <div class="mail-seg is-grid-item is-addon ${isContainerType(b.type) ? "is-container" : ""} ${selectedIds.has(b.id) ? "is-active" : ""} ${selectedIds.has(b.id) && selectedIds.size > 1 ? "is-multi" : ""} ${b.hidden ? "is-layer-hidden" : ""} ${b.locked ? "is-locked" : ""} ${editing ? "is-inline-editing" : ""}" data-seg-id="${b.id}" data-seg-type="${escapeHtml(b.type)}" draggable="false" style="${frame}">
              <div class="mail-seg-tools">
                <span class="mail-seg-label">${labelFor(b)}${isContainerType(b.type) ? ` · ${childCount} inside` : ""}${b.locked ? " · locked" : ""}</span>
                ${
                  editScopeId
                    ? ""
                    : `<button type="button" class="mail-seg-tool-btn" data-save-mod="${b.id}" title="Save to Blocks → Saved">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>
                </button>`
                }
                <button type="button" class="mail-seg-tool-btn" data-dup="${b.id}" title="Duplicate" ${b.locked ? "disabled" : ""}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
                <button type="button" class="mail-seg-tool-btn" data-del="${b.id}" title="Delete" ${b.locked ? "disabled" : ""}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
                </button>
              </div>
              <div class="mail-seg-content" data-select="${b.id}">
                ${renderBlockCell(
                  { ...b, contentWidth: 100, buttonFill: b.type === "button" },
                  { cellWidth: cellW, gridCell: true },
                  cellW,
                )}
              </div>
              ${b.id === selectedId && selectedIds.size === 1 && !b.locked ? gridResizeChromeHtml(b.type) : ""}
            </div>`;
      })
      .join("");

    const surfaceInner = `
            <div class="mail-grid-lines ${showGridLines ? "" : "is-hidden"}" aria-hidden="true" style="background-size:${(workingW / grid.cols).toFixed(2)}px ${grid.rowHeight}px;"></div>
            <div class="mail-align-guides" id="mail-align-guides" aria-hidden="true"></div>
            <div class="mail-insert-line" id="mail-insert-line" hidden aria-hidden="true"></div>
            <div class="mail-snap-ghost" id="mail-snap-ghost" hidden aria-hidden="true"></div>
            ${hitboxes || emptyCanvasHintHtml(editScopeId, minH, grid.rowHeight)}`;

    if (editScopeId && scopeParent) {
      ensureChildren(scopeParent);
      const inset = scopeParent.padX ?? 28;
      const insetY = Math.min(scopeParent.padTop ?? 28, scopeParent.padBottom ?? 28);
      return `
          ${crumb}
          <div class="mail-canvas-root is-scope-editing" data-select-base="scope" style="background:${escapeHtml(safeHex(scopeParent.bgColor || canvas.bgColor, "#ffffff"))};width:${workingW}px;max-width:100%;padding:${insetY}px ${inset}px;box-sizing:content-box;">
            <div class="mail-grid-surface" style="min-height:${minH}px;" data-grid-surface="1">
              ${surfaceInner}
            </div>
            <span class="mail-canvas-chip">Inside section</span>
          </div>`;
    }

    const canvasBg = canvas.bgColor || "#ffffff";
    return `
        ${crumb}
        <div class="mail-artboard-frame" data-artboard-frame="1">
          <div class="mail-canvas-root ${canvasFocus === "canvas" ? "is-canvas-selected" : ""}" data-select-base="canvas" style="background:${escapeHtml(canvasBg)};">
            <div class="mail-grid-surface" style="min-height:${minH}px;" data-grid-surface="1">
              ${surfaceInner}
            </div>
            <span class="mail-canvas-chip">Email canvas</span>
          </div>
          ${
            `<div class="mail-artboard-handle is-width" data-resize="artboard" title="Resize email width" aria-label="Resize email width"></div>
                 <div class="mail-artboard-handle is-height" data-resize="artboard-height" title="Resize email height" aria-label="Resize email height"></div>`
          }
        </div>`;
  }

  function refresh() {
    const path = folderPath(template.folderId).join(" / ");
    const block = selected();
    const modules = listModules();
    const sheetW = sheetWidth();
    const filter = segFilter.trim().toLowerCase();
    const segmentByType = Object.fromEntries(SEGMENTS.map((s) => [s.type, s]));
    const paletteGroupsHtml = SEGMENT_GROUPS.map((group) => {
      const items = group.types
        .map((t) => segmentByType[t])
        .filter(Boolean)
        .filter(
          (s) =>
            !filter ||
            s.label.toLowerCase().includes(filter) ||
            s.hint.toLowerCase().includes(filter) ||
            s.type.includes(filter),
        );
      if (!items.length) return "";
      const open = filter ? true : openCats.has(group.id);
      return `
        <div class="seg-cat ${open ? "is-open" : ""}" data-cat="${group.id}">
          <button type="button" class="seg-cat-head" data-cat-toggle="${group.id}">
            <span>${group.label}</span>
            <span class="seg-cat-chevron" aria-hidden="true"></span>
          </button>
          <div class="seg-cat-body">
            ${items
              .map(
                (s) => `
              <div class="seg-item" role="button" tabindex="0" draggable="true" data-new-type="${s.type}" title="${escapeHtml(s.hint)} — click or drag">
                <span class="seg-item-ico seg-ico-${s.type}" aria-hidden="true"></span>
                <span class="seg-item-text">
                  <span class="seg-item-label">${s.label}</span>
                </span>
              </div>`,
              )
              .join("")}
          </div>
        </div>`;
    }).join("");

    const filteredModules = modules.filter(
      (m) => !filter || m.name.toLowerCase().includes(filter),
    );
    const modulesHtml = `
      <div class="seg-cat ${openCats.has("modules") || filter ? "is-open" : ""}" data-cat="modules">
        <button type="button" class="seg-cat-head" data-cat-toggle="modules">
          <span>Saved</span>
          <span class="seg-cat-count">${modules.length}</span>
          <span class="seg-cat-chevron" aria-hidden="true"></span>
        </button>
        <div class="seg-cat-body">
          <button type="button" class="seg-item seg-item-create" id="btn-new-custom-seg" title="Create a reusable custom segment">
            <span class="seg-item-ico seg-ico-plus" aria-hidden="true"></span>
            <span class="seg-item-text">
              <span class="seg-item-label">Save new…</span>
            </span>
          </button>
          ${
            filteredModules.length
              ? filteredModules
                  .map(
                    (m) => `
              <div class="seg-item seg-item-module" role="button" tabindex="0" draggable="true" data-module-id="${m.id}" title="Click or drag to add">
                <span class="seg-item-ico seg-ico-module" aria-hidden="true"></span>
                <span class="seg-item-text">
                  <span class="seg-item-label">${escapeHtml(m.name)}</span>
                </span>
                <span class="seg-mod-del" data-module-del="${m.id}" title="Remove">×</span>
              </div>`,
                  )
                  .join("")
              : filter
                ? ""
                : `<p class="seg-empty">Save a section from the canvas to reuse it here.</p>`
          }
        </div>
      </div>`;

    mount.innerHTML = `
      <div class="builder builder-live">
        <div class="builder-top">
          <div class="builder-top-left">
            <button type="button" class="btn btn-ghost builder-back" id="btn-back-library" title="Back to all emails">← All emails</button>
            <p class="eyebrow">${escapeHtml(path || "Library")}</p>
            <input class="builder-title" id="tpl-title" value="${escapeHtml(template.title)}" />
          </div>
          <div class="toolbar-actions">
            <span class="save-status ${dirty ? "is-dirty" : ""}" id="save-status">${dirty ? "Unsaved" : "Saved"}</span>
            <div class="email-size" id="email-size" title="Estimated HTML size vs Gmail’s ~25 MB message limit"></div>
            <button type="button" class="btn btn-ghost btn-icon" id="btn-undo" title="Undo" aria-label="Undo" ${past.length ? "" : "disabled"}>
              ${TOOL_ICONS.undo}
            </button>
            <button type="button" class="btn btn-ghost btn-icon" id="btn-redo" title="Redo" aria-label="Redo" ${future.length ? "" : "disabled"}>
              ${TOOL_ICONS.redo}
            </button>
            <button type="button" class="btn btn-ghost btn-icon btn-danger-icon" id="btn-delete-email" title="Delete email" aria-label="Delete email">
              ${TOOL_ICONS.trash}
            </button>
            <button type="button" class="btn btn-ghost btn-copy-html" id="btn-copy" title="Copy rich HTML for Gmail" aria-label="Copy HTML">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              <span>HTML</span>
            </button>
            <button type="button" class="btn btn-primary" id="btn-save">Save</button>
          </div>
        </div>

        <div class="builder-stage">
          <aside class="seg-palette">
            <div class="seg-palette-head">
              <p class="builder-label">Blocks</p>
              <input type="search" class="seg-filter" id="seg-filter" placeholder="Search…" value="${escapeHtml(segFilter)}" />
            </div>
            <div class="seg-palette-scroll">
              ${paletteGroupsHtml}
              ${modulesHtml}
              ${!paletteGroupsHtml && !filteredModules.length ? `<p class="seg-empty">No matches</p>` : ""}
            </div>
            <button type="button" class="btn btn-ghost seg-palette-clear" id="btn-clear" ${doc.blocks.length ? "" : "disabled"}>Clear email</button>
          </aside>

          <section class="mail-stage tool-${canvasTool} ${gmailPreview ? "is-gmail-preview" : ""}" id="mail-stage">
            ${
              gmailPreview
                ? ""
                : `<div class="canvas-tool-rail" role="toolbar" aria-label="Canvas tools">
              <button type="button" class="canvas-tool-btn ${canvasTool === "select" ? "is-active" : ""}" data-canvas-tool="select" title="Select (V) — Shift+click multi" aria-label="Select">${TOOL_ICONS.select}</button>
              <button type="button" class="canvas-tool-btn ${canvasTool === "fill" ? "is-active" : ""}" data-canvas-tool="fill" title="Fill background (F)" aria-label="Fill">${TOOL_ICONS.fill}</button>
              <label class="canvas-fill-swatch" title="Fill color">
                <input type="color" id="fill-color" value="${escapeHtml(safeHex(fillColor, "#3a84dc"))}" />
              </label>
              <span class="canvas-tool-sep" aria-hidden="true"></span>
              <button type="button" class="canvas-tool-btn" data-tool-action="duplicate" title="Duplicate" aria-label="Duplicate" ${!selectedIds.size || selectedBlocks().every((b) => b.locked) ? "disabled" : ""}>${TOOL_ICONS.duplicate}</button>
              <button type="button" class="canvas-tool-btn canvas-tool-btn-danger" data-tool-action="delete" title="Delete" aria-label="Delete" ${!selectedIds.size || selectedBlocks().every((b) => b.locked) ? "disabled" : ""}>${TOOL_ICONS.trash}</button>
            </div>`
            }
            <div class="mail-view-hud" id="mail-view-hud">
              <button type="button" class="mail-view-btn ${gmailPreview ? "is-active" : ""}" id="view-gmail-toggle" title="${gmailPreview ? "Back to editor" : "Preview in Gmail"}" aria-label="${gmailPreview ? "Back to editor" : "Preview in Gmail"}" aria-pressed="${gmailPreview ? "true" : "false"}">
                ${gmailPreview ? TOOL_ICONS.edit : TOOL_ICONS.eye}
              </button>
              <button type="button" class="mail-view-btn ${showGridLines ? "is-active" : ""}" id="view-gridlines" title="${showGridLines ? "Hide gridlines" : "Show gridlines"}" aria-label="${showGridLines ? "Hide gridlines" : "Show gridlines"}" aria-pressed="${showGridLines ? "true" : "false"}" ${gmailPreview ? "disabled" : ""}>${TOOL_ICONS.grid}</button>
              <span class="mail-view-sep" aria-hidden="true"></span>
              <button type="button" class="mail-view-btn" id="view-zoom-out" title="Zoom out" ${gmailPreview ? "disabled" : ""}>−</button>
              <button type="button" class="mail-view-btn mail-view-pct" id="view-zoom-label" title="Reset view" ${gmailPreview ? "disabled" : ""}>${Math.round(viewZoom * 100)}%</button>
              <button type="button" class="mail-view-btn" id="view-zoom-in" title="Zoom in" ${gmailPreview ? "disabled" : ""}>+</button>
            </div>
            ${
              gmailPreview
                ? `<div class="mail-gmail-frame" id="mail-gmail-frame">
                    <div class="mail-gmail-chrome" aria-hidden="true">
                      <span class="mail-gmail-dot"></span><span class="mail-gmail-dot"></span><span class="mail-gmail-dot"></span>
                      <span class="mail-gmail-label">Gmail preview</span>
                    </div>
                    <iframe id="gmail-preview-frame" title="Gmail preview"></iframe>
                  </div>`
                : `<div class="mail-world" id="mail-world">
              <div class="mail-world-plane" aria-hidden="true"></div>
              <div class="mail-sheet is-grid" id="mail-sheet" style="width:${sheetW}px;max-width:${sheetW}px;">
                ${renderMailSheetBlocks(sheetW)}
              </div>
            </div>`
            }
          </section>

          <aside class="seg-inspector">
            <div class="insp-tabs" role="tablist" aria-label="Inspector">
              <button
                type="button"
                role="tab"
                class="insp-tab ${inspTab === "order" ? "is-active" : ""}"
                data-insp-tab="order"
                aria-selected="${inspTab === "order" ? "true" : "false"}"
              >Order</button>
              <button
                type="button"
                role="tab"
                class="insp-tab ${inspTab === "edit" ? "is-active" : ""}"
                data-insp-tab="edit"
                aria-selected="${inspTab === "edit" ? "true" : "false"}"
              >Edit</button>
            </div>
            <div
              class="insp-tab-panel ${inspTab !== "order" ? "is-hidden" : ""}"
              data-insp-panel="layers"
              role="tabpanel"
            >
              ${layersPanelHtml(doc, selectedIds, canvasFocus)}
            </div>
            <div
              class="insp-tab-panel ${inspTab !== "edit" ? "is-hidden" : ""}"
              data-insp-panel="design"
              role="tabpanel"
            >
              ${editPanelInnerHtml()}
            </div>
            <div id="qa-panel" class="qa-panel is-hidden"></div>
          </aside>
        </div>
      </div>
    `;

    wireChrome();
    wirePalette();
    wireMailViewHud();
    if (gmailPreview) {
      paintGmailPreviewFrame();
    } else {
      wireCanvas();
      wireViewport();
      wireToolRail();
      wireResizeHandles();
      wireGridInteractions();
      wireInlineEdit();
    }
    wireInspTabs();
    wireLayerRows();
    wireInspector(selectedIds.size <= 1 ? block : null);
    wireMultiSelPanel();
    paintHistoryButtons();
    paintEmailSize();
    if (!gmailPreview && scrollToSelected && selectedId) {
      scrollToSelected = false;
      requestAnimationFrame(() => scrollSegIntoCamera(selectedId));
    }
    api.registerFlushSave?.(() => save({ title: mount.querySelector("#tpl-title")?.value }));
    const main = mount.closest(".main");
    if (main) {
      main.scrollTop = 0;
      main.scrollLeft = 0;
    }
  }

  function paintGmailPreviewFrame() {
    requestAnimationFrame(() => {
      const frame = mount.querySelector("#gmail-preview-frame");
      if (!frame) return;
      try {
        const html = compileEmailHtml(doc, { absoluteLogoOrigin: window.location.origin });
        frame.srcdoc = html;
      } catch (err) {
        console.error("Gmail preview failed", err);
        frame.srcdoc = `<!DOCTYPE html><html><body style="margin:0;padding:24px;font-family:sans-serif;color:#b91c1c">Preview failed: ${escapeHtml(String(err?.message || err))}</body></html>`;
      }
    });
  }

  function wireMailViewHud() {
    const stage = mount.querySelector("#mail-stage");

    mount.querySelector("#view-gmail-toggle")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      gmailPreview = !gmailPreview;
      if (gmailPreview) inlineEditId = null;
      refresh();
    });

    mount.querySelector("#view-gridlines")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (gmailPreview) return;
      showGridLines = !showGridLines;
      try {
        sessionStorage.setItem("janta-show-gridlines", showGridLines ? "1" : "0");
      } catch {
        /* ignore */
      }
      mount.querySelectorAll(".mail-grid-lines").forEach((el) => {
        el.classList.toggle("is-hidden", !showGridLines);
      });
      const btn = mount.querySelector("#view-gridlines");
      if (btn) {
        btn.classList.toggle("is-active", showGridLines);
        btn.setAttribute("aria-pressed", showGridLines ? "true" : "false");
        const label = showGridLines ? "Hide gridlines" : "Show gridlines";
        btn.title = label;
        btn.setAttribute("aria-label", label);
      }
    });

    mount.querySelector("#view-zoom-out")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (gmailPreview || !stage) return;
      const r = stage.getBoundingClientRect();
      setZoom(viewZoom / 1.15, r.left + r.width / 2, r.top + r.height / 2);
    });
    mount.querySelector("#view-zoom-in")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (gmailPreview || !stage) return;
      const r = stage.getBoundingClientRect();
      setZoom(viewZoom * 1.15, r.left + r.width / 2, r.top + r.height / 2);
    });
    mount.querySelector("#view-zoom-label")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (gmailPreview) return;
      resetView();
    });
  }

  function paintEmailSize() {
    const el = mount.querySelector("#email-size");
    if (!el) return;
    const bytes = estimateEmailBytes(doc, { absoluteLogoOrigin: window.location.origin });
    const limit = GMAIL_MESSAGE_LIMIT_BYTES;
    const level = emailSizeLevel(bytes, limit);
    const pct = Math.min(100, Math.round((bytes / limit) * 1000) / 10);
    el.className = `email-size is-${level}`;
    el.title = `Estimated HTML size vs Gmail’s ~${formatBytes(limit)} message limit`;
    el.innerHTML = `
      <span class="email-size-bar" aria-hidden="true"><span style="width:${pct}%"></span></span>
      <span class="email-size-label">${formatBytes(bytes)} / ${formatBytes(limit)}</span>
    `;
  }

  function rejectOversizedImage(file) {
    if (!file || file.size <= MAX_EMBEDDED_IMAGE_BYTES) return false;
    alert(
      `Keep images/GIFs under ${formatBytes(MAX_EMBEDDED_IMAGE_BYTES)}.\n\nThis file is ${formatBytes(file.size)}. Gmail’s whole-message limit is ~${formatBytes(GMAIL_MESSAGE_LIMIT_BYTES)} (embedded files grow ~33% as base64).`,
    );
    return true;
  }

  function centerView({ force = false } = {}) {
    const stage = mount.querySelector("#mail-stage");
    const sheet = mount.querySelector("#mail-sheet");
    if (!stage || !sheet) return;
    const sw = sheet.offsetWidth || PREVIEW_WIDTHS.desktop;
    const sh = Math.max(sheet.offsetHeight, 320);
    viewPanX = (stage.clientWidth - sw * viewZoom) / 2;
    viewPanY = Math.max(36, (stage.clientHeight - sh * viewZoom) / 5);
    viewCenteredOnce = true;
    if (force) applyViewTransform();
  }

  function applyViewTransform() {
    viewZoom = Math.min(VIEW_ZOOM_MAX, Math.max(VIEW_ZOOM_MIN, viewZoom));
    const stage = mount.querySelector("#mail-stage");
    const world = mount.querySelector("#mail-world");
    const sheet = mount.querySelector("#mail-sheet");
    if (!stage || !world || !sheet) return;

    if (viewPanX == null || viewPanY == null) {
      centerView();
    }

    const stageW = stage.clientWidth;
    const stageH = stage.clientHeight;
    const sheetW = sheet.offsetWidth || 600;
    const sheetH = Math.max(sheet.offsetHeight, 200);
    // Soft clamp: email can leave the frame, but not vanish completely
    const margin = Math.min(stageW, stageH) * 0.35;
    const minX = margin - sheetW * viewZoom;
    const maxX = stageW - margin;
    const minY = margin - sheetH * viewZoom;
    const maxY = stageH - margin;
    viewPanX = Math.min(maxX, Math.max(minX, viewPanX));
    viewPanY = Math.min(maxY, Math.max(minY, viewPanY));

    world.style.transform = `translate(${viewPanX}px, ${viewPanY}px) scale(${viewZoom})`;
    const label = mount.querySelector("#view-zoom-label");
    if (label) label.textContent = `${Math.round(viewZoom * 100)}%`;
    stage.classList.toggle(
      "is-zoomed",
      Math.abs(viewZoom - 1) > 0.02 || Math.abs(viewPanX - (stageW - sheetW) / 2) > 24,
    );
  }

  function setZoom(next, clientX, clientY) {
    const stage = mount.querySelector("#mail-stage");
    const prev = viewZoom;
    const z = Math.min(VIEW_ZOOM_MAX, Math.max(VIEW_ZOOM_MIN, next));
    if (stage && clientX != null && clientY != null && Math.abs(z - prev) > 0.0001) {
      const rect = stage.getBoundingClientRect();
      const mx = clientX - rect.left;
      const my = clientY - rect.top;
      if (viewPanX == null) centerView();
      // Keep the world point under the cursor fixed (Figma-style camera zoom)
      const wx = (mx - viewPanX) / prev;
      const wy = (my - viewPanY) / prev;
      viewPanX = mx - wx * z;
      viewPanY = my - wy * z;
    }
    viewZoom = z;
    applyViewTransform();
  }

  function resetView() {
    viewZoom = 1;
    viewCenteredOnce = false;
    centerView({ force: true });
    applyViewTransform();
  }

  function wireViewport() {
    const stage = mount.querySelector("#mail-stage");
    if (!stage) return;

    // Defer center until layout has sheet height
    requestAnimationFrame(() => {
      if (!viewCenteredOnce || viewPanX == null) centerView();
      applyViewTransform();
    });

    stage.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        // Exponential zoom feels closer to Figma than linear steps
        const factor = Math.exp(-e.deltaY * 0.0018);
        setZoom(viewZoom * factor, e.clientX, e.clientY);
      },
      { passive: false },
    );

    let panning = false;
    let startX = 0;
    let startY = 0;
    let originX = 0;
    let originY = 0;

    let spaceDown = false;
    const onKey = (e) => {
      if (e.code === "Space" && !e.target.closest("input, textarea, [contenteditable]")) {
        if (e.type === "keydown" && !e.repeat) {
          spaceDown = true;
          stage.classList.add("is-pan-ready");
          e.preventDefault();
        } else if (e.type === "keyup") {
          spaceDown = false;
          stage.classList.remove("is-pan-ready");
        } else if (e.type === "keydown") {
          e.preventDefault();
        }
        return;
      }
      if (e.type !== "keydown") return;
      const inField = e.target.closest("input, textarea, [contenteditable]");
      const mod = e.metaKey || e.ctrlKey;
      if (mod) {
        const key = e.key.toLowerCase();
        if (key === "s") {
          e.preventDefault();
          save({ title: mount.querySelector("#tpl-title")?.value });
          flash(mount.querySelector("#btn-save"), "Saved");
          return;
        }
        if (inField) return;
        if (key === "z" && !e.shiftKey) {
          e.preventDefault();
          undo();
          return;
        }
        if ((key === "z" && e.shiftKey) || key === "y") {
          e.preventDefault();
          redo();
          return;
        }
        return;
      }
      if (inField || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "v") {
        e.preventDefault();
        if (canvasTool !== "select") {
          canvasTool = "select";
          refresh();
        }
        return;
      }
      if (k === "f") {
        e.preventDefault();
        if (canvasTool !== "fill") {
          canvasTool = "fill";
          refresh();
        }
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.size) {
        e.preventDefault();
        deleteSelected();
        return;
      }
      if (e.key === "Escape" && selectedIds.size) {
        e.preventDefault();
        setSelection([]);
        refresh();
        return;
      }
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key) && selectedId && selectedIds.size === 1) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        nudgeSelected(dx, dy);
      }
    };
    viewKeyCleanup?.();
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    viewKeyCleanup = () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };

    const canStartPan = (e) => {
      if (e.button === 1) return true;
      if (e.button !== 0) return false;
      if (e.target.closest(".mail-view-hud, .canvas-tool-rail")) return false;
      if (e.target.closest(".mail-seg-tools, .mail-resize-handle, .mail-artboard-handle")) return false;
      if (e.target.closest("button, input, a, [contenteditable]")) return false;
      if (spaceDown || e.altKey) return true;
      if (e.target.classList.contains("mail-world-plane")) return true;
      if (e.target === stage || e.target.id === "mail-world") return true;
      if (!e.target.closest(".mail-sheet")) return true;
      return false;
    };

    stage.addEventListener("pointerdown", (e) => {
      viewDidPan = false;
      if (!canStartPan(e)) return;
      if (viewPanX == null) centerView();
      panning = true;
      startX = e.clientX;
      startY = e.clientY;
      originX = viewPanX;
      originY = viewPanY;
      stage.classList.add("is-panning");
      stage.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    stage.addEventListener("pointermove", (e) => {
      if (!panning) return;
      if (Math.abs(e.clientX - startX) > 3 || Math.abs(e.clientY - startY) > 3) viewDidPan = true;
      viewPanX = originX + (e.clientX - startX);
      viewPanY = originY + (e.clientY - startY);
      applyViewTransform();
    });

    const endPan = (e) => {
      if (!panning) return;
      panning = false;
      stage.classList.remove("is-panning");
      try {
        stage.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    stage.addEventListener("pointerup", endPan);
    stage.addEventListener("pointercancel", endPan);

    stage.addEventListener("click", (e) => {
      if (viewDidPan || resizing) return;
      if (e.target.closest(".mail-sheet")) return;
      if (e.target.closest(".mail-view-hud, .canvas-tool-rail")) return;
      if (!selectedIds.size) return;
      setSelection([]);
      refresh();
    });

    stage.addEventListener("auxclick", (e) => {
      if (e.button === 1) e.preventDefault();
    });
  }

  function showQa(issues) {
    const panel = mount.querySelector("#qa-panel");
    if (!panel) return;
    if (!issues.length) {
      panel.classList.remove("is-hidden");
      panel.innerHTML = `<p class="qa-ok">Looks good — no issues found.</p>`;
      return;
    }
    panel.classList.remove("is-hidden");
    panel.innerHTML = `
      <p class="qa-title">Pre-copy check</p>
      <ul class="qa-list">
        ${issues
          .map(
            (iss) =>
              `<li class="qa-${iss.level}">${escapeHtml(iss.message)}</li>`,
          )
          .join("")}
      </ul>`;
  }

  async function copyHtmlWithQa() {
    save({ title: mount.querySelector("#tpl-title").value });
    const issues = runQa(doc);
    showQa(issues);
    const blockers = issues.filter((i) => i.level === "error");
    if (blockers.length) {
      const ok = confirm(
        `${blockers.length} issue(s) found.\n\n${blockers.map((b) => "• " + b.message).join("\n")}\n\nCopy HTML anyway?`,
      );
      if (!ok) return false;
    }
    const html = compileEmailHtml(doc, { absoluteLogoOrigin: window.location.origin });
    await copyRichHtmlToClipboard(html, compilePlainText(doc));
    flash(mount.querySelector("#btn-copy"), "Copied");
    api?.onCopyHtml?.({ templateId, doc, html, title: template?.title });
    return true;
  }

  function wireChrome() {
    mount.querySelector("#btn-back-library")?.addEventListener("click", () => {
      save({ title: mount.querySelector("#tpl-title")?.value });
      api?.onBack?.();
    });
    mount.querySelector("#btn-save").addEventListener("click", () => {
      save({ title: mount.querySelector("#tpl-title").value });
      flash(mount.querySelector("#btn-save"), "Saved");
    });
    mount.querySelector("#btn-copy").addEventListener("click", () => copyHtmlWithQa());
    mount.querySelector("#btn-undo")?.addEventListener("click", undo);
    mount.querySelector("#btn-redo")?.addEventListener("click", redo);
    mount.querySelector("#btn-delete-email")?.addEventListener("click", () => {
      const title = template?.title || "Untitled email";
      if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
      deleteTemplate(templateId);
      api?.onBack?.();
    });

    mount.querySelector("#tpl-title").addEventListener("input", (e) => {
      scheduleSave({ title: e.target.value });
    });
    mount.querySelector("#tpl-title").addEventListener("focus", () => pushHistory());

    mount.querySelector("#btn-clear")?.addEventListener("click", () => {
      if (!confirm("Clear all segments from this email?")) return;
      mutate(() => {
        doc.blocks = [];
        setSelection([]);
      });
    });

    mount.onkeydown = onKeyDown;
  }

  function onKeyDown(e) {
    if (e.key === "Escape" && editScopeId && !e.target.closest("input, textarea, [contenteditable]")) {
      e.preventDefault();
      if (inlineEditId) commitInlineEdit({ discard: true, refreshAfter: false });
      exitScope();
      return;
    }
    if (e.key === "Escape" && gmailPreview && !e.target.closest("input, textarea, [contenteditable]")) {
      gmailPreview = false;
      refresh();
      return;
    }
    if (e.key === "Escape" && selectedIds.size && !e.target.closest("input, textarea, [contenteditable]")) {
      setSelection([]);
      refresh();
      return;
    }
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    const key = e.key.toLowerCase();
    const inField = e.target.closest("input, textarea, [contenteditable]");
    if (key === "s") {
      e.preventDefault();
      save({ title: mount.querySelector("#tpl-title")?.value });
      flash(mount.querySelector("#btn-save"), "Saved");
      return;
    }
    if (inField) return;
    if (key === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if ((key === "z" && e.shiftKey) || key === "y") {
      e.preventDefault();
      redo();
    }
  }

  function wirePalette() {
    const filterEl = mount.querySelector("#seg-filter");
    filterEl?.addEventListener("input", (e) => {
      segFilter = e.target.value;
      // Soft-update without losing focus: re-render palette only via refresh is ok if we restore focus
      const pos = e.target.selectionStart;
      refresh();
      const again = mount.querySelector("#seg-filter");
      if (again) {
        again.focus();
        try {
          again.setSelectionRange(pos, pos);
        } catch {
          /* ignore */
        }
      }
    });

    mount.querySelectorAll("[data-cat-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-cat-toggle");
        if (openCats.has(id)) openCats.delete(id);
        else openCats.add(id);
        const cat = mount.querySelector(`.seg-cat[data-cat="${id}"]`);
        cat?.classList.toggle("is-open", openCats.has(id));
      });
    });

    mount.querySelectorAll("[data-new-type]").forEach((el) => {
      const type = el.getAttribute("data-new-type");
      let suppressClick = false;
      const addBlock = () => addPaletteType(type);
      el.addEventListener("click", (e) => {
        if (suppressClick) {
          suppressClick = false;
          e.preventDefault();
          return;
        }
        addBlock();
      });
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          addBlock();
        }
      });
      el.addEventListener("dragstart", (e) => {
        suppressClick = false;
        paletteDropSucceeded = false;
        dragPayload = { mode: "new", type };
        e.dataTransfer.setData("text/plain", type || "block");
        e.dataTransfer.effectAllowed = "copy";
        el.classList.add("is-dragging");
        mount.querySelector(".mail-stage")?.classList.add("is-dropping");
      });
      el.addEventListener("dragend", () => {
        el.classList.remove("is-dragging");
        mount.querySelector(".mail-stage")?.classList.remove("is-dropping");
        clearDropHints();
        clearCanvasDropPreview();
        if (paletteDropSucceeded) suppressClick = true;
        paletteDropSucceeded = false;
        dragPayload = null;
      });
    });

    mount.querySelectorAll("[data-module-id]").forEach((el) => {
      const id = el.getAttribute("data-module-id");
      let suppressClick = false;
      const addModule = () => addPaletteModule(id);
      el.addEventListener("click", (e) => {
        if (e.target.closest("[data-module-del]")) return;
        if (suppressClick) {
          suppressClick = false;
          e.preventDefault();
          return;
        }
        addModule();
      });
      el.addEventListener("dragstart", (e) => {
        if (e.target.closest("[data-module-del]")) {
          e.preventDefault();
          return;
        }
        suppressClick = false;
        paletteDropSucceeded = false;
        dragPayload = { mode: "module", id };
        e.dataTransfer.setData("text/plain", id || "module");
        e.dataTransfer.effectAllowed = "copy";
        el.classList.add("is-dragging");
        mount.querySelector(".mail-stage")?.classList.add("is-dropping");
      });
      el.addEventListener("dragend", () => {
        el.classList.remove("is-dragging");
        mount.querySelector(".mail-stage")?.classList.remove("is-dropping");
        clearDropHints();
        clearCanvasDropPreview();
        if (paletteDropSucceeded) suppressClick = true;
        paletteDropSucceeded = false;
        dragPayload = null;
      });
    });

    mount.querySelectorAll("[data-module-del]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-module-del");
        if (!confirm("Remove this custom segment?")) return;
        deleteModule(id);
        refresh();
      });
    });

    mount.querySelector("#btn-new-custom-seg")?.addEventListener("click", () => {
      const name = prompt("Name your custom segment", "My section");
      if (name == null || !name.trim()) return;
      const block = defaultBlock("custom");
      block.segmentName = name.trim();
      const mod = saveModule({ name: name.trim(), block });
      openCats.add("modules");
      const copy = structuredClone(mod.block);
      copy.id = uid("block");
      insertAt(doc.blocks.length, copy);
    });
  }

  function wireCanvas() {
    const stage = mount.querySelector("#mail-stage");
    if (stage) {
      stage.addEventListener("dragover", (e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
        stage.classList.add("is-file-drop");
      });
      stage.addEventListener("dragleave", (e) => {
        if (e.target === stage) stage.classList.remove("is-file-drop");
      });
      stage.addEventListener("drop", async (e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        stage.classList.remove("is-file-drop");
        const seg = e.target.closest?.("[data-seg-id]");
        const dropZone = e.target.closest?.("[data-drop-index]");
        const index = dropZone ? Number(dropZone.getAttribute("data-drop-index") || 0) : null;
        await ingestDroppedImages(e.dataTransfer?.files, {
          index,
          targetId: seg?.getAttribute("data-seg-id"),
        });
        dragPayload = null;
      });
      stage.addEventListener("paste", async (e) => {
        if (e.target.closest("input, textarea, [contenteditable]")) return;
        const items = [...(e.clipboardData?.items || [])];
        const files = items
          .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
          .map((it) => it.getAsFile())
          .filter(Boolean);
        if (!files.length) return;
        e.preventDefault();
        await ingestDroppedImages(files, { targetId: selectedId });
      });
    }

    mount.querySelectorAll(".mail-seg").forEach((seg, i) => {
      const id = seg.getAttribute("data-seg-id");
      const block = doc.blocks.find((b) => b.id === id);
      seg.addEventListener("dragstart", (e) => {
        if (block?.locked) {
          e.preventDefault();
          return;
        }
        if (e.target.closest("button, .mail-resize-handle")) {
          e.preventDefault();
          return;
        }
        if (isFileDrag(e)) return;
        dragPayload = { mode: "move", id };
        e.dataTransfer.setData("text/plain", id);
        e.dataTransfer.effectAllowed = "move";
        seg.classList.add("is-dragging");
        mount.querySelector(".mail-stage")?.classList.add("is-dropping");
      });
      seg.addEventListener("dragend", () => {
        seg.classList.remove("is-dragging");
        mount.querySelector(".mail-stage")?.classList.remove("is-dropping");
        clearDropHints();
        dragPayload = null;
      });
      seg.addEventListener("dragover", (e) => {
        if (isFileDrag(e)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          return;
        }
        e.preventDefault();
        const rect = seg.getBoundingClientRect();
        const before = e.clientY < rect.top + rect.height / 2;
        clearDropHints();
        const drops = [...mount.querySelectorAll(".mail-drop")];
        drops[before ? i : i + 1]?.classList.add("is-active");
      });
      seg.addEventListener("drop", async (e) => {
        if (isFileDrag(e)) {
          e.preventDefault();
          e.stopPropagation();
          await ingestDroppedImages(e.dataTransfer?.files, { targetId: id, index: i });
          mount.querySelector(".mail-stage")?.classList.remove("is-dropping", "is-file-drop");
          return;
        }
        e.preventDefault();
        const rect = seg.getBoundingClientRect();
        const before = e.clientY < rect.top + rect.height / 2;
        handleDropAt(before ? i : i + 1);
        mount.querySelector(".mail-stage")?.classList.remove("is-dropping");
      });
    });

    mount.querySelectorAll("[data-select]").forEach((el) => {
      el.addEventListener("click", (e) => {
        // Let native editing / text highlight work inside the text box
        if (e.target.closest(".mail-inline-editor, button, .mail-resize-handle")) return;
        if (e.detail > 1) return;
        const id = el.getAttribute("data-select");
        if (!id) return;

        if (canvasTool === "fill") {
          const targets = selectedIds.has(id) && selectedIds.size > 1 ? [...selectedIds] : [id];
          applyFillToTargets(targets);
          return;
        }

        if (inlineEditId === id) return;

        // Already selected — keep handles so a following double-click can edit
        if (!e.shiftKey && selectedIds.size === 1 && selectedIds.has(id)) return;

        const shift = e.shiftKey;
        if (selectClickTimer) clearTimeout(selectClickTimer);
        selectClickTimer = setTimeout(() => {
          selectClickTimer = null;
          if (inlineEditId && inlineEditId !== id) {
            commitInlineEdit({ refreshAfter: false });
          }
          if (shift) {
            const next = new Set(selectedIds);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            setSelection([...next], { primary: id });
          } else {
            setSelection([id], { primary: id });
          }
          refresh();
        }, 200);
      });

      el.addEventListener("dblclick", (e) => {
        if (e.target.closest("button, .mail-resize-handle")) return;
        // Already editing: allow native double/triple-click highlight
        if (e.target.closest(".mail-inline-editor")) return;

        const id = el.getAttribute("data-select");
        if (!id) return;
        const b = doc.blocks.find((x) => x.id === id);
        if (!b || b.locked || !TEXT_BOX_TYPES.has(b.type)) return;
        if (canvasTool === "fill") return;

        e.preventDefault();
        e.stopPropagation();
        if (selectClickTimer) {
          clearTimeout(selectClickTimer);
          selectClickTimer = null;
        }

        setSelection([id], { primary: id });
        canvasTool = "select";
        if (inlineEditId && inlineEditId !== id) {
          commitInlineEdit({ refreshAfter: false });
        }
        inlineEditId = id;

        // If this block is already painted as selected, edit in place
        const seg = mount.querySelector(`.mail-seg[data-seg-id="${id}"]`);
        if (seg?.classList.contains("is-active")) {
          seg.classList.add("is-inline-editing");
          seg.draggable = false;
          activateInlineEditor(b, seg);
          return;
        }
        refresh();
      });
    });

    mount.querySelectorAll("[data-dup]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-dup");
        const src = findBlockAnywhere(doc, id);
        if (!src || src.locked) return;
        const copy = structuredClone(src);
        copy.id = uid("block");
        copy.locked = false;
        if (copy.children) {
          for (const c of copy.children) c.id = uid("block");
        }
        insertAt(doc.blocks.length, copy);
      });
    });

    mount.querySelectorAll("[data-save-mod]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-save-mod");
        const b = doc.blocks.find((x) => x.id === id);
        if (!b) return;
        const name = prompt("Custom segment name", labelFor(b));
        if (name == null) return;
        saveModule({ name, block: b });
        flash(btn, "Saved");
        openCats.add("modules");
        refresh();
      });
    });

    mount.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-del");
        const b = findBlockAnywhere(doc, id);
        if (b?.locked) return;
        mutate(() => {
          removeBlockById(id);
          const remain = scopeList();
          const next = [...selectedIds].filter((x) => x !== id);
          setSelection(next.length ? next : remain[0] ? [remain[0].id] : []);
        });
      });
    });

    [...mount.querySelectorAll(".mail-drop"), ...mount.querySelectorAll(".mail-empty")].forEach(
      (zone) => {
        zone.addEventListener("dragover", (e) => {
          e.preventDefault();
          if (isFileDrag(e)) {
            e.dataTransfer.dropEffect = "copy";
            clearDropHints();
            zone.classList.add("is-active");
            return;
          }
          e.dataTransfer.dropEffect =
            dragPayload?.mode === "new" || dragPayload?.mode === "module" ? "copy" : "move";
          clearDropHints();
          zone.classList.add("is-active");
        });
        zone.addEventListener("dragleave", () => zone.classList.remove("is-active"));
        zone.addEventListener("drop", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const index = Number(zone.getAttribute("data-drop-index") || 0);
          if (isFileDrag(e)) {
            await ingestDroppedImages(e.dataTransfer?.files, { index });
          } else {
            handleDropAt(index);
          }
          mount.querySelector(".mail-stage")?.classList.remove("is-dropping", "is-file-drop");
        });
      },
    );
  }

  function clearDropHints() {
    mount.querySelectorAll(".mail-drop.is-active, .mail-empty.is-active").forEach((el) => {
      el.classList.remove("is-active");
    });
  }

  function wireFooterInspector(block) {
    block.links = Array.isArray(block.links) ? block.links : [];
    block.social = block.social || [];
    block.logos = block.logos || [];

    const syncSocialFromInputs = () => {
      const next = [];
      mount.querySelectorAll("[data-footer-social]").forEach((el) => {
        const network = el.getAttribute("data-footer-social");
        const field = el.getAttribute("data-field");
        if (!network || field !== "href") return;
        const href = el.value.trim();
        if (!href) return;
        const label =
          { linkedin: "LinkedIn", instagram: "Instagram", twitter: "X", facebook: "Facebook", youtube: "YouTube", website: "Website" }[
            network
          ] || network;
        next.push({ network, href, label });
      });
      block.social = next;
    };

    mount.querySelectorAll("[data-footer-link]").forEach((el) => {
      el.addEventListener("focus", () => pushHistory());
      el.addEventListener("input", () => {
        const i = Number(el.getAttribute("data-footer-link"));
        const field = el.getAttribute("data-field");
        if (!block.links[i] || !field) return;
        block.links[i][field] = el.value;
        fitBlockGridHeight(block, activeGrid());
        scheduleSave();
        refresh();
      });
    });

    mount.querySelectorAll("[data-footer-social]").forEach((el) => {
      el.addEventListener("focus", () => pushHistory());
      el.addEventListener("input", () => {
        syncSocialFromInputs();
        fitBlockGridHeight(block, activeGrid());
        scheduleSave();
        refresh();
      });
    });

    mount.querySelectorAll("[data-footer-logo]").forEach((el) => {
      el.addEventListener("focus", () => pushHistory());
      el.addEventListener("input", () => {
        const i = Number(el.getAttribute("data-footer-logo"));
        const field = el.getAttribute("data-field");
        if (!block.logos[i] || !field) return;
        block.logos[i][field] = field === "width" ? Number(el.value) : el.value;
        fitBlockGridHeight(block, activeGrid());
        scheduleSave();
        refresh();
      });
    });

    mount.querySelector("#btn-footer-link-add")?.addEventListener("click", () => {
      mutate(() => {
        block.links.push({ label: "New link", href: "https://" });
      });
    });

    mount.querySelectorAll("[data-footer-link-del]").forEach((btn) => {
      btn.addEventListener("click", () => {
        mutate(() => {
          block.links.splice(Number(btn.getAttribute("data-footer-link-del")), 1);
        });
      });
    });

    mount.querySelector("#btn-footer-logo-add")?.addEventListener("click", () => {
      mutate(() => {
        block.logos.push({ src: "", alt: "Client logo", href: "", width: 80 });
        block.showLogos = true;
      });
    });

    mount.querySelectorAll("[data-footer-logo-del]").forEach((btn) => {
      btn.addEventListener("click", () => {
        mutate(() => {
          block.logos.splice(Number(btn.getAttribute("data-footer-logo-del")), 1);
        });
      });
    });

    const logoFile = mount.querySelector("#footer-logo-file");
    const logoDrop = mount.querySelector("#footer-logo-drop");
    if (logoFile && logoDrop) {
      const ingest = async (file) => {
        if (!file?.type.startsWith("image/")) return;
        if (rejectOversizedImage(file)) return;
        pushHistory();
        block.logos = block.logos || [];
        block.logos.push({
          src: await readAsDataURL(file),
          alt: file.name.replace(/\.[^.]+$/, ""),
          href: "",
          width: 80,
        });
        block.showLogos = true;
        scheduleSave();
        refresh();
      };
      logoFile.addEventListener("change", () => ingest(logoFile.files?.[0]));
      wireDropzone(logoDrop, (files) => ingest(files[0]));
    }
  }

  function wireInspector(block) {
    if (!block) return;

    mount.querySelectorAll("[data-align]").forEach((btn) => {
      btn.addEventListener("click", () => {
        mutate(() => {
          block.align = btn.getAttribute("data-align");
        });
      });
    });

    mount.querySelectorAll("[data-key]").forEach((el) => {
      const key = el.getAttribute("data-key");
      el.addEventListener("focus", () => pushHistory());
      const apply = async () => {
        if (el.type === "checkbox") block[key] = el.checked;
        else if (el.type === "number") block[key] = Number(el.value);
        else block[key] = el.value;
        if (key === "padTop" || key === "padBottom" || key.startsWith("pad")) {
          normalizeBlockPadding(block);
        }
        if (block.type === "image" && (key === "src" || key === "layout" || key === "width")) {
          block.ghManual = false;
          syncImageWidthFromGrid(block, activeSheetWidth(), activeGrid().cols);
          if (block.src) await refitImageBlockFromSrc(block, activeGrid(), activeSheetWidth());
          else fitBlockGridHeight(block, activeGrid());
        } else {
          fitBlockGridHeight(block, activeGrid());
        }
        scheduleSave();
        refresh();
      };
      el.addEventListener("input", apply);
      el.addEventListener("change", () => {
        if (el.type === "checkbox" || el.tagName === "SELECT") {
          if (key === "layout" && (el.value === "left" || el.value === "right")) {
            if (!block.width || block.width > 320) block.width = 220;
            if (!block.html) block.html = "Add copy beside this GIF…";
            block.align = "left";
          }
          if (key === "imagePosition" && (el.value === "left" || el.value === "right")) {
            if (!block.imageWidth || block.imageWidth > 320) block.imageWidth = 200;
          }
          if (block.type === "image" && key === "layout") {
            block.ghManual = false;
            syncImageWidthFromGrid(block, activeSheetWidth(), activeGrid().cols);
            void refitImageBlockFromSrc(block, activeGrid(), activeSheetWidth()).then(() => {
              scheduleSave();
              refresh();
            });
            return;
          }
          scheduleSave();
          refresh();
        } else apply();
      });
    });

    // Custom section image upload
    const customImgFile = mount.querySelector("#custom-img-file");
    const customImgDrop = mount.querySelector("#custom-img-drop");
    if (customImgFile && customImgDrop && block.type === "custom") {
      const ingest = async (file) => {
        if (!file?.type.startsWith("image/")) return;
        if (rejectOversizedImage(file)) return;
        pushHistory();
        block.imageSrc = await readAsDataURL(file);
        block.showImage = true;
        block.imageAlt = block.imageAlt || file.name;
        scheduleSave();
        refresh();
      };
      customImgFile.addEventListener("change", () => ingest(customImgFile.files?.[0]));
      wireDropzone(customImgDrop, (files) => ingest(files[0]));
    }

    // Rich text fields
    [
      ["rte-html", "html"],
      ["rte-left", "left"],
      ["rte-right", "right"],
    ].forEach(([id, key]) => {
      if (!mount.querySelector(`#${id}`)) return;
      let gestured = false;
      const editor = mount.querySelector(`#${id}`);
      editor?.addEventListener("focus", () => {
        if (!gestured) {
          pushHistory();
          gestured = true;
        }
      });
      wireRichEditor(mount, id, (html) => {
        block[key] = html;
        scheduleSave();
        softPaint();
      });
    });

    mount.querySelectorAll("[data-metric]").forEach((el) => {
      el.addEventListener("focus", () => pushHistory());
      el.addEventListener("input", () => {
        const i = Number(el.getAttribute("data-metric"));
        const field = el.getAttribute("data-field");
        if (!block.items?.[i]) return;
        block.items[i][field] = el.value;
        scheduleSave();
        softPaint();
      });
    });

    const listEditor = mount.querySelector("#list-items-rte");
    if (listEditor) {
      let gestured = false;
      listEditor.addEventListener("focus", () => {
        if (!gestured) {
          pushHistory();
          gestured = true;
        }
      });
      wireRichEditor(mount, "list-items-rte", (html) => {
        // Prefer <li> items; else split by line breaks
        const tmp = document.createElement("div");
        tmp.innerHTML = html;
        const lis = [...tmp.querySelectorAll("li")].map((li) => sanitizeRichHtml(li.innerHTML));
        if (lis.length) {
          block.items = lis.filter(Boolean);
        } else {
          block.items = html
            .replace(/<br\s*\/?>/gi, "\n")
            .split(/\n/)
            .map((x) => sanitizeRichHtml(x.trim()))
            .filter(Boolean);
        }
        scheduleSave();
        fitBlockGridHeight(block, activeGrid());
        refresh();
      });
    }

    if (block.type === "footer") wireFooterInspector(block);

    const imgFile = mount.querySelector("#img-file");
    const imgDrop = mount.querySelector("#img-drop");
    if (imgFile && imgDrop) {
      const ingest = async (file) => {
        if (!file?.type.startsWith("image/")) return;
        if (rejectOversizedImage(file)) return;
        pushHistory();
        block.src = await readAsDataURL(file);
        block.alt = block.alt || file.name;
        block.ghManual = false;
        normalizeBlockGrid(block, activeGrid().cols);
        syncImageWidthFromGrid(block, activeSheetWidth(), activeGrid().cols);
        await refitImageBlockFromSrc(block, activeGrid(), activeSheetWidth());
        scheduleSave();
        refresh();
      };
      imgFile.addEventListener("change", () => ingest(imgFile.files?.[0]));
      wireDropzone(imgDrop, (files) => ingest(files[0]));
    }

    const attFile = mount.querySelector("#att-file");
    const attDrop = mount.querySelector("#att-drop");
    if (attFile && attDrop && block.type === "attachments") {
      const ingestAtt = (files) => {
        pushHistory();
        block.items = block.items || [];
        for (const file of files) {
          block.items.push({
            name: file.name,
            size: file.size,
            sizeLabel: formatBytes(file.size),
            mime: file.type || "application/octet-stream",
          });
        }
        scheduleSave();
        refresh();
      };
      attFile.addEventListener("change", () => ingestAtt([...attFile.files]));
      wireDropzone(attDrop, ingestAtt);
    }

    mount.querySelectorAll("[data-att-del]").forEach((btn) => {
      btn.addEventListener("click", () => {
        mutate(() => {
          block.items.splice(Number(btn.getAttribute("data-att-del")), 1);
        });
      });
    });

    wireBackgroundPanel(block);

    mount.querySelector("#btn-enter-section")?.addEventListener("click", () => {
      if (isContainerType(block.type)) enterScope(block.id);
    });
  }

  function wireBackgroundPanel(block) {
    const colorEl = mount.querySelector("#bg-color");
    const opacityEl = mount.querySelector("#bg-opacity");
    const clearBtn = mount.querySelector("#bg-clear");
    const undoBtn = mount.querySelector("#bg-color-undo");
    const resetBtn = mount.querySelector("#bg-color-reset");
    const photoFile = mount.querySelector("#bg-photo-file");
    const photoDrop = mount.querySelector("#bg-photo-drop");
    const photoRemove = mount.querySelector("#bg-photo-remove");

    const snapshotColor = () => ({
      bgColor: block.bgColor || "",
      bgOpacity: block.bgOpacity != null ? Number(block.bgOpacity) : 0,
    });

    const pushColorUndo = (snap = snapshotColor()) => {
      bgColorUndo.set(block.id, snap);
      if (undoBtn) undoBtn.disabled = false;
    };

    let colorGestureSnap = null;
    const beginColorGesture = () => {
      colorGestureSnap = snapshotColor();
    };
    const commitColorGesture = () => {
      if (colorGestureSnap) {
        pushColorUndo(colorGestureSnap);
        pushHistory();
        colorGestureSnap = null;
      }
    };

    const paintOpacityLabel = () => {
      const label = mount.querySelector(".bg-opacity span");
      if (label && opacityEl) label.textContent = `Opacity ${opacityEl.value}%`;
    };

    const applyColorState = (state, { refreshUi = false } = {}) => {
      block.bgColor = state.bgColor || "";
      block.bgOpacity = state.bgOpacity != null ? Number(state.bgOpacity) : 0;
      delete block.bg;
      scheduleSave();
      if (refreshUi) refresh();
      else {
        if (colorEl) {
          colorEl.value = safeHex(
            block.bgColor || (block.type === "header" ? "#1a2332" : "#ffffff"),
            "#ffffff",
          );
        }
        if (opacityEl) {
          opacityEl.value = String(block.bgOpacity ?? 0);
          paintOpacityLabel();
        }
        softPaint();
      }
    };

    if (undoBtn) undoBtn.disabled = !bgColorUndo.has(block.id);

    colorEl?.addEventListener("pointerdown", beginColorGesture);
    colorEl?.addEventListener("focus", beginColorGesture);
    colorEl?.addEventListener("input", () => {
      commitColorGesture();
      block.bgColor = colorEl.value;
      if (block.bgOpacity == null || Number(block.bgOpacity) === 0) block.bgOpacity = 100;
      if (opacityEl && Number(opacityEl.value) === 0) {
        opacityEl.value = "100";
        block.bgOpacity = 100;
        paintOpacityLabel();
      }
      delete block.bg;
      scheduleSave();
      softPaint();
    });

    opacityEl?.addEventListener("pointerdown", beginColorGesture);
    opacityEl?.addEventListener("focus", beginColorGesture);
    opacityEl?.addEventListener("input", () => {
      commitColorGesture();
      block.bgOpacity = Number(opacityEl.value);
      if (!block.bgColor && block.type === "header") block.bgColor = "#1a2332";
      if (!block.bgColor && Number(opacityEl.value) > 0) block.bgColor = "#ffffff";
      paintOpacityLabel();
      scheduleSave();
      softPaint();
    });

    undoBtn?.addEventListener("click", () => {
      const prev = bgColorUndo.get(block.id);
      if (!prev) return;
      bgColorUndo.delete(block.id);
      pushHistory();
      applyColorState(prev, { refreshUi: true });
    });

    resetBtn?.addEventListener("click", () => {
      pushColorUndo();
      pushHistory();
      if (block.type === "header") {
        applyColorState({ bgColor: "#1a2332", bgOpacity: 100 }, { refreshUi: true });
      } else {
        applyColorState({ bgColor: "", bgOpacity: 0 }, { refreshUi: true });
      }
    });

    clearBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      pushColorUndo();
      mutate(() => {
        block.bgColor = "";
        block.bgOpacity = 0;
        block.bgImage = "";
        block.bgSize = "cover";
        delete block.bg;
      });
    });

    const ingestPhoto = async (file) => {
      if (!file?.type.startsWith("image/")) return;
      if (rejectOversizedImage(file)) return;
      pushHistory();
      block.bgImage = await readAsDataURL(file);
      block.bgSize = block.bgSize || "cover";
      if (!block.bgColor) {
        block.bgColor = "#1a2332";
        block.bgOpacity = 35;
      }
      scheduleSave();
      refresh();
    };

    photoFile?.addEventListener("change", () => {
      ingestPhoto(photoFile.files?.[0]);
      photoFile.value = "";
    });
    if (photoDrop) wireDropzone(photoDrop, (files) => ingestPhoto(files[0]));

    mount.querySelector("#bg-photo-browse")?.addEventListener("click", () => photoFile?.click());
    mount.querySelector("#bg-photo-replace")?.addEventListener("click", () => photoFile?.click());

    photoRemove?.addEventListener("click", () => {
      mutate(() => {
        block.bgImage = "";
      });
    });

    mount.querySelectorAll("[data-bg-size]").forEach((btn) => {
      btn.addEventListener("click", () => {
        mutate(() => {
          block.bgSize = btn.getAttribute("data-bg-size");
        });
      });
    });
  }

  function softPaint() {
    const block = selected();
    if (!block) {
      paintArtboardFrame();
      paintEmailSize();
      return;
    }
    if (inlineEditId === block.id) return;
    const grid = activeGrid();
    const sheetW = activeSheetWidth();
    if (block.type === "image" && block.src) {
      fitImageBlockToGrid(block, grid, sheetW);
    } else if (!resizing) {
      fitBlockGridHeight(block, grid);
    }
    const seg = mount.querySelector(`.mail-seg[data-seg-id="${block.id}"]`);
    if (seg?.classList.contains("is-grid-item")) {
      const w = activeSheetWidth();
      normalizeBlockGrid(block, grid.cols);
      seg.style.cssText = blockFrameStyle(block, w, grid);
      const content = seg.querySelector(".mail-seg-content");
      if (content) {
        const cellW = block.gw * (w / grid.cols);
        content.innerHTML = renderBlockCell(
          { ...block, contentWidth: 100, buttonFill: block.type === "button" },
          { cellWidth: cellW, gridCell: true },
          cellW,
        );
      }
      const lines = mount.querySelector(".mail-grid-lines");
      if (lines) lines.style.backgroundSize = `${(w / grid.cols).toFixed(2)}px ${grid.rowHeight}px`;
    }
    paintArtboardFrame();
    paintEmailSize();
  }

  function wireGridInteractions() {
    const sheet = mount.querySelector("#mail-sheet");
    if (!sheet) return;
    const grid = activeGrid();
    const surfaceEl = mount.querySelector("[data-grid-surface]") || sheet;

    const clientToSheet = (clientX, clientY) => {
      const rect = surfaceEl.getBoundingClientRect();
      return {
        x: (clientX - rect.left) / viewZoom,
        y: (clientY - rect.top) / viewZoom,
      };
    };

    const scopeDoc = () => ({
      blocks: scopeList(),
      grid,
      canvas: doc.canvas,
      canvasWidth: activeSheetWidth(),
      layoutMode: "grid",
    });

    const layoutShiftOpts = (meta, extra = {}) => ({
      rowLimit: canvasRowCap(),
      ...extra,
      meta,
    });

    mount.querySelectorAll("[data-scope-goto]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const goto = btn.getAttribute("data-scope-goto") || "";
        if (!goto) {
          editScopeId = null;
          setSelection([]);
          refresh();
          return;
        }
        enterScope(goto);
      });
    });

    const paintGuides = (guides) => {
      const host = mount.querySelector("#mail-align-guides");
      if (!host) return;
      const w = activeSheetWidth();
      const colW = w / grid.cols;
      const rowH = grid.rowHeight;
      host.innerHTML = (guides || [])
        .map((g) => {
          if (g.orient === "v") {
            return `<div class="mail-align-guide is-v" style="left:${g.at * colW}px;"></div>`;
          }
          return `<div class="mail-align-guide is-h" style="top:${g.at * rowH}px;"></div>`;
        })
        .join("");
    };
    const clearGuides = () => {
      const host = mount.querySelector("#mail-align-guides");
      if (host) host.innerHTML = "";
    };

    mount.querySelectorAll("[data-select-base]").forEach((el) => {
      el.addEventListener("click", (e) => {
        if (e.target.closest(".mail-seg, .mail-resize-handle, .mail-seg-tool-btn, .mail-scope-bar, [data-add-section-edge]")) return;
        if (editScopeId) return;
        const hit = e.target.closest("[data-select-base]");
        if (hit !== el) return;
        const kind = el.getAttribute("data-select-base");
        if (kind === "scope") return;
        e.stopPropagation();
        selectCanvasBase("canvas");
        refresh();
      });
    });

    mount.querySelectorAll("[data-add-section-edge]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        insertSectionAtEdge(btn.getAttribute("data-add-section-edge") === "top" ? "top" : "bottom");
      });
    });

    mount.querySelectorAll(".mail-seg.is-grid-item").forEach((seg) => {
      const id = seg.getAttribute("data-seg-id");
      const block = findBlockAnywhere(doc, id);
      if (!block || block.locked) return;

      const beginEdit = () => {
        if (selectClickTimer) {
          clearTimeout(selectClickTimer);
          selectClickTimer = null;
        }
        if (isContainerType(block.type)) {
          enterScope(id);
          return;
        }
        setSelection([id], { primary: id });
        canvasFocus = null;
        canvasTool = "select";
        if (inlineEditId && inlineEditId !== id) commitInlineEdit({ refreshAfter: false });

        if (TEXT_BOX_TYPES.has(block.type)) {
          inlineEditId = id;
          const already = mount.querySelector(`.mail-seg[data-seg-id="${id}"]`);
          if (already?.classList.contains("is-active")) {
            already.classList.add("is-inline-editing");
            activateInlineEditor(block, already);
            return;
          }
          refresh();
          return;
        }
        inspTab = "edit";
        refresh();
        requestAnimationFrame(() => {
          const field = mount.querySelector(
            "#img-file, [data-key='label'], [data-key='src'], [data-metric], .rte-editor, input[data-key]",
          );
          if (field && "focus" in field) /** @type {HTMLElement} */ (field).focus();
        });
      };

      const onPointerDown = (e) => {
        if (e.button !== 0) return;
        if (e.target.closest(".mail-resize-handle, .mail-seg-tool-btn, [contenteditable], .mail-inline-editor")) return;
        if (inlineEditId === id) return;

        if (e.detail >= 2) {
          e.preventDefault();
          e.stopPropagation();
          beginEdit();
          return;
        }

        e.stopPropagation();
        const wasSelected = selectedId === id;
        if (!wasSelected) setSelection([id], { primary: id });
        canvasFocus = null;
        normalizeBlockGrid(block, grid.cols);
        const startClient = { x: e.clientX, y: e.clientY };
        const origin = { gx: block.gx, gy: block.gy, gw: block.gw, gh: block.gh };
        const working = scopeDoc();
        const originAll = new Map(
          working.blocks.map((b) => {
            normalizeBlockGrid(b, grid.cols);
            return [b.id, { gx: b.gx, gy: b.gy, gw: b.gw, gh: b.gh }];
          }),
        );
        let moved = false;
        let historyPushed = false;
        /** @type {Map<string, { gx: number, gy: number, gw: number, gh: number }> | null} */
        let lastPreview = null;
        /** @type {{ mode?: string, insertAt?: number, hoverId?: string }} */
        let lastMeta = {};
        const ghost = mount.querySelector("#mail-snap-ghost");
        const insertLine = mount.querySelector("#mail-insert-line");
        const colW = () => activeSheetWidth() / grid.cols;

        const paintSnapAssist = (positions, meta = {}) => {
          lastPreview = positions;
          lastMeta = meta;
          const mover = positions.get(id);
          if (ghost && mover) {
            ghost.hidden = false;
            ghost.classList.toggle("is-insert", meta.mode === "insert");
            ghost.classList.toggle("is-split", meta.mode === "split");
            ghost.style.left = `${mover.gx * colW()}px`;
            ghost.style.top = `${mover.gy * grid.rowHeight}px`;
            ghost.style.width = `${mover.gw * colW()}px`;
            ghost.style.height = `${mover.gh * grid.rowHeight}px`;
          }
          if (insertLine) {
            if (meta.mode === "insert" && meta.insertAt != null) {
              insertLine.hidden = false;
              insertLine.style.top = `${meta.insertAt * grid.rowHeight}px`;
            } else {
              insertLine.hidden = true;
            }
          }
          for (const [bid, pos] of positions) {
            if (bid === PHANTOM_ID) continue;
            const el = mount.querySelector(`.mail-seg[data-seg-id="${bid}"]`);
            const real = findBlockAnywhere(doc, bid);
            if (!el || !real) continue;
            const orig = originAll.get(bid);
            if (bid === id && orig) {
              // Keep the dragged block in place; ghost shows the landing area
              el.style.cssText = blockFrameStyle({ ...real, ...orig }, activeSheetWidth(), grid);
              el.classList.add("is-dragging-grid");
              el.classList.remove("is-snap-shifting");
              continue;
            }
            el.style.cssText = blockFrameStyle({ ...real, ...pos }, activeSheetWidth(), grid);
            const shifted =
              orig && (orig.gx !== pos.gx || orig.gy !== pos.gy || orig.gw !== pos.gw || orig.gh !== pos.gh);
            el.classList.toggle("is-snap-shifting", Boolean(shifted));
            el.classList.remove("is-dragging-grid");
          }
        };

        const restoreOrigins = () => {
          if (ghost) ghost.hidden = true;
          if (insertLine) insertLine.hidden = true;
          for (const [bid, pos] of originAll) {
            const el = mount.querySelector(`.mail-seg[data-seg-id="${bid}"]`);
            const real = findBlockAnywhere(doc, bid);
            if (!el || !real) continue;
            el.style.cssText = blockFrameStyle({ ...real, ...pos }, activeSheetWidth(), grid);
            el.classList.remove("is-snap-shifting", "is-dragging-grid");
          }
        };

        const onMove = (ev) => {
          const dist = Math.hypot(ev.clientX - startClient.x, ev.clientY - startClient.y);
          if (!moved && dist < 6) return;
          if (!moved) {
            moved = true;
            if (!historyPushed) {
              pushHistory();
              historyPushed = true;
            }
            resizing = true;
            if (selectClickTimer) {
              clearTimeout(selectClickTimer);
              selectClickTimer = null;
            }
          }
          const pt = clientToSheet(ev.clientX, ev.clientY);
          const pointerGx = pt.x / colW();
          const pointerGy = pt.y / grid.rowHeight - origin.gh / 2;
          paintGuides([]);
          const meta = {};
          paintSnapAssist(
            previewLayoutShift(scopeDoc(), id, pointerGx, pointerGy, layoutShiftOpts(meta, { origins: originAll, forceFullWidth: false })),
            meta,
          );
          const mover = lastPreview?.get(id);
          if (mover) {
            const label =
              meta.mode === "insert"
                ? `Insert @ ${meta.insertAt}`
                : meta.mode === "split"
                  ? `Split · ${mover.gw}×${mover.gh}`
                  : `${mover.gw}×${mover.gh} @ ${mover.gx},${mover.gy}`;
            syncResizeHud(block, label);
          }
        };

        const onUp = () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          resizing = false;
          clearGuides();
          if (ghost) {
            ghost.hidden = true;
            ghost.classList.remove("is-insert", "is-split");
          }
          if (insertLine) insertLine.hidden = true;
          if (moved && lastPreview) {
            if (!editScopeId) clampLayoutPositions(doc, lastPreview);
            applyLayoutPositions(scopeDoc(), lastPreview);
            const placed = findBlockAnywhere(doc, id);
            const overlaps =
              placed &&
              scopeList().some((b) => b.id !== id && !b.hidden && rectsOverlap(b, placed));
            if (overlaps && lastMeta.mode !== "split") pushScopeOverlaps(id);
            for (const b of scopeList()) {
              if (b.type === "image" && b.src) fitImageBlockToGrid(b, grid, activeSheetWidth());
              else syncImageWidthFromGrid(b, activeSheetWidth(), grid.cols);
            }
            scheduleSave();
            refresh();
            return;
          }
          restoreOrigins();
          if (!wasSelected || !seg.querySelector("[data-grid-resize]")) refresh();
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      };

      seg.addEventListener("pointerdown", onPointerDown);
      seg.addEventListener("dblclick", (e) => {
        if (e.target.closest(".mail-resize-handle, .mail-seg-tool-btn, .mail-inline-editor")) return;
        e.preventDefault();
        e.stopPropagation();
        beginEdit();
      });
    });

    mount.querySelectorAll("[data-grid-resize]").forEach((handle) => {
      handle.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const seg = handle.closest("[data-seg-id]");
        const id = seg?.getAttribute("data-seg-id");
        const block = findBlockAnywhere(doc, id);
        if (!block || block.locked) return;
        const kind = handle.getAttribute("data-grid-resize") || "";
        pushHistory();
        resizing = true;
        normalizeBlockGrid(block, grid.cols);
        const startPt = clientToSheet(e.clientX, e.clientY);
        const origin = { gx: block.gx, gy: block.gy, gw: block.gw, gh: block.gh };
        const originAll = new Map(
          scopeList().map((b) => {
            normalizeBlockGrid(b, grid.cols);
            return [b.id, { gx: b.gx, gy: b.gy, gw: b.gw, gh: b.gh }];
          }),
        );
        const growth = {
          n: kind.includes("n"),
          s: kind.includes("s"),
          e: kind.includes("e"),
          w: kind.includes("w"),
        };
        const colW = activeSheetWidth() / grid.cols;

        const paintResizeShift = (positions) => {
          for (const [bid, pos] of positions) {
            const el = mount.querySelector(`.mail-seg[data-seg-id="${bid}"]`);
            const real = findBlockAnywhere(doc, bid);
            if (!el || !real) continue;
            el.style.cssText = blockFrameStyle({ ...real, ...pos }, activeSheetWidth(), grid);
            const orig = originAll.get(bid);
            const shifted =
              bid !== id &&
              orig &&
              (orig.gx !== pos.gx || orig.gy !== pos.gy || orig.gw !== pos.gw || orig.gh !== pos.gh);
            el.classList.toggle("is-snap-shifting", Boolean(shifted));
            el.classList.toggle("is-dragging-grid", bid === id);
          }
          const surfaceEl = mount.querySelector(".mail-grid-surface");
          if (surfaceEl) {
            let maxRow = 8;
            for (const pos of positions.values()) maxRow = Math.max(maxRow, pos.gy + pos.gh);
            surfaceEl.style.minHeight = `${Math.max(360, maxRow * grid.rowHeight + 48)}px`;
          }
        };

        const onMove = (ev) => {
          const pt = clientToSheet(ev.clientX, ev.clientY);
          const dx = pt.x - startPt.x;
          const dy = pt.y - startPt.y;
          let { gx, gy, gw, gh } = { ...origin };
          if (kind.includes("e")) {
            gw = snapSizeToGrid(origin.gw * colW + dx, origin.gh * grid.rowHeight, activeSheetWidth(), grid, gx, gy).gw;
          }
          if (kind.includes("s")) {
            gh = snapSizeToGrid(origin.gw * colW, origin.gh * grid.rowHeight + dy, activeSheetWidth(), grid, gx, gy).gh;
          }
          if (kind.includes("w")) {
            const right = origin.gx + origin.gw;
            gx = Math.max(0, Math.min(right - 1, Math.round((origin.gx * colW + dx) / colW)));
            gw = right - gx;
          }
          if (kind.includes("n")) {
            const bottom = origin.gy + origin.gh;
            gy = Math.max(0, Math.min(bottom - 1, Math.round((origin.gy * grid.rowHeight + dy) / grid.rowHeight)));
            gh = bottom - gy;
          }
          const nextRect = {
            gx,
            gy,
            gw: Math.max(1, Math.min(grid.cols - gx, gw)),
            gh: Math.max(1, Math.min(48, gh)),
          };
          const positions = previewResizeShift(scopeDoc(), id, nextRect, {
            origins: originAll,
            growth,
          });
          applyLayoutPositions(scopeDoc(), positions);
          if (block.type === "button") {
            block.buttonFill = true;
            block.buttonPadY = Math.round(Math.min(28, Math.max(8, 6 + block.gh * 2)));
            block.buttonPadX = Math.round(Math.min(40, Math.max(12, 10 + block.gw)));
          }
          for (const b of scopeList()) {
            if (b.type === "image" && b.src) fitImageBlockToGrid(b, grid, activeSheetWidth());
            else syncImageWidthFromGrid(b, activeSheetWidth(), grid.cols);
          }
          paintResizeShift(positions);
          softPaint();
          syncResizeHud(block, `${block.gw}×${block.gh}`);
        };
        const onUp = () => {
          resizing = false;
          clearGuides();
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          const resized = findBlockAnywhere(doc, id);
          if (resized?.type === "image" && resized.src) {
            resized.ghManual = false;
            void refitImageBlockFromSrc(resized, grid, activeSheetWidth()).then(() => {
              scheduleSave();
              refresh();
            });
          } else {
            if (resized) resized.ghManual = true;
            scheduleSave();
            refresh();
          }
          mount.querySelectorAll(".mail-seg.is-snap-shifting, .mail-seg.is-dragging-grid").forEach((el) => {
            el.classList.remove("is-snap-shifting", "is-dragging-grid");
          });
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      });
    });

    const surface = mount.querySelector("[data-grid-surface]");
    if (surface) {
      /** @type {Map<string, { gx: number, gy: number, gw: number, gh: number }> | null} */
      let paletteOrigins = null;
      /** @type {Map<string, { gx: number, gy: number, gw: number, gh: number }> | null} */
      let palettePreview = null;
      /** @type {{ mode?: string, insertAt?: number, hoverId?: string }} */
      let paletteMeta = {};
      const ghost = () => mount.querySelector("#mail-snap-ghost");
      const insertLine = () => mount.querySelector("#mail-insert-line");
      const colW = () => activeSheetWidth() / grid.cols;

      const snapshotOrigins = () => {
        const map = new Map();
        for (const b of scopeList()) {
          normalizeBlockGrid(b, grid.cols);
          map.set(b.id, { gx: b.gx, gy: b.gy, gw: b.gw, gh: b.gh });
        }
        return map;
      };

      const clearPalettePreview = () => {
        const g = ghost();
        if (g) {
          g.hidden = true;
          g.classList.remove("is-insert", "is-split");
        }
        const line = insertLine();
        if (line) line.hidden = true;
        if (paletteOrigins) {
          for (const [bid, pos] of paletteOrigins) {
            const el = mount.querySelector(`.mail-seg[data-seg-id="${bid}"]`);
            const real = findBlockAnywhere(doc, bid);
            if (!el || !real) continue;
            el.style.cssText = blockFrameStyle({ ...real, ...pos }, activeSheetWidth(), grid);
            el.classList.remove("is-snap-shifting");
          }
        }
        paletteOrigins = null;
        palettePreview = null;
        paletteMeta = {};
      };

      const paintPalettePreview = (positions, meta = {}) => {
        palettePreview = positions;
        paletteMeta = meta;
        const mover = positions.get(PHANTOM_ID);
        const g = ghost();
        if (g && mover) {
          g.hidden = false;
          g.classList.toggle("is-insert", meta.mode === "insert");
          g.classList.toggle("is-split", meta.mode === "split");
          g.style.left = `${mover.gx * colW()}px`;
          g.style.top = `${mover.gy * grid.rowHeight}px`;
          g.style.width = `${mover.gw * colW()}px`;
          g.style.height = `${mover.gh * grid.rowHeight}px`;
        }
        const line = insertLine();
        if (line) {
          if (meta.mode === "insert" && meta.insertAt != null) {
            line.hidden = false;
            line.style.top = `${meta.insertAt * grid.rowHeight}px`;
          } else {
            line.hidden = true;
          }
        }
        for (const [bid, pos] of positions) {
          if (bid === PHANTOM_ID) continue;
          const el = mount.querySelector(`.mail-seg[data-seg-id="${bid}"]`);
          const real = findBlockAnywhere(doc, bid);
          if (!el || !real) continue;
          el.style.cssText = blockFrameStyle({ ...real, ...pos }, activeSheetWidth(), grid);
          const orig = paletteOrigins?.get(bid);
          const shifted =
            orig && (orig.gx !== pos.gx || orig.gy !== pos.gy || orig.gw !== pos.gw || orig.gh !== pos.gh);
          el.classList.toggle("is-snap-shifting", Boolean(shifted));
        }
      };

      clearCanvasDropPreview = clearPalettePreview;

      const handlePaletteDragOver = (clientX, clientY) => {
        if (!dragPayload || (dragPayload.mode !== "new" && dragPayload.mode !== "module")) return;
        if (!paletteOrigins) paletteOrigins = snapshotOrigins();
        const span =
          dragPayload.mode === "new"
            ? defaultSpanForType(dragPayload.type)
            : defaultSpanForType(getModule(dragPayload.id)?.block?.type || "custom");
        const pt = clientToSheet(clientX, clientY);
        const pointerGx = pt.x / colW();
        const pointerGy = pt.y / grid.rowHeight - span.gh / 2;
        const meta = {};
        paintPalettePreview(
          previewLayoutShift(scopeDoc(), null, pointerGx, pointerGy, layoutShiftOpts(meta, {
            origins: paletteOrigins,
            phantom: span,
            forceFullWidth: true,
          })),
          meta,
        );
      };

      const isOverMailSheet = (clientX, clientY) => {
        const sheetEl = mount.querySelector("#mail-sheet");
        if (!sheetEl) return false;
        const rect = sheetEl.getBoundingClientRect();
        return (
          clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
        );
      };

      const handlePaletteDrop = (clientX, clientY) => {
        if (!isOverMailSheet(clientX, clientY)) {
          clearPalettePreview();
          return;
        }
        const preview = palettePreview;
        const dropMeta = { ...paletteMeta };
        const span =
          dragPayload?.mode === "new"
            ? defaultSpanForType(dragPayload.type)
            : dragPayload?.mode === "module"
              ? defaultSpanForType(getModule(dragPayload.id)?.block?.type || "custom")
              : { gw: grid.cols, gh: 2 };
        const phantom = preview?.get(PHANTOM_ID) || null;
        clearPalettePreview();

        if (dragPayload?.mode === "new" && dragPayload.type) {
          const block = defaultBlock(dragPayload.type);
          if (isContainerType(block.type)) ensureChildren(block);
          normalizeBlockPadding(block);
          fitBlockGridHeight(block, grid);
          const blockSpan = defaultSpanForType(block.type, block, grid);
          block.gw = block.gw || blockSpan.gw;
          block.gh = block.gh || blockSpan.gh;
          const fallbackGy = contentBottom(scopeDoc());
          const pos = phantom || { gx: 0, gy: fallbackGy, gw: block.gw, gh: block.gh };
          if (!editScopeId && !canPlaceBlockAt(block, pos)) return;
          Object.assign(block, pos);
          normalizeBlockGrid(block, grid.cols);
          if (block.type === "button") block.buttonFill = true;
          syncImageWidthFromGrid(block, activeSheetWidth(), grid.cols);
          mutate(() => {
            if (editScopeId) {
              placeChildInScope(doc, editScopeId, block);
              if (phantom) Object.assign(block, phantom);
            } else {
              doc.blocks.push(block);
            }
            if (preview) {
              const withoutPhantom = new Map([...preview].filter(([k]) => k !== PHANTOM_ID));
              withoutPhantom.set(block.id, {
                gx: block.gx,
                gy: block.gy,
                gw: block.gw,
                gh: block.gh,
              });
              if (!editScopeId) clampLayoutPositions(doc, withoutPhantom);
              applyLayoutPositions(scopeDoc(), withoutPhantom);
            }
            if (dropMeta.mode !== "split") {
              const hit = scopeList().find(
                (b) => b.id !== block.id && !b.hidden && rectsOverlap(b, block),
              );
              if (hit) pushScopeOverlaps(block.id);
            }
            if (!editScopeId) growCanvasToContent();
            setSelection([block.id], { primary: block.id });
          });
          if (block.type === "image" && block.src) {
            void refitImageBlockFromSrc(block, grid, activeSheetWidth()).then(() => {
              scheduleSave();
              refresh();
            });
          }
        } else if (dragPayload?.mode === "module" && dragPayload.id) {
          const mod = getModule(dragPayload.id);
          if (mod?.block) {
            const block = structuredClone(mod.block);
            block.id = uid("block");
            const fallbackGy = contentBottom(scopeDoc());
            const pos = phantom || { gx: 0, gy: fallbackGy, gw: span.gw, gh: span.gh };
            if (!editScopeId && !canPlaceBlockAt(block, pos)) return;
            Object.assign(block, pos);
            normalizeBlockGrid(block, grid.cols);
            mutate(() => {
              if (editScopeId) placeChildInScope(doc, editScopeId, block);
              else doc.blocks.push(block);
              if (preview) {
                const withoutPhantom = new Map([...preview].filter(([k]) => k !== PHANTOM_ID));
                withoutPhantom.set(block.id, {
                  gx: block.gx,
                  gy: block.gy,
                  gw: block.gw,
                  gh: block.gh,
                });
                if (!editScopeId) clampLayoutPositions(doc, withoutPhantom);
                applyLayoutPositions(scopeDoc(), withoutPhantom);
              }
              if (dropMeta.mode !== "split") {
                const hit = scopeList().find(
                  (b) => b.id !== block.id && !b.hidden && rectsOverlap(b, block),
                );
                if (hit) pushScopeOverlaps(block.id);
              }
              if (!editScopeId) growCanvasToContent();
              setSelection([block.id], { primary: block.id });
            });
            if (block.type === "image" && block.src) {
              void refitImageBlockFromSrc(block, grid, activeSheetWidth()).then(() => {
                scheduleSave();
                refresh();
              });
            }
          }
        }
      };

      const onPaletteDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = dragPayload?.mode === "move" ? "move" : "copy";
        if (!dragPayload || (dragPayload.mode !== "new" && dragPayload.mode !== "module")) return;
        handlePaletteDragOver(e.clientX, e.clientY);
      };

      const onPaletteDragLeave = (e) => {
        e.stopPropagation();
        const host = e.currentTarget;
        if (host instanceof Element && !host.contains(e.relatedTarget)) {
          clearPalettePreview();
        }
      };

      const onPaletteDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!dragPayload) {
          const raw = e.dataTransfer?.getData("text/plain") || "";
          if (raw.startsWith("module-") || getModule(raw)) {
            dragPayload = { mode: "module", id: raw };
          } else if (raw) {
            dragPayload = { mode: "new", type: raw };
          }
        }
        if (dragPayload?.mode === "move" && dragPayload.id) {
          paletteDropSucceeded = true;
          const block = findBlockAnywhere(doc, dragPayload.id);
          const moveGw = block?.gw || grid.cols;
          const moveGh = block?.gh || 2;
          const pt = clientToSheet(e.clientX, e.clientY);
          const snapped = snapPxToGrid(
            pt.x,
            pt.y,
            activeSheetWidth(),
            grid,
            moveGw,
            moveGh,
            editScopeId ? null : canvasRowLimit(doc),
          );
          if (block && !block.locked) {
            mutate(() => {
              block.gx = snapped.gx;
              block.gy = snapped.gy;
              pushScopeOverlaps(block.id);
            });
            if (block.type === "image" && block.src) {
              void refitImageBlockFromSrc(block, grid, activeSheetWidth()).then(() => {
                scheduleSave();
                refresh();
              });
            }
          }
          dragPayload = null;
          return;
        }
        paletteDropSucceeded = true;
        handlePaletteDrop(e.clientX, e.clientY);
        dragPayload = null;
      };

      const stage = mount.querySelector("#mail-stage");
      if (stage) {
        stage.addEventListener("dragover", onPaletteDragOver);
        stage.addEventListener("dragleave", onPaletteDragLeave);
        stage.addEventListener("drop", onPaletteDrop);
      }
    }
  }

  function findInlineEditRoot(seg, block) {
    const content = seg.querySelector(".mail-seg-content");
    if (!content) return null;
    if (block.type === "callout") {
      return content.querySelector("td td") || content.querySelector("td");
    }
    if (block.type === "custom") {
      const divs = [...content.querySelectorAll("div")].filter((d) => d.childNodes.length);
      return divs.find((d) => /[a-z]/i.test(d.textContent || "")) || divs[0] || content.querySelector("td");
    }
    if (block.type === "list") {
      return content.querySelector("ul") || content.querySelector("td");
    }
    if (block.type === "button") {
      return content.querySelector("a") || content.querySelector("td");
    }
    // text
    return content.querySelector("div") || content.querySelector("td");
  }

  function commitInlineEdit({ discard = false, refreshAfter = true } = {}) {
    if (!inlineEditId) return;
    const id = inlineEditId;
    const block = doc.blocks.find((b) => b.id === id);
    const seg = mount.querySelector(`.mail-seg[data-seg-id="${id}"]`);
    const editor = seg?.querySelector(".mail-inline-editor");
    inlineEditId = null;
    if (!discard && block && editor) {
      if (block.type === "button") {
        const label = (editor.textContent || "").trim();
        if (label && label !== block.label) {
          pushHistory();
          block.label = label;
          scheduleSave();
        }
      } else if (block.type === "list") {
        const lis = [...editor.querySelectorAll("li")].map((li) => sanitizeRichHtml(li.innerHTML).trim()).filter(Boolean);
        const next = lis.length ? lis : [(editor.textContent || "").trim()].filter(Boolean);
        if (JSON.stringify(next) !== JSON.stringify(block.items || [])) {
          pushHistory();
          block.items = next;
          scheduleSave();
        }
      } else {
        const html = sanitizeRichHtml(editor.innerHTML);
        if (block.html !== html) {
          pushHistory();
          block.html = html;
          scheduleSave();
        }
      }
    }
    if (refreshAfter) refresh();
  }

  function wireInlineEdit() {
    if (!inlineEditId) return;
    const block = doc.blocks.find((b) => b.id === inlineEditId);
    const seg = mount.querySelector(`.mail-seg[data-seg-id="${inlineEditId}"]`);
    activateInlineEditor(block, seg);
  }

  function activateInlineEditor(block, seg) {
    if (!block || !seg || block.locked || !TEXT_BOX_TYPES.has(block.type)) {
      inlineEditId = null;
      return;
    }

    const root = findInlineEditRoot(seg, block);
    if (!root) {
      inlineEditId = null;
      return;
    }

    inlineEditId = block.id;
    root.contentEditable = "true";
    root.spellcheck = true;
    root.classList.add("mail-inline-editor");
    root.setAttribute("data-inline-edit", "html");
    // Allow double/triple click to highlight text
    root.style.userSelect = "text";
    root.style.webkitUserSelect = "text";

    root.addEventListener("pointerdown", (e) => e.stopPropagation());
    root.addEventListener("mousedown", (e) => e.stopPropagation());
    root.addEventListener("click", (e) => {
      // Prevent button links from navigating while editing
      if (block.type === "button") e.preventDefault();
      e.stopPropagation();
    });

    root.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        commitInlineEdit({ discard: true });
      }
    });

    root.addEventListener("blur", () => {
      requestAnimationFrame(() => {
        if (inlineEditId !== block.id) return;
        if (document.activeElement?.closest?.(".mail-inline-editor")) return;
        commitInlineEdit();
      });
    });

    requestAnimationFrame(() => {
      if (document.activeElement !== root) root.focus({ preventScroll: true });
    });
  }

  function syncResizeHud(block, label) {
    const hud = mount.querySelector(`.mail-seg[data-seg-id="${block.id}"] .mail-resize-hud`);
    if (!hud) return;
    let text = label;
    if (!text) {
      if (block.type === "spacer") text = `H ${block.size || 16}`;
      else if (block.type === "image")
        text = `W ${block.contentWidth || 100}% · img ${block.width || 536}px`;
      else if (block.type === "button") {
        text = `W ${block.contentWidth || 100}% · btn ${block.buttonPadX ?? 22}×${block.buttonPadY ?? 12}`;
      } else {
        text = `W ${block.contentWidth || 100}% · pad ${block.padTop ?? 16}/${block.padBottom ?? 16}`;
      }
    }
    hud.textContent = text;
    hud.hidden = false;
  }

  function wireToolRail() {
    mount.querySelectorAll("[data-canvas-tool]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        canvasTool = btn.getAttribute("data-canvas-tool") || "select";
        refresh();
      });
    });

    mount.querySelector("#fill-color")?.addEventListener("input", (e) => {
      fillColor = e.target.value;
    });
    mount.querySelector("#fill-color")?.addEventListener("click", (e) => e.stopPropagation());

    mount.querySelectorAll("[data-tool-action]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const action = btn.getAttribute("data-tool-action");
        const blocks = selectedBlocks().filter((b) => !b.locked);
        if (!blocks.length) return;
        if (action === "delete") {
          deleteSelected();
          return;
        }
        if (action === "duplicate") {
          pushHistory();
          const inserts = [];
          for (const block of blocks) {
            const idx = doc.blocks.findIndex((b) => b.id === block.id);
            if (idx < 0) continue;
            const copy = structuredClone(block);
            copy.id = uid("block");
            copy.locked = false;
            const grid = ensureDocGrid(doc);
            const span = { gw: copy.gw || defaultSpanForType(copy.type).gw, gh: copy.gh || defaultSpanForType(copy.type).gh };
            const slot = findNextSlot(doc, span.gw, span.gh);
            Object.assign(copy, slot);
            normalizeBlockGrid(copy, grid.cols);
            syncImageWidthFromGrid(copy, sheetWidth(), grid.cols);
            doc.blocks.splice(idx + 1 + inserts.length, 0, copy);
            inserts.push(copy.id);
          }
          setSelection(inserts.length ? inserts : [...selectedIds]);
          scheduleSave();
          refresh();
        }
      });
    });
  }

  function wireCanvasInspector() {
    const bg = mount.querySelector("#canvas-bg");
    const width = mount.querySelector("#canvas-width");
    const rows = mount.querySelector("#canvas-min-rows");
    const heightPx = mount.querySelector("#canvas-height-px");
    const grid = ensureDocGrid(doc);
    const syncHeightFields = () => {
      syncMinRowsToContent();
      const canvas = ensureCanvas(doc);
      const px = (canvas.minRows || 16) * grid.rowHeight;
      if (rows && document.activeElement !== rows) rows.value = String(canvas.minRows || 16);
      if (heightPx && document.activeElement !== heightPx) heightPx.value = String(px);
    };
    const applyMinRows = (next, soft = true) => {
      setCanvasMinRows(next);
      scheduleSave();
      syncHeightFields();
      if (soft) softPaint();
      else refresh();
    };
    bg?.addEventListener("input", () => {
      ensureCanvas(doc).bgColor = bg.value;
      scheduleSave();
      const root = mount.querySelector(".mail-canvas-root");
      if (root) root.style.background = bg.value;
    });
    width?.addEventListener("change", () => {
      doc.canvasWidth = Math.min(CANVAS_WIDTH_MAX, Math.max(CANVAS_WIDTH_MIN, Number(width.value) || CANVAS_WIDTH_DEFAULT));
      scheduleSave();
      refresh();
    });
    rows?.addEventListener("input", () => applyMinRows(Number(rows.value) || 16));
    rows?.addEventListener("change", () => applyMinRows(Number(rows.value) || 16, false));
    heightPx?.addEventListener("input", () => {
      const px = Number(heightPx.value) || 448;
      applyMinRows(px / grid.rowHeight);
    });
    heightPx?.addEventListener("change", () => {
      const px = Number(heightPx.value) || 448;
      applyMinRows(px / grid.rowHeight, false);
    });
    mount.querySelectorAll("[data-add-section-edge]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        insertSectionAtEdge(btn.getAttribute("data-add-section-edge") === "top" ? "top" : "bottom");
      });
    });
  }

  function wireMultiSelPanel() {
    mount.querySelector("#btn-fill-selection")?.addEventListener("click", () => {
      applyFillToTargets([...selectedIds]);
    });
    mount.querySelector("#btn-hide-selection")?.addEventListener("click", () => {
      mutate(() => {
        for (const b of selectedBlocks()) b.hidden = true;
      });
    });
    mount.querySelector("#btn-clear-selection")?.addEventListener("click", () => {
      setSelection(selectedId ? [selectedId] : []);
      refresh();
    });
  }

  function scrollSegIntoCamera(id) {
    // Never use element.scrollIntoView — it scrolls .main and blanks the builder.
    scrollToSelected = false;
    const stage = mount.querySelector("#mail-stage");
    const seg = mount.querySelector(`.mail-seg[data-seg-id="${id}"]`);
    if (!stage || !seg || viewPanX == null) return;
    const stageRect = stage.getBoundingClientRect();
    const segRect = seg.getBoundingClientRect();
    const pad = 48;
    let dx = 0;
    let dy = 0;
    if (segRect.left < stageRect.left + pad) dx = stageRect.left + pad - segRect.left;
    else if (segRect.right > stageRect.right - pad) dx = stageRect.right - pad - segRect.right;
    if (segRect.top < stageRect.top + pad) dy = stageRect.top + pad - segRect.top;
    else if (segRect.bottom > stageRect.bottom - pad) dy = stageRect.bottom - pad - segRect.bottom;
    if (dx || dy) {
      viewPanX += dx;
      viewPanY += dy;
      applyViewTransform();
    }
  }

  function refreshOrderList() {
    const panel = mount.querySelector('.insp-tab-panel[data-insp-panel="layers"]');
    if (!panel) return;
    panel.innerHTML = layersPanelHtml(doc, selectedIds, canvasFocus);
    wireLayerRows();
  }

  function paintSelectionClasses() {
    mount.querySelectorAll(".mail-seg").forEach((seg) => {
      const id = seg.getAttribute("data-seg-id");
      const on = selectedIds.has(id);
      seg.classList.toggle("is-active", on);
      seg.classList.toggle("is-multi", on && selectedIds.size > 1);
    });
    mount.querySelectorAll("[data-layer-id]").forEach((row) => {
      row.classList.toggle("is-active", selectedIds.has(row.getAttribute("data-layer-id")));
    });
  }

  function wireLayerRows() {
    mount.querySelectorAll("[data-select-base-layer]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectCanvasBase("canvas");
        refresh();
      });
    });

    mount.querySelectorAll("[data-layer-id]").forEach((row) => {
      const id = row.getAttribute("data-layer-id");
      row.addEventListener("click", (e) => {
        if (
          e.target.closest(
            "[data-layer-hide], [data-layer-lock], [data-layer-name], [data-layer-color], .layer-color-menu",
          )
        ) {
          return;
        }
        closeLayerColorMenus();
        canvasFocus = null;
        const b = doc.blocks.find((x) => x.id === id);
        if (b?.hidden) {
          mutate(() => {
            b.hidden = false;
          });
          setSelection([id], { primary: id });
          scrollSegIntoCamera(id);
          return;
        }
        if (e.shiftKey) {
          const next = new Set(selectedIds);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          setSelection([...next], { primary: id });
        } else {
          setSelection([id], { primary: id });
        }
        paintSelectionClasses();
        scrollSegIntoCamera(id);
        refreshEditPanel();
      });
      row.addEventListener("dragstart", (e) => {
        const b = doc.blocks.find((x) => x.id === id);
        if (b?.locked) {
          e.preventDefault();
          return;
        }
        dragPayload = { mode: "move", id };
        e.dataTransfer.setData("text/plain", id);
        e.dataTransfer.effectAllowed = "move";
        row.classList.add("is-dragging");
      });
      row.addEventListener("dragend", () => {
        row.classList.remove("is-dragging");
        dragPayload = null;
        mount.querySelectorAll(".layer-row.is-drop").forEach((el) => el.classList.remove("is-drop"));
      });
      row.addEventListener("dragover", (e) => {
        e.preventDefault();
        row.classList.add("is-drop");
      });
      row.addEventListener("dragleave", () => row.classList.remove("is-drop"));
      row.addEventListener("drop", (e) => {
        e.preventDefault();
        row.classList.remove("is-drop");
        const to = doc.blocks.findIndex((b) => b.id === id);
        if (to < 0 || !dragPayload?.id) return;
        moveTo(dragPayload.id, to);
        dragPayload = null;
      });
    });

    mount.querySelectorAll("[data-layer-name]").forEach((input) => {
      input.addEventListener("click", (e) => e.stopPropagation());
      input.addEventListener("keydown", (e) => e.stopPropagation());
      input.addEventListener("change", () => {
        const id = input.getAttribute("data-layer-name");
        const b = doc.blocks.find((x) => x.id === id);
        if (!b) return;
        const name = input.value.trim();
        mutate(() => {
          b.segmentName = name || undefined;
          if (!name) delete b.segmentName;
        });
      });
    });

    mount.querySelectorAll("[data-layer-hide]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-layer-hide");
        const b = doc.blocks.find((x) => x.id === id);
        if (!b) return;
        mutate(() => {
          b.hidden = !b.hidden;
        });
      });
    });

    mount.querySelectorAll("[data-layer-lock]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-layer-lock");
        const b = doc.blocks.find((x) => x.id === id);
        if (!b) return;
        mutate(() => {
          b.locked = !b.locked;
        });
      });
    });

    mount.querySelectorAll("[data-layer-color]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-layer-color");
        const menu = mount.querySelector(`[data-layer-color-menu="${id}"]`);
        const wasOpen = menu?.classList.contains("is-open");
        closeLayerColorMenus();
        if (menu && !wasOpen) menu.classList.add("is-open");
      });
    });

    mount.querySelectorAll("[data-layer-set-color]").forEach((swatch) => {
      swatch.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = swatch.getAttribute("data-layer-set-color");
        const color = swatch.getAttribute("data-color");
        if (!id || !color) return;
        mutate(
          () => {
            const b = doc.blocks.find((x) => x.id === id);
            if (b) b.labelColor = color;
          },
          { refreshUi: false },
        );
        refreshOrderList();
        closeLayerColorMenus();
      });
    });
  }

  function wireResizeHandles() {
    const startResize = (e, kind, blockId) => {
      e.preventDefault();
      e.stopPropagation();
      const block = blockId ? doc.blocks.find((b) => b.id === blockId) : null;
      if (kind !== "artboard" && kind !== "artboard-height" && (!block || block.locked)) return;

      resizing = true;
      pushHistory();
      const sheet = mount.querySelector("#mail-sheet");
      if (kind === "artboard" || kind === "artboard-height") {
        sheet?.classList.add("is-artboard-resizing");
      }
      const startX = e.clientX;
      const startY = e.clientY;
      const start = {
        size: block?.size || 16,
        width: block?.width || 536,
        padTop: block?.padTop ?? 16,
        padBottom: block?.padBottom ?? 16,
        padX: block?.padX ?? 32,
        contentWidth: block?.contentWidth || 100,
        buttonPadX: block?.buttonPadX ?? 22,
        buttonPadY: block?.buttonPadY ?? 12,
        buttonFontSize: block?.buttonFontSize || 14,
        canvasWidth: Number(doc.canvasWidth) || PREVIEW_WIDTHS.desktop,
        minRows: (() => {
          syncMinRowsToContent();
          return ensureCanvas(doc).minRows || 16;
        })(),
        rowHeight: ensureDocGrid(doc).rowHeight,
      };

      const hud = block
        ? mount.querySelector(`.mail-seg[data-seg-id="${block.id}"] .mail-resize-hud`)
        : null;
      if (hud) hud.hidden = false;

      const artboardTip = (text) => {
        const tip =
          mount.querySelector(".mail-artboard-hud") ||
          (() => {
            const el = document.createElement("div");
            el.className = "mail-artboard-hud";
            mount.querySelector("#mail-sheet")?.appendChild(el);
            return el;
          })();
        tip.textContent = text;
      };

      const onMove = (ev) => {
        const dx = (ev.clientX - startX) / viewZoom;
        const dy = (ev.clientY - startY) / viewZoom;
        if (kind === "artboard") {
          doc.canvasWidth = Math.round(
            Math.min(CANVAS_WIDTH_MAX, Math.max(CANVAS_WIDTH_MIN, start.canvasWidth + dx)),
          );
          paintArtboardFrame();
          const grid = ensureDocGrid(doc);
          const w = sheetWidth();
          mount.querySelectorAll(".mail-seg.is-grid-item").forEach((seg) => {
            const b = findBlockAnywhere(doc, seg.getAttribute("data-seg-id"));
            if (b) seg.style.cssText = blockFrameStyle(b, w, grid);
          });
          const lines = mount.querySelector(".mail-grid-lines");
          if (lines) lines.style.backgroundSize = `${(w / grid.cols).toFixed(2)}px ${grid.rowHeight}px`;
          artboardTip(`Email width ${doc.canvasWidth}px`);
          return;
        }
        if (kind === "artboard-height") {
          setCanvasMinRows(start.minRows + dy / start.rowHeight);
          paintArtboardFrame();
          const rows = ensureCanvas(doc).minRows || 16;
          artboardTip(`Email height ${rows * start.rowHeight}px`);
          return;
        }
        if (!block) return;
        if (kind === "spacer-s") {
          block.size = Math.round(Math.min(120, Math.max(4, start.size + dy)));
          syncResizeHud(block);
        } else if (kind === "image-e" || kind === "image-se") {
          const d = kind === "image-se" ? (dx + dy) / 2 : dx;
          block.width = Math.round(Math.min(600, Math.max(120, start.width + d)));
          syncResizeHud(block);
        } else         if (kind === "pad-n") {
          block.padTop = Math.round(Math.min(80, Math.max(0, start.padTop - dy)));
          fitBlockGridHeight(block, ensureDocGrid(doc));
          syncResizeHud(block);
        } else if (kind === "pad-s") {
          block.padBottom = Math.round(Math.min(80, Math.max(0, start.padBottom + dy)));
          fitBlockGridHeight(block, ensureDocGrid(doc));
          syncResizeHud(block);
        } else if (kind === "custom-e") {
          block.contentWidth = Math.round(Math.min(100, Math.max(40, start.contentWidth + dx / 4)));
          syncResizeHud(block);
        } else if (kind === "custom-w") {
          block.padX = Math.round(Math.min(64, Math.max(8, start.padX + dx / 2)));
          syncResizeHud(block, `PadX ${block.padX}`);
        } else if (kind === "btn-se") {
          block.buttonPadX = Math.round(Math.min(48, Math.max(8, start.buttonPadX + dx / 2)));
          block.buttonPadY = Math.round(Math.min(28, Math.max(6, start.buttonPadY + dy / 2)));
          if (Math.abs(dx) + Math.abs(dy) > 24) {
            block.buttonFontSize = Math.round(
              Math.min(22, Math.max(12, start.buttonFontSize + (dx + dy) / 40)),
            );
          }
          syncResizeHud(block, `Btn ${block.buttonPadX}×${block.buttonPadY}`);
        } else if (kind === "box-se" || kind === "box-ne" || kind === "box-sw" || kind === "box-nw") {
          const widen = kind === "box-se" || kind === "box-ne" ? dx : -dx;
          const padDy = kind === "box-se" || kind === "box-sw" ? dy : -dy;
          block.contentWidth = Math.round(Math.min(100, Math.max(40, start.contentWidth + widen / 4)));
          if (kind === "box-se" || kind === "box-sw") {
            block.padBottom = Math.round(Math.min(80, Math.max(0, start.padBottom + padDy)));
          } else {
            block.padTop = Math.round(Math.min(80, Math.max(0, start.padTop + padDy)));
          }
          if (kind === "box-sw" || kind === "box-nw") {
            block.padX = Math.round(Math.min(64, Math.max(8, start.padX + dx / 3)));
          }
          syncResizeHud(block);
        }
        softPaint();
      };

      const onUp = () => {
        resizing = false;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        scheduleSave();
        if (hud) hud.hidden = true;
        mount.querySelector(".mail-artboard-hud")?.remove();
        mount.querySelector("#mail-sheet")?.classList.remove("is-artboard-resizing");
        // Refresh inspector values without losing camera
        refresh();
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    };

    mount.querySelectorAll(".mail-resize-handle[data-resize]").forEach((handle) => {
      handle.addEventListener("pointerdown", (e) => {
        const seg = handle.closest("[data-seg-id]");
        startResize(e, handle.getAttribute("data-resize"), seg?.getAttribute("data-seg-id"));
      });
    });

    mount.querySelectorAll(".mail-artboard-handle").forEach((handle) => {
      handle.addEventListener("pointerdown", (e) => {
        startResize(e, handle.getAttribute("data-resize") || "artboard", null);
      });
    });
  }

  async function refitAllImages() {
    const grid = ensureDocGrid(doc);
    const sheetW = sheetWidth();
    const queue = [];
    const walk = (blocks) => {
      for (const b of blocks || []) {
        if (b.type === "image" && b.src) queue.push(b);
        if (b.children?.length) walk(b.children);
      }
    };
    walk(doc.blocks);
    for (const block of queue) {
      block.ghManual = false;
      await refitImageBlockFromSrc(block, grid, sheetW);
    }
  }

  void refitAllImages().then(() => refresh());
  if (!mount.dataset.inspBound) {
    mount.dataset.inspBound = "1";
    mount.addEventListener("click", (e) => {
      if (!e.target.closest("[data-layer-color], .layer-color-menu")) {
        closeLayerColorMenus();
      }
    });
  }
}

function gridResizeChromeHtml(blockType) {
  const edges =
    blockType === "image"
      ? [
          ["e", "is-e", "Stretch right"],
          ["w", "is-w", "Stretch left"],
        ]
      : [
          ["n", "is-n", "Stretch up"],
          ["s", "is-s", "Stretch down"],
          ["e", "is-e", "Stretch right"],
          ["w", "is-w", "Stretch left"],
          ["nw", "is-corner is-nw", "Resize"],
          ["ne", "is-corner is-ne", "Resize"],
          ["sw", "is-corner is-sw", "Resize"],
          ["se", "is-corner is-se", "Resize"],
        ];
  return `<div class="mail-seg-chrome is-grid-chrome" aria-hidden="false">
    <div class="mail-resize-hud" hidden></div>
    ${edges
      .map(
        ([k, cls, title]) =>
          `<button type="button" class="mail-resize-handle ${cls}" data-grid-resize="${k}" title="${title}" aria-label="${title}"></button>`,
      )
      .join("")}
  </div>`;
}

function resizeChromeHtml(block) {
  const handles = [];
  if (block.type === "spacer") {
    handles.push(
      `<button type="button" class="mail-resize-handle is-s" data-resize="spacer-s" title="Section height" aria-label="Resize height"></button>`,
    );
  } else {
    // Every content section: pad + box width (independent of email canvas width)
    handles.push(
      `<button type="button" class="mail-resize-handle is-n" data-resize="pad-n" title="Padding top" aria-label="Padding top"></button>`,
    );
    handles.push(
      `<button type="button" class="mail-resize-handle is-s" data-resize="pad-s" title="Padding bottom" aria-label="Padding bottom"></button>`,
    );
    handles.push(
      `<button type="button" class="mail-resize-handle is-w" data-resize="custom-w" title="Side padding" aria-label="Side padding"></button>`,
    );
    if (block.type === "image") {
      handles.push(
        `<button type="button" class="mail-resize-handle is-e" data-resize="custom-e" title="Section width %" aria-label="Section width"></button>`,
      );
      handles.push(
        `<button type="button" class="mail-resize-handle is-corner is-se" data-resize="image-se" title="Image pixel width" aria-label="Image size"></button>`,
      );
      handles.push(
        `<button type="button" class="mail-resize-handle is-corner is-ne" data-resize="image-e" title="Image width" aria-label="Image width"></button>`,
      );
    } else if (block.type === "button") {
      handles.push(
        `<button type="button" class="mail-resize-handle is-e" data-resize="custom-e" title="Section width %" aria-label="Section width"></button>`,
      );
      handles.push(
        `<button type="button" class="mail-resize-handle is-corner is-se" data-resize="btn-se" title="Button size" aria-label="Button size"></button>`,
      );
      handles.push(
        `<button type="button" class="mail-resize-handle is-corner is-ne" data-resize="box-ne" title="Resize" aria-label="Resize"></button>`,
      );
      handles.push(
        `<button type="button" class="mail-resize-handle is-corner is-nw" data-resize="box-nw" title="Resize" aria-label="Resize"></button>`,
      );
      handles.push(
        `<button type="button" class="mail-resize-handle is-corner is-sw" data-resize="box-sw" title="Resize" aria-label="Resize"></button>`,
      );
    } else {
      handles.push(
        `<button type="button" class="mail-resize-handle is-e" data-resize="custom-e" title="Section width %" aria-label="Section width"></button>`,
      );
      handles.push(
        `<button type="button" class="mail-resize-handle is-corner is-nw" data-resize="box-nw" title="Resize" aria-label="Resize"></button>`,
      );
      handles.push(
        `<button type="button" class="mail-resize-handle is-corner is-ne" data-resize="box-ne" title="Resize" aria-label="Resize"></button>`,
      );
      handles.push(
        `<button type="button" class="mail-resize-handle is-corner is-sw" data-resize="box-sw" title="Resize" aria-label="Resize"></button>`,
      );
      handles.push(
        `<button type="button" class="mail-resize-handle is-corner is-se" data-resize="box-se" title="Resize" aria-label="Resize"></button>`,
      );
    }
  }
  return `<div class="mail-seg-chrome" aria-hidden="false">
    <div class="mail-resize-hud" hidden></div>
    ${handles.join("")}
  </div>`;
}

function resolveLabelColor(block, index) {
  return block.labelColor || LAYER_LABEL_COLORS[index % LAYER_LABEL_COLORS.length];
}

function layerColorMenuHtml(blockId, currentColor) {
  return `<div class="layer-color-grid" role="listbox" aria-label="Label color">
    ${LAYER_LABEL_COLORS.map(
      (color) =>
        `<button
          type="button"
          class="layer-color-swatch ${currentColor === color ? "is-active" : ""} ${color === "#f8fafc" ? "is-light" : ""}"
          data-layer-set-color="${blockId}"
          data-color="${color}"
          style="background-color:${color}"
          title="${color}"
          aria-label="${color}"
        ></button>`,
    ).join("")}
  </div>`;
}

function layersPanelHtml(docOrBlocks, selectedIds, canvasFocus = null) {
  const isDoc = docOrBlocks && Array.isArray(docOrBlocks.blocks);
  const blocks = (isDoc ? docOrBlocks.blocks : docOrBlocks) || [];
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds ? [selectedIds] : []);
  const addonBlocks = blocks;

  const baseRows = `
    <button type="button" class="layer-row layer-row-base ${canvasFocus === "canvas" ? "is-active" : ""}" data-select-base-layer="canvas">
      <span class="layer-index" aria-hidden="true">▣</span>
      <span class="layer-base-label">Email canvas</span>
    </button>`;

  return `<div class="layer-list" role="list">
    <p class="layer-hint">Canvas is the email base. Blocks below (including Header) are addons — drag on the canvas to place and resize.</p>
    ${baseRows}
    ${addonBlocks
      .map((b, i) => {
        const label = escapeHtml(b.segmentName || labelFor(b));
        const chipColor = resolveLabelColor(b, i);
        return `<div class="layer-row-wrap">
          <div class="layer-row ${selected.has(b.id) ? "is-active" : ""} ${b.hidden ? "is-hidden-layer" : ""} ${b.locked ? "is-locked" : ""}" data-layer-id="${b.id}" draggable="${b.locked ? "false" : "true"}" role="listitem">
            <span class="layer-index" aria-hidden="true">${i + 1}</span>
            <button
              type="button"
              class="layer-label-color ${chipColor === "#f8fafc" ? "is-light" : ""}"
              data-layer-color="${b.id}"
              style="background-color:${chipColor}"
              title="Label color"
              aria-label="Label color"
            ></button>
            <input class="layer-name-input" data-layer-name="${b.id}" value="${label}" title="Rename" />
            <button type="button" class="layer-icon-btn" data-layer-hide="${b.id}" title="${b.hidden ? "Show" : "Hide"}">${b.hidden ? "Show" : "Hide"}</button>
            <button type="button" class="layer-icon-btn" data-layer-lock="${b.id}" title="${b.locked ? "Unlock" : "Lock"}">${b.locked ? "Unlock" : "Lock"}</button>
          </div>
          <div class="layer-color-menu" data-layer-color-menu="${b.id}">
            ${layerColorMenuHtml(b.id, chipColor)}
          </div>
        </div>`;
      })
      .join("")}
  </div>`;
}

function emptyCanvasHintHtml(inScope, minH, rowHeight) {
  if (inScope) {
    return `<div class="mail-scope-empty is-compact"><p>Container is empty</p><span>Drop text, buttons, images here</span></div>`;
  }
  const defaultH = CANVAS_ROWS_DEFAULT * rowHeight;
  if (minH > defaultH + 48) return "";
  return `<div class="mail-scope-empty is-compact"><p>Start your email</p><span>Drag blocks from the left, or drop a GIF / image here</span></div>`;
}

function canvasInspectorHtml(doc) {
  const canvas = ensureCanvas(doc);
  const grid = ensureDocGrid(doc);
  const w = Number(doc.canvasWidth) || CANVAS_WIDTH_DEFAULT;
  const bottom = contentBottom(doc);
  const hardMax = CANVAS_ROWS_MAX;
  const rows = Math.min(hardMax, Math.max(CANVAS_ROWS_MIN, Number(canvas.minRows) || CANVAS_ROWS_DEFAULT));
  canvas.minRows = rows;
  const heightPx = rows * grid.rowHeight;
  const overflow = bottom > rows;
  return `
    <div class="block-panel">
      <div class="block-panel-head"><strong>Email canvas</strong></div>
      <p class="field-hint">Drag the bottom edge to resize height, or the right edge for width (up to ${CANVAS_WIDTH_MAX}px).</p>
      <p class="field-hint">Drag the bottom edge to resize height, or the right edge for width (up to ${CANVAS_WIDTH_MAX}px).${overflow ? " Some content currently extends past the artboard." : ""}</p>
      <label class="field field-color-row"><span>Background</span><input id="canvas-bg" type="color" value="${escapeHtml(safeHex(canvas.bgColor, "#ffffff"))}" /></label>
      <label class="field"><span>Email width (px)</span><input id="canvas-width" type="number" min="${CANVAS_WIDTH_MIN}" max="${CANVAS_WIDTH_MAX}" value="${w}" /></label>
      <div class="field-row">
        <label class="field"><span>Height (px)</span><input id="canvas-height-px" type="number" min="${CANVAS_ROWS_MIN * grid.rowHeight}" max="${hardMax * grid.rowHeight}" step="${grid.rowHeight}" value="${heightPx}" /></label>
        <label class="field"><span>Height (rows)</span><input id="canvas-min-rows" type="number" min="${CANVAS_ROWS_MIN}" max="${hardMax}" value="${rows}" /></label>
      </div>
    </div>`;
}

function richField(id, label, value) {
  const html = plainToHtml(value || "");
  return `
    <div class="field rte-field">
      <span>${label}</span>
      ${richToolbarHtml(id)}
      <div class="rte-editor" id="${id}" contenteditable="true" spellcheck="true">${html}</div>
    </div>`;
}

function footerInspectorHtml(block) {
  block.links = Array.isArray(block.links)
    ? block.links
    : block.linkLabel
      ? [{ label: block.linkLabel, href: block.linkHref || "https://jantaus.com/" }]
      : [];
  block.social = block.social || [];
  block.logos = block.logos || [];
  const links = block.links;
  const social = block.social;
  const logos = block.logos;
  const networks = [
    ["linkedin", "LinkedIn"],
    ["instagram", "Instagram"],
    ["twitter", "X / Twitter"],
    ["facebook", "Facebook"],
    ["youtube", "YouTube"],
    ["website", "Website"],
  ];
  return `
    <p class="field-hint">Footer supports multiple links, social badges, and client logos. Everything exports in the copied HTML.</p>
    <label class="field"><span>Tagline</span><input data-key="tagline" type="text" value="${escapeHtml(block.tagline || "")}" placeholder="Optional line above links" /></label>
    <label class="field"><span>Company</span><input data-key="company" type="text" value="${escapeHtml(block.company || "")}" /></label>
    <label class="field"><span>Location</span><input data-key="location" type="text" value="${escapeHtml(block.location || "")}" /></label>
    <details class="insp-fold" open>
      <summary>Links</summary>
      <div class="footer-link-rows">
        ${links
          .map(
            (link, i) => `
          <div class="footer-link-row">
            <label class="field"><span>Label</span><input data-footer-link="${i}" data-field="label" type="text" value="${escapeHtml(link.label || "")}" /></label>
            <label class="field"><span>URL</span><input data-footer-link="${i}" data-field="href" type="text" value="${escapeHtml(link.href || "")}" /></label>
            <button type="button" class="btn btn-ghost" data-footer-link-del="${i}">Remove</button>
          </div>`,
          )
          .join("")}
      </div>
      <button type="button" class="btn btn-ghost" id="btn-footer-link-add">+ Add link</button>
    </details>
    <details class="insp-fold" open>
      <summary>Social</summary>
      <label class="check"><input type="checkbox" data-key="showSocial" ${block.showSocial !== false ? "checked" : ""}/> Show social icons</label>
      <label class="field"><span>Icon size</span><input data-key="socialSize" type="number" min="22" max="40" value="${block.socialSize || 28}" /></label>
      ${networks
        .map(([network, label]) => {
          const row = social.find((s) => s.network === network) || { network, href: "", label };
          const idx = social.findIndex((s) => s.network === network);
          return `
        <div class="footer-social-row">
          <label class="field"><span>${label}</span><input data-footer-social="${network}" data-field="href" type="url" value="${escapeHtml(row.href || "")}" placeholder="https://…" /></label>
          <input type="hidden" data-footer-social="${network}" data-field="network" value="${network}" />
          <input type="hidden" data-footer-social-index="${idx >= 0 ? idx : social.length}" value="${network}" />
        </div>`;
        })
        .join("")}
    </details>
    <details class="insp-fold">
      <summary>Client logos</summary>
      <label class="check"><input type="checkbox" data-key="showLogos" ${block.showLogos ? "checked" : ""}/> Show client logos</label>
      <div class="field-row">
        <label class="field"><span>Logo height</span><input data-key="logoHeight" type="number" min="20" max="64" value="${block.logoHeight || 32}" /></label>
        <label class="field"><span>Gap</span><input data-key="logoGap" type="number" min="4" max="24" value="${block.logoGap || 12}" /></label>
      </div>
      <div class="footer-logo-rows">
        ${logos
          .map(
            (logo, i) => `
          <div class="footer-logo-row">
            <label class="field"><span>Image URL</span><input data-footer-logo="${i}" data-field="src" type="url" value="${escapeHtml(logo.src || "")}" /></label>
            <label class="field"><span>Alt</span><input data-footer-logo="${i}" data-field="alt" type="text" value="${escapeHtml(logo.alt || "")}" /></label>
            <label class="field"><span>Link</span><input data-footer-logo="${i}" data-field="href" type="url" value="${escapeHtml(logo.href || "")}" /></label>
            <label class="field"><span>Width</span><input data-footer-logo="${i}" data-field="width" type="number" min="40" max="160" value="${logo.width || 80}" /></label>
            <button type="button" class="btn btn-ghost" data-footer-logo-del="${i}">Remove</button>
          </div>`,
          )
          .join("")}
      </div>
      <div class="dropzone" id="footer-logo-drop"><p>Drop logo image or browse</p><input type="file" id="footer-logo-file" accept="image/*" /></div>
      <button type="button" class="btn btn-ghost" id="btn-footer-logo-add">+ Add logo slot</button>
    </details>
    <label class="check"><input type="checkbox" data-key="showDivider" ${block.showDivider !== false ? "checked" : ""}/> Top divider line</label>
    <div class="field-row">
      <label class="field field-color-row"><span>Text</span><input data-key="color" type="color" value="${escapeHtml(safeHex(block.color, "#5a6a7a"))}" /></label>
      <label class="field field-color-row"><span>Links</span><input data-key="linkColor" type="color" value="${escapeHtml(safeHex(block.linkColor, "#3a84dc"))}" /></label>
    </div>
    <label class="field"><span>Font size</span><input data-key="fontSize" type="number" min="10" max="16" value="${block.fontSize || 11}" /></label>`;
}

function inspectorHtml(block) {
  normalizeBgFields(block);

  const align = ["left", "center", "right"]
    .map(
      (a) =>
        `<button type="button" class="align-btn ${block.align === a ? "is-active" : ""}" data-align="${a}">${a[0].toUpperCase()}</button>`,
    )
    .join("");

  let body = "";
  if (block.type === "header") {
    body = `
      <label class="check"><input type="checkbox" data-key="showLogo" ${block.showLogo !== false ? "checked" : ""}/> Show logo</label>
      <label class="field"><span>Eyebrow</span><input data-key="eyebrow" type="text" value="${escapeHtml(block.eyebrow || "")}" /></label>
      <label class="field"><span>Heading</span><input data-key="heading" type="text" value="${escapeHtml(block.heading || "")}" /></label>
      <label class="field field-color-row"><span>Background</span><input data-key="bgColor" type="color" value="${escapeHtml(safeHex(block.bgColor, "#1a2332"))}" /></label>`;
  } else if (block.type === "section") {
    const radius = block.borderRadius ?? (block.rounded ? 8 : 0);
    body = `
      <label class="field"><span>Section name</span><input data-key="segmentName" type="text" value="${escapeHtml(block.segmentName || "")}" /></label>
      <label class="field"><span>Corner radius</span><input data-key="borderRadius" type="number" min="0" max="48" value="${radius}" /></label>
      <p class="field-hint">Double-click this section on the canvas to move &amp; resize elements <em>inside</em> it. Outer email canvas stays unchanged.</p>
      <button type="button" class="btn btn-ghost" id="btn-enter-section">Edit inside section</button>`;
  } else if (block.type === "text") {
    body = `
      ${richField("rte-html", "Text", block.html || "")}
      <div class="field-row">
        <label class="field field-color-row"><span>Color</span><input data-key="color" type="color" value="${escapeHtml(safeHex(block.color, "#1a2332"))}" /></label>
        <label class="field"><span>Size</span><input data-key="fontSize" type="number" min="12" max="22" value="${block.fontSize || 15}" /></label>
      </div>
      <label class="field"><span>Section width %</span><input data-key="contentWidth" type="number" min="40" max="100" value="${block.contentWidth ?? 100}" /></label>`;
  } else if (block.type === "image") {
    const layout = block.layout || "full";
    const radius = block.borderRadius ?? (block.rounded ? 8 : 0);
    body = `
      <div class="dropzone" id="img-drop"><p>Drop GIF / image here, or browse</p><input type="file" id="img-file" accept="image/*,.gif,image/gif" /></div>
      <label class="field"><span>URL</span><input data-key="src" type="url" value="${escapeHtml(block.src || "")}" /></label>
      <label class="field"><span>Alt</span><input data-key="alt" type="text" value="${escapeHtml(block.alt || "")}" /></label>
      <label class="field"><span>Layout</span>
        <select data-key="layout">
          <option value="full" ${layout === "full" ? "selected" : ""}>Full width</option>
          <option value="left" ${layout === "left" ? "selected" : ""}>GIF left · text right</option>
          <option value="right" ${layout === "right" ? "selected" : ""}>Text left · GIF right</option>
        </select>
      </label>
      ${
        layout !== "full"
          ? `<label class="field"><span>GIF width</span><input data-key="width" type="number" min="80" max="600" value="${block.width || 220}" /></label>
             ${richField("rte-html", "Side text", block.html || "")}
             <p class="field-hint">Tip: use ~180–240 width so the GIF stays a small column.</p>`
          : `<p class="field-hint">Image size follows the segment width on the canvas — drag the side handles to resize.</p>
             <label class="field"><span>Caption</span><input data-key="caption" type="text" value="${escapeHtml(block.caption || "")}" /></label>`
      }
      <label class="field"><span>Corner radius</span><input data-key="borderRadius" type="number" min="0" max="48" value="${radius}" /></label>`;
  } else if (block.type === "button") {
    body = `
      <label class="field"><span>Label</span><input data-key="label" type="text" value="${escapeHtml(block.label || "")}" /></label>
      <label class="field"><span>URL</span><input data-key="href" type="text" value="${escapeHtml(block.href || "")}" /></label>
      <label class="field field-color-row"><span>Button</span><input data-key="buttonColor" type="color" value="${escapeHtml(safeHex(block.buttonColor, "#3a84dc"))}" /></label>
      <label class="field field-color-row"><span>Label color</span><input data-key="buttonTextColor" type="color" value="${escapeHtml(safeHex(block.buttonTextColor, "#ffffff"))}" /></label>
      <div class="field-row">
        <label class="field"><span>Pad X</span><input data-key="buttonPadX" type="number" min="8" max="48" value="${block.buttonPadX ?? 22}" /></label>
        <label class="field"><span>Pad Y</span><input data-key="buttonPadY" type="number" min="6" max="28" value="${block.buttonPadY ?? 12}" /></label>
      </div>
      <div class="field-row">
        <label class="field"><span>Font size</span><input data-key="buttonFontSize" type="number" min="12" max="22" value="${block.buttonFontSize || 14}" /></label>
        <label class="field"><span>Radius</span><input data-key="buttonRadius" type="number" min="0" max="24" value="${block.buttonRadius ?? 6}" /></label>
      </div>`;
  } else if (block.type === "metrics") {
    body = (block.items || [])
      .map(
        (it, i) => `
      <div class="metric-fields">
        <label class="field"><span>Value ${i + 1}</span><input data-metric="${i}" data-field="value" value="${escapeHtml(it.value)}" /></label>
        <label class="field"><span>Label ${i + 1}</span><input data-metric="${i}" data-field="label" value="${escapeHtml(it.label)}" /></label>
      </div>`,
      )
      .join("");
  } else if (block.type === "columns") {
    body = `
      ${richField("rte-left", "Left", block.left || "")}
      ${richField("rte-right", "Right", block.right || "")}`;
  } else if (block.type === "callout") {
    body = `
      ${richField("rte-html", "Text", block.html || "")}
      <div class="field-row">
        <label class="field field-color-row"><span>Accent</span><input data-key="accent" type="color" value="${escapeHtml(safeHex(block.accent, "#3a84dc"))}" /></label>
        <label class="field field-color-row"><span>Box</span><input data-key="calloutBg" type="color" value="${escapeHtml(safeHex(block.calloutBg, "#f4f7fa"))}" /></label>
      </div>
      <label class="field"><span>Section width %</span><input data-key="contentWidth" type="number" min="40" max="100" value="${block.contentWidth ?? 100}" /></label>`;
  } else if (block.type === "list") {
    const listHtml =
      (block.items || []).length > 0
        ? `<ul>${(block.items || []).map((it) => `<li>${plainToHtml(it)}</li>`).join("")}</ul>`
        : "";
    body = `
      <div class="field rte-field">
        <span>Items</span>
        ${richToolbarHtml("list-items-rte")}
        <div class="rte-editor" id="list-items-rte" contenteditable="true">${listHtml}</div>
        <p class="field-hint">Use the list button, or one item per line.</p>
      </div>`;
  } else if (block.type === "spacer") {
    body = `<label class="field"><span>Height</span><input data-key="size" type="number" min="4" max="120" value="${block.size || 16}" /></label>`;
  } else if (block.type === "divider") {
    body = `<label class="field field-color-row"><span>Line</span><input data-key="color" type="color" value="${escapeHtml(safeHex(block.color, "#d8dee6"))}" /></label>`;
  } else if (block.type === "footer") {
    body = footerInspectorHtml(block);
  } else if (block.type === "custom") {
    body = customInspectorBody(block);
  }

  const sectionWidthField =
    block.type !== "spacer"
      ? `<label class="field"><span>Section width %</span><input data-key="contentWidth" type="number" min="40" max="100" value="${block.contentWidth ?? 100}" /><p class="field-hint">Shrinks this block only — email canvas width stays separate.</p></label>`
      : "";

  const padFields =
    block.type === "spacer"
      ? ""
      : `<div class="field-row">
        <label class="field"><span>Pad top</span><input data-key="padTop" type="number" min="0" max="80" value="${block.padTop ?? 16}" /></label>
        <label class="field"><span>Pad bottom</span><input data-key="padBottom" type="number" min="0" max="80" value="${block.padBottom ?? 16}" /></label>
      </div>
      <label class="field"><span>Pad sides</span><input data-key="padX" type="number" min="0" max="64" value="${block.padX ?? 32}" /></label>`;

  // Avoid duplicating contentWidth already shown in text/callout/custom bodies
  const widthAlreadyInBody =
    block.type === "text" || block.type === "callout" || block.type === "custom";
  const widthField = widthAlreadyInBody ? "" : sectionWidthField;

  const showBg = block.type !== "spacer" && block.type !== "divider";

  return `
    <div class="block-panel">
      <div class="block-panel-head">
        <strong>${labelFor(block)}</strong>
        <div class="align-group">${align}</div>
      </div>
      ${body}
      ${widthField}
      ${padFields}
      ${showBg ? backgroundPanel(block) : ""}
    </div>`;
}

function customInspectorBody(block) {
  const fam = block.fontFamily || "dm";
  return `
    <p class="field-hint">Typography, frame, media, and CTA. Save to reuse from Blocks → Saved.</p>
    <label class="field"><span>Segment name</span><input data-key="segmentName" type="text" value="${escapeHtml(block.segmentName || "")}" placeholder="e.g. Proof strip" /></label>

    <details class="insp-fold" open>
      <summary>Content</summary>
      <label class="check"><input type="checkbox" data-key="showTitle" ${block.showTitle !== false ? "checked" : ""}/> Show title</label>
      <label class="field"><span>Title</span><input data-key="title" type="text" value="${escapeHtml(block.title || "")}" /></label>
      ${richField("rte-html", "Body", block.html || "")}
    </details>

    <details class="insp-fold" open>
      <summary>Typography</summary>
      <label class="field"><span>Font</span>
        <select data-key="fontFamily">
          <option value="dm" ${fam === "dm" ? "selected" : ""}>DM Sans</option>
          <option value="helvetica" ${fam === "helvetica" ? "selected" : ""}>Helvetica</option>
          <option value="arial" ${fam === "arial" ? "selected" : ""}>Arial</option>
          <option value="georgia" ${fam === "georgia" ? "selected" : ""}>Georgia</option>
          <option value="verdana" ${fam === "verdana" ? "selected" : ""}>Verdana</option>
          <option value="trebuchet" ${fam === "trebuchet" ? "selected" : ""}>Trebuchet</option>
          <option value="mono" ${fam === "mono" ? "selected" : ""}>Monospace</option>
        </select>
      </label>
      <div class="field-row">
        <label class="field field-color-row"><span>Text</span><input data-key="color" type="color" value="${escapeHtml(safeHex(block.color, "#1a2332"))}" /></label>
        <label class="field field-color-row"><span>Links</span><input data-key="linkColor" type="color" value="${escapeHtml(safeHex(block.linkColor, "#3a84dc"))}" /></label>
      </div>
      <div class="field-row">
        <label class="field"><span>Size</span><input data-key="fontSize" type="number" min="11" max="36" value="${block.fontSize || 15}" /></label>
        <label class="field"><span>Weight</span><input data-key="fontWeight" type="number" min="300" max="800" step="100" value="${block.fontWeight || 400}" /></label>
      </div>
      <div class="field-row">
        <label class="field"><span>Line height</span><input data-key="lineHeight" type="number" min="1" max="2.4" step="0.05" value="${block.lineHeight ?? 1.55}" /></label>
        <label class="field"><span>Tracking</span><input data-key="letterSpacing" type="number" min="-0.05" max="0.2" step="0.01" value="${block.letterSpacing ?? 0}" /></label>
      </div>
      <div class="field-row">
        <label class="field field-color-row"><span>Title</span><input data-key="titleColor" type="color" value="${escapeHtml(safeHex(block.titleColor, "#3a84dc"))}" /></label>
        <label class="field"><span>Title size</span><input data-key="titleSize" type="number" min="10" max="28" value="${block.titleSize || 12}" /></label>
      </div>
      <div class="field-row">
        <label class="field"><span>Title weight</span><input data-key="titleWeight" type="number" min="400" max="800" step="100" value="${block.titleWeight || 700}" /></label>
        <label class="field"><span>Title track</span><input data-key="titleTracking" type="number" min="0" max="0.2" step="0.01" value="${block.titleTracking ?? 0.06}" /></label>
      </div>
      <label class="field"><span>Title case</span>
        <select data-key="titleTransform">
          <option value="uppercase" ${block.titleTransform !== "none" && block.titleTransform !== "capitalize" ? "selected" : ""}>Uppercase</option>
          <option value="none" ${block.titleTransform === "none" ? "selected" : ""}>As typed</option>
          <option value="capitalize" ${block.titleTransform === "capitalize" ? "selected" : ""}>Capitalize</option>
        </select>
      </label>
    </details>

    <details class="insp-fold">
      <summary>Frame &amp; accent</summary>
      <label class="field"><span>Content width %</span><input data-key="contentWidth" type="number" min="40" max="100" value="${block.contentWidth ?? 100}" /></label>
      <label class="field field-color-row"><span>Inner fill</span><input data-key="innerBg" type="color" value="${escapeHtml(safeHex(block.innerBg || "#ffffff", "#ffffff"))}" /></label>
      <label class="check"><input type="checkbox" data-key="useInnerBg" ${block.useInnerBg ? "checked" : ""}/> Use inner fill</label>
      <label class="field"><span>Inner pad</span><input data-key="innerPad" type="number" min="0" max="48" value="${block.innerPad ?? 0}" /></label>
      <div class="field-row">
        <label class="field"><span>Border</span><input data-key="borderWidth" type="number" min="0" max="8" value="${block.borderWidth ?? 0}" /></label>
        <label class="field field-color-row"><span>Color</span><input data-key="borderColor" type="color" value="${escapeHtml(safeHex(block.borderColor, "#d8dee6"))}" /></label>
      </div>
      <div class="field-row">
        <label class="field"><span>Radius</span><input data-key="borderRadius" type="number" min="0" max="24" value="${block.borderRadius ?? 0}" /></label>
        <label class="field"><span>Style</span>
          <select data-key="borderStyle">
            <option value="solid" ${block.borderStyle !== "dashed" && block.borderStyle !== "dotted" ? "selected" : ""}>Solid</option>
            <option value="dashed" ${block.borderStyle === "dashed" ? "selected" : ""}>Dashed</option>
            <option value="dotted" ${block.borderStyle === "dotted" ? "selected" : ""}>Dotted</option>
          </select>
        </label>
      </div>
      <label class="check"><input type="checkbox" data-key="showAccent" ${block.showAccent ? "checked" : ""}/> Accent bar</label>
      <div class="field-row">
        <label class="field field-color-row"><span>Accent</span><input data-key="accentColor" type="color" value="${escapeHtml(safeHex(block.accentColor, "#3a84dc"))}" /></label>
        <label class="field"><span>Thickness</span><input data-key="accentWidth" type="number" min="1" max="12" value="${block.accentWidth || 3}" /></label>
      </div>
      <label class="field"><span>Accent side</span>
        <select data-key="accentSide">
          <option value="left" ${block.accentSide !== "top" ? "selected" : ""}>Left</option>
          <option value="top" ${block.accentSide === "top" ? "selected" : ""}>Top</option>
        </select>
      </label>
    </details>

    <details class="insp-fold">
      <summary>Image</summary>
      <label class="check"><input type="checkbox" data-key="showImage" ${block.showImage ? "checked" : ""}/> Include image / GIF</label>
      <div class="dropzone" id="custom-img-drop"><p>Drop image or GIF</p><input type="file" id="custom-img-file" accept="image/*,.gif,image/gif" /></div>
      <label class="field"><span>URL</span><input data-key="imageSrc" type="url" value="${escapeHtml(block.imageSrc || "")}" /></label>
      <label class="field"><span>Alt</span><input data-key="imageAlt" type="text" value="${escapeHtml(block.imageAlt || "")}" /></label>
      <div class="field-row">
        <label class="field"><span>Width</span><input data-key="imageWidth" type="number" min="80" max="600" value="${block.imageWidth || 536}" /></label>
        <label class="field"><span>Place</span>
          <select data-key="imagePosition">
            <option value="above" ${block.imagePosition === "above" || !block.imagePosition ? "selected" : ""}>Above copy</option>
            <option value="below" ${block.imagePosition === "below" ? "selected" : ""}>Below copy</option>
            <option value="left" ${block.imagePosition === "left" ? "selected" : ""}>Left of copy</option>
            <option value="right" ${block.imagePosition === "right" ? "selected" : ""}>Right of copy</option>
          </select>
        </label>
      </div>
      <p class="field-hint">For side-by-side, set width ~180–240.</p>
      <label class="check"><input type="checkbox" data-key="imageRounded" ${block.imageRounded ? "checked" : ""}/> Rounded corners</label>
    </details>

    <details class="insp-fold">
      <summary>Button</summary>
      <label class="check"><input type="checkbox" data-key="showButton" ${block.showButton ? "checked" : ""}/> Include button</label>
      <label class="field"><span>Label</span><input data-key="buttonLabel" type="text" value="${escapeHtml(block.buttonLabel || "")}" /></label>
      <label class="field"><span>URL</span><input data-key="buttonHref" type="text" value="${escapeHtml(block.buttonHref || "")}" /></label>
      <div class="field-row">
        <label class="field field-color-row"><span>Fill</span><input data-key="buttonColor" type="color" value="${escapeHtml(safeHex(block.buttonColor, "#3a84dc"))}" /></label>
        <label class="field field-color-row"><span>Label</span><input data-key="buttonTextColor" type="color" value="${escapeHtml(safeHex(block.buttonTextColor, "#ffffff"))}" /></label>
      </div>
      <div class="field-row">
        <label class="field"><span>Radius</span><input data-key="buttonRadius" type="number" min="0" max="24" value="${block.buttonRadius ?? 4}" /></label>
        <label class="field"><span>Size</span><input data-key="buttonFontSize" type="number" min="11" max="20" value="${block.buttonFontSize || 14}" /></label>
      </div>
      <div class="field-row">
        <label class="field"><span>Pad X</span><input data-key="buttonPadX" type="number" min="8" max="40" value="${block.buttonPadX ?? 22}" /></label>
        <label class="field"><span>Pad Y</span><input data-key="buttonPadY" type="number" min="6" max="24" value="${block.buttonPadY ?? 12}" /></label>
      </div>
      <label class="field"><span>Button align</span>
        <select data-key="buttonAlign">
          <option value="left" ${block.buttonAlign === "left" || !block.buttonAlign ? "selected" : ""}>Left</option>
          <option value="center" ${block.buttonAlign === "center" ? "selected" : ""}>Center</option>
          <option value="right" ${block.buttonAlign === "right" ? "selected" : ""}>Right</option>
        </select>
      </label>
    </details>`;
}

function normalizeBgFields(block) {
  if (!block.bgColor && block.bg && block.bg !== "transparent") {
    block.bgColor = block.bg;
  }
  if (block.bgOpacity == null) {
    block.bgOpacity = block.bgColor || block.type === "header" ? 100 : 0;
  }
  if (block.type === "header" && !block.bgColor) {
    block.bgColor = "#1a2332";
    block.bgOpacity = 100;
  }
}

function safeHex(value, fallback) {
  const v = String(value || fallback || "#ffffff").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return fallback;
}

function backgroundPanel(block) {
  const color = safeHex(block.bgColor || (block.type === "header" ? "#1a2332" : "#ffffff"), "#ffffff");
  const opacity = block.bgOpacity != null ? Number(block.bgOpacity) : block.bgColor ? 100 : 0;
  const hasPhoto = Boolean(block.bgImage);
  const previewUrl = hasPhoto ? String(block.bgImage).replaceAll("'", "%27").replaceAll('"', "%22") : "";

  return `
    <details class="bg-panel" ${block.bgColor || block.bgImage ? "open" : ""}>
      <summary class="bg-panel-head">
        <span>Background</span>
        <button type="button" class="bg-clear" id="bg-clear" title="Clear color &amp; photo">Clear</button>
      </summary>
      <div class="bg-row">
        <label class="bg-swatch" title="Pick a color">
          <input type="color" id="bg-color" value="${escapeHtml(color)}" />
        </label>
        <label class="bg-opacity">
          <span>Opacity ${opacity}%</span>
          <input type="range" id="bg-opacity" min="0" max="100" value="${opacity}" />
        </label>
      </div>
      <div class="bg-color-actions">
        <button type="button" class="bg-action" id="bg-color-undo" title="Undo last color change" disabled>Undo</button>
        <button type="button" class="bg-action" id="bg-color-reset" title="Reset color to default">Reset</button>
      </div>
      ${hasPhoto ? `<p class="bg-hint">Color tints the photo</p>` : ""}
      <div class="bg-photo ${hasPhoto ? "has-photo" : ""}" id="bg-photo-drop">
        <input type="file" id="bg-photo-file" accept="image/*" hidden />
        ${
          hasPhoto
            ? `<div class="bg-photo-preview" style="background-image:url('${previewUrl}')"></div>
               <div class="bg-photo-meta">
                 <span>Photo</span>
                 <div class="bg-photo-actions">
                   <button type="button" id="bg-photo-replace">Replace</button>
                   <button type="button" id="bg-photo-remove">Remove</button>
                 </div>
               </div>`
            : `<button type="button" class="bg-photo-add" id="bg-photo-browse">
                 <span class="bg-photo-add-title">Add photo</span>
                 <span class="bg-photo-add-sub">Drop or click</span>
               </button>`
        }
      </div>
      ${
        hasPhoto
          ? `<div class="bg-fit" role="group" aria-label="Photo fit">
              <button type="button" class="bg-fit-btn ${block.bgSize !== "contain" ? "is-active" : ""}" data-bg-size="cover">Cover</button>
              <button type="button" class="bg-fit-btn ${block.bgSize === "contain" ? "is-active" : ""}" data-bg-size="contain">Contain</button>
            </div>`
          : ""
      }
    </details>`;
}

function defaultBlock(type) {
  const id = uid("block");
  switch (type) {
    case "header":
      return {
        id,
        type,
        align: "left",
        showLogo: true,
        eyebrow: "Janta Power",
        heading: "New headline",
        bgColor: "#1a2332",
        bgOpacity: 100,
        padTop: 16,
        padBottom: 16,
        padX: 32,
        contentWidth: 100,
      };
    case "text":
      return {
        id,
        type,
        align: "left",
        html: "New paragraph for {{FirstName}}…",
        fontSize: 15,
        color: "#1a2332",
        padTop: 16,
        padBottom: 16,
        padX: 32,
        contentWidth: 100,
      };
    case "image":
      return {
        id,
        type,
        align: "center",
        src: "",
        alt: "",
        caption: "",
        html: "",
        layout: "full",
        width: 280,
        borderRadius: 0,
        fontSize: 15,
        color: "#1a2332",
        padTop: 8,
        padBottom: 8,
        padX: 32,
        contentWidth: 100,
      };
    case "button":
      return {
        id,
        type,
        align: "left",
        label: "Call to action",
        href: "https://jantaus.com/",
        buttonColor: "#3a84dc",
        buttonTextColor: "#ffffff",
        buttonPadX: 22,
        buttonPadY: 12,
        buttonFontSize: 14,
        buttonRadius: 6,
        padTop: 16,
        padBottom: 16,
        padX: 32,
        contentWidth: 100,
      };
    case "metrics":
      return {
        id,
        type,
        align: "center",
        items: [
          { value: "50%", label: "More energy" },
          { value: "3×", label: "Power / area" },
          { value: "34%", label: "Capacity factor" },
        ],
        padTop: 8,
        padBottom: 8,
        padX: 32,
        contentWidth: 100,
      };
    case "columns":
      return {
        id,
        type,
        align: "left",
        left: "Left column copy.",
        right: "Right column copy.",
        padTop: 12,
        padBottom: 12,
        padX: 32,
        contentWidth: 100,
      };
    case "callout":
      return {
        id,
        type,
        align: "left",
        html: "Highlight a key proof point or offer.",
        accent: "#3a84dc",
        calloutBg: "#f4f7fa",
        padTop: 12,
        padBottom: 12,
        padX: 32,
        contentWidth: 100,
      };
    case "list":
      return {
        id,
        type,
        align: "left",
        items: ["First point", "Second point", "Third point"],
        padTop: 16,
        padBottom: 16,
        padX: 32,
        contentWidth: 100,
      };
    case "divider":
      return { id, type, color: "#d8dee6", padTop: 12, padBottom: 12, padX: 32, contentWidth: 100 };
    case "spacer":
      return { id, type, size: 24 };
    case "attachments":
      return {
        id,
        type,
        items: [
          { name: "One-pager.pdf", sizeLabel: "240 KB" },
          { name: "Site photo.jpg", sizeLabel: "1.2 MB" },
        ],
        padTop: 12,
        padBottom: 12,
        padX: 32,
        contentWidth: 100,
      };
    case "footer":
      return {
        id,
        type,
        align: "center",
        company: "Janta Power",
        location: "Dallas, TX",
        tagline: "",
        links: [{ label: "jantaus.com", href: "https://jantaus.com/" }],
        social: [
          { network: "linkedin", href: "https://www.linkedin.com/company/janta-power", label: "LinkedIn" },
          { network: "website", href: "https://jantaus.com/", label: "Website" },
        ],
        logos: [],
        showSocial: true,
        showLogos: false,
        showDivider: true,
        logoHeight: 32,
        logoGap: 12,
        socialSize: 28,
        color: "#5a6a7a",
        linkColor: "#3a84dc",
        fontSize: 11,
        padTop: 16,
        padBottom: 16,
        padX: 32,
        contentWidth: 100,
      };
    case "custom":
      return {
        id,
        type,
        align: "left",
        segmentName: "Custom section",
        showTitle: true,
        title: "Your section",
        titleColor: "#3a84dc",
        titleSize: 12,
        titleWeight: 700,
        titleTransform: "uppercase",
        titleTracking: 0.06,
        html: "Design this section however you like — <strong>bold</strong>, <em>italic</em>, <a href=\"https://jantaus.com/\">links</a>, lists…",
        color: "#1a2332",
        linkColor: "#3a84dc",
        fontSize: 15,
        fontWeight: 400,
        fontFamily: "dm",
        lineHeight: 1.55,
        letterSpacing: 0,
        padTop: 16,
        padBottom: 16,
        padX: 32,
        contentWidth: 100,
        useInnerBg: false,
        innerBg: "#ffffff",
        innerPad: 0,
        borderWidth: 0,
        borderColor: "#d8dee6",
        borderRadius: 0,
        borderStyle: "solid",
        showAccent: false,
        accentColor: "#3a84dc",
        accentWidth: 3,
        accentSide: "left",
        showImage: false,
        imageSrc: "",
        imageAlt: "",
        imageWidth: 536,
        imageRounded: false,
        imagePosition: "above",
        showButton: false,
        buttonLabel: "Learn more",
        buttonHref: "https://jantaus.com/",
        buttonColor: "#3a84dc",
        buttonTextColor: "#ffffff",
        buttonRadius: 4,
        buttonFontSize: 14,
        buttonPadX: 22,
        buttonPadY: 12,
        buttonAlign: "left",
      };
    default:
      return { id, type: "text", align: "left", html: "" };
  }
}

function labelFor(b) {
  if (!b) return "";
  if (b.segmentName) return b.segmentName;
  return SEGMENTS.find((s) => s.type === b.type)?.label || b.type;
}

function wireDropzone(el, onFiles) {
  const onDragOver = (e) => {
    if (![...(e.dataTransfer?.types || [])].includes("Files")) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    el.classList.add("is-drop");
  };
  el.addEventListener("dragenter", onDragOver);
  el.addEventListener("dragover", onDragOver);
  el.addEventListener("dragleave", (e) => {
    if (!el.contains(e.relatedTarget)) el.classList.remove("is-drop");
  });
  el.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.classList.remove("is-drop");
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length) onFiles(files);
  });
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function flash(btn, label) {
  if (!btn) return;
  const prev = btn.innerHTML;
  btn.textContent = label;
  setTimeout(() => {
    btn.innerHTML = prev;
  }, 1100);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
