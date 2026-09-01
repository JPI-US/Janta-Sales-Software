/** Snap-grid layout helpers (studio) + Gmail-safe table packing (export). */

export const DEFAULT_GRID = { cols: 12, rowHeight: 28 };
export const ALIGN_THRESHOLD = 1; // grid cells
/** Studio artboard height — tall enough for a real email, not a skyscraper. */
export const CANVAS_ROWS_MIN = 8;
export const CANVAS_ROWS_MAX = 28;
export const CANVAS_ROWS_DEFAULT = 14;
/** Email width — 600 is default; up to 800 stays usable in most clients. */
export const CANVAS_WIDTH_MIN = 320;
export const CANVAS_WIDTH_MAX = 800;
export const CANVAS_WIDTH_DEFAULT = 600;

export function ensureDocGrid(doc) {
  if (!doc.grid || typeof doc.grid !== "object") doc.grid = { ...DEFAULT_GRID };
  doc.grid.cols = Math.min(24, Math.max(4, Number(doc.grid.cols) || DEFAULT_GRID.cols));
  doc.grid.rowHeight = Math.min(64, Math.max(16, Number(doc.grid.rowHeight) || DEFAULT_GRID.rowHeight));
  return doc.grid;
}

/** Email canvas (white artboard) — separate from addon elements. */
export function ensureCanvas(doc) {
  if (!doc.canvas || typeof doc.canvas !== "object") {
    doc.canvas = {
      bgColor: "#ffffff",
      bgOpacity: 100,
      minRows: CANVAS_ROWS_DEFAULT,
      padX: 0,
      padY: 0,
    };
  }
  if (!doc.canvas.bgColor) doc.canvas.bgColor = "#ffffff";
  if (doc.canvas.bgOpacity == null) doc.canvas.bgOpacity = 100;
  if (doc.canvas.minRows == null) doc.canvas.minRows = CANVAS_ROWS_DEFAULT;
  const raw = Number(doc.canvas.minRows) || CANVAS_ROWS_DEFAULT;
  doc.canvas.minRows = Math.min(CANVAS_ROWS_MAX, Math.max(CANVAS_ROWS_MIN, raw));
  return doc.canvas;
}

/** Legacy chrome object — kept for migration only; headers are normal blocks now. */
export function ensureBaseHeader(doc) {
  if (!doc.baseHeader || typeof doc.baseHeader !== "object") {
    doc.baseHeader = {
      enabled: false,
      showLogo: true,
      eyebrow: "Janta Power",
      heading: "More Power. Less Land.",
      bgColor: "#1a2332",
      bgOpacity: 100,
    };
  }
  return doc.baseHeader;
}

/**
 * Older builds stored the brand bar as canvas baseHeader chrome.
 * Rehydrate that as a normal header block at the top, then disable chrome.
 */
export function migrateBaseHeaderToBlock(doc) {
  const bh = ensureBaseHeader(doc);
  doc.blocks = doc.blocks || [];
  const hasHeader = doc.blocks.some((b) => b.type === "header");
  if (bh.enabled && !hasHeader) {
    const grid = ensureDocGrid(doc);
    const span = defaultSpanForType("header");
    const block = {
      id: `block-hdr-${Date.now().toString(36)}`,
      type: "header",
      align: "left",
      showLogo: bh.showLogo !== false,
      eyebrow: bh.eyebrow || "Janta Power",
      heading: bh.heading || "More Power. Less Land.",
      bgColor: bh.bgColor || "#1a2332",
      bgOpacity: bh.bgOpacity != null ? bh.bgOpacity : 100,
      gx: 0,
      gy: 0,
      gw: span.gw,
      gh: span.gh,
    };
    for (const b of doc.blocks) {
      if (b.hidden) continue;
      normalizeBlockGrid(b, grid.cols);
      b.gy += span.gh;
    }
    doc.blocks.unshift(block);
  }
  bh.enabled = false;
  return doc;
}

export function isGridLayout(_doc) {
  // Unified canvas editor — stack/grid are no longer separate modes
  return true;
}

/** True when blocks lack grid coords or overlap (e.g. all stuck at gy=0). */
function blocksNeedRestack(doc) {
  const grid = ensureDocGrid(doc);
  const blocks = (doc.blocks || []).filter((b) => b && !b.hidden);
  if (blocks.length < 2) return false;
  for (let i = 0; i < blocks.length; i++) {
    normalizeBlockGrid(blocks[i], grid.cols);
    for (let j = i + 1; j < blocks.length; j++) {
      normalizeBlockGrid(blocks[j], grid.cols);
      if (rectsOverlap(blocks[i], blocks[j])) return true;
    }
  }
  return false;
}

/** Preset-style docs: every visible block is full canvas width in one column. */
function isFullWidthStack(doc) {
  const grid = ensureDocGrid(doc);
  const blocks = (doc.blocks || []).filter((b) => b && !b.hidden);
  if (!blocks.length) return true;
  return blocks.every((b) => {
    normalizeBlockGrid(b, grid.cols);
    return b.gx === 0 && b.gw === grid.cols;
  });
}

/** Recompute gh from content; returns true if any block height changed. */
export function refitAllBlockHeights(doc) {
  const grid = ensureDocGrid(doc);
  let changed = false;
  for (const b of doc.blocks || []) {
    if (!b || b.hidden) continue;
    const prevGh = b.gh;
    normalizeBlockPadding(b);
    fitBlockGridHeight(b, grid);
    if (b.gh !== prevGh) changed = true;
  }
  return changed;
}

/** Grow artboard minRows so stacked content fits (used for presets / first layout). Capped at CANVAS_ROWS_MAX. */
export function growCanvasToFitContent(doc) {
  const canvas = ensureCanvas(doc);
  const bottom = contentBottom(doc);
  canvas.minRows = Math.min(
    CANVAS_ROWS_MAX,
    Math.max(canvas.minRows || CANVAS_ROWS_DEFAULT, bottom, CANVAS_ROWS_MIN),
  );
  return canvas.minRows;
}

export function enableGridLayout(doc, { growCanvas = false } = {}) {
  doc.layoutMode = "grid";
  const grid = ensureDocGrid(doc);
  migrateBaseHeaderToBlock(doc);
  const blocks = doc.blocks || [];

  const heightsChanged = refitAllBlockHeights(doc);

  // Placement must run before ensureCanvas — contentBottom normalizes missing gy to 0,
  // which would skip placeBlocksSmart and leave every block stacked at the origin.
  const needsPlace =
    blocks.some((b) => b && !b.hidden && (b.gx == null || b.gy == null || b.gw == null || b.gh == null)) ||
    blocksNeedRestack(doc);

  if (needsPlace) placeBlocksSmart(doc);
  ensureCanvas(doc);
  if (growCanvas || (heightsChanged && isFullWidthStack(doc))) growCanvasToFitContent(doc);
  if (!needsPlace) blocks.forEach((b) => b && normalizeBlockGrid(b, grid.cols));
}

/** @deprecated Kept for older saves; unified editor never switches back to stack. */
export function disableGridLayout(doc) {
  enableGridLayout(doc);
}

export const DEFAULT_CELL_PAD = 16;

/** Equal vertical padding defaults for canvas blocks. */
export function normalizeBlockPadding(block) {
  if (block.padTop == null && block.padBottom == null) {
    block.padTop = DEFAULT_CELL_PAD;
    block.padBottom = DEFAULT_CELL_PAD;
  } else if (block.padTop == null) {
    block.padTop = block.padBottom ?? DEFAULT_CELL_PAD;
  } else if (block.padBottom == null) {
    block.padBottom = block.padTop;
  }
  if (block.padX == null) block.padX = 32;
  return block;
}

/** Strip tags and collapse whitespace for line-count heuristics. */
function htmlPlainText(html = "") {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Estimate rendered line count for email-width copy (~52 chars per line at 600px). */
function estimateHtmlLineCount(html = "", charsPerLine = 52) {
  const raw = String(html || "");
  const brCount = (raw.match(/<br\s*\/?>/gi) || []).length;
  const paraCount = Math.max(0, (raw.match(/<\/p>/gi) || []).length);
  const plain = htmlPlainText(raw);
  const wrapped = plain ? Math.ceil(plain.length / charsPerLine) : 1;
  return Math.max(1, brCount + 1, paraCount || 0, wrapped);
}

function estimateRichTextHeightPx(html, fontSize = 15, lineHeight = 1.55) {
  const lines = estimateHtmlLineCount(html);
  return Math.round(fontSize * lineHeight * lines);
}

/** Rough inner content height in px (studio layout only). */
export function estimateBlockContentHeightPx(block) {
  switch (block.type) {
    case "header": {
      let h = 0;
      if (block.showLogo !== false) h += 48 + 14;
      if (block.eyebrow) h += 18;
      const headingLines = Math.max(1, Math.ceil(String(block.heading || "").length / 34));
      h += Math.round(22 * 1.3 * headingLines);
      return h;
    }
    case "button":
      return (block.buttonPadY ?? 12) * 2 + Math.round((block.buttonFontSize || 14) * 1.4);
    case "text":
      return estimateRichTextHeightPx(block.html || block.text || "", block.fontSize || 15);
    case "image": {
      if (!block.src) return 48;
      const layout = block.layout || "full";
      const displayW = Number(block.width) || 280;
      const captionLines = block.caption ? estimateHtmlLineCount(block.caption, 40) : 0;
      const captionH = captionLines ? captionLines * 18 + 8 : 0;
      const imgH = imageDisplayHeightFromWidth(block, displayW);
      if (layout === "left" || layout === "right") {
        const copyH = block.html ? estimateRichTextHeightPx(block.html, block.fontSize || 15) : 0;
        return Math.max(imgH, copyH) + captionH;
      }
      return imgH + captionH;
    }
    case "metrics":
      return 64;
    case "columns": {
      const leftLines = estimateHtmlLineCount(block.left, 28);
      const rightLines = estimateHtmlLineCount(block.right, 28);
      return Math.max(leftLines, rightLines) * 22 + 12;
    }
    case "callout":
      return estimateRichTextHeightPx(block.html || block.text || "", 15, 1.5) + 20;
    case "list": {
      const n = Math.max(1, (block.items || []).filter(Boolean).length);
      return n * 26 + 4;
    }
    case "divider":
      return 1;
    case "spacer":
      return Math.max(8, Number(block.height) || Number(block.size) || 24);
    case "attachments":
      return 56;
    case "footer": {
      let h = 20;
      if (block.tagline) h += 18;
      const links = Array.isArray(block.links)
        ? block.links.filter((l) => l?.label || l?.href)
        : block.linkLabel
          ? [{ label: block.linkLabel }]
          : [];
      if (links.length) h += 18;
      const social = (block.social || []).filter((s) => s?.href);
      if (block.showSocial !== false && social.length) h += (block.socialSize || 28) + 10;
      const logos = (block.logos || []).filter((l) => l?.src);
      if (block.showLogos && logos.length) h += (block.logoHeight || 32) + 12;
      if (block.showDivider !== false) h += 10;
      if (block.company || block.location) h += 18;
      return h;
    }
    case "section":
      return 120;
    case "custom":
      return 96;
    default:
      return 40;
  }
}

/** Size grid row span to content + symmetric padding. */
export function fitBlockGridHeight(block, grid = DEFAULT_GRID) {
  if (block.ghManual) return block;
  normalizeBlockPadding(block);
  const rowH = grid.rowHeight || DEFAULT_GRID.rowHeight;
  const totalPx = (block.padTop ?? DEFAULT_CELL_PAD) + estimateBlockContentHeightPx(block) + (block.padBottom ?? DEFAULT_CELL_PAD);
  block.gh = Math.max(1, Math.min(48, Math.ceil(totalPx / rowH)));
  return block;
}

/** Default span — full canvas width; side-by-side only happens when hovering another block. */
export function defaultSpanForType(type, block = null, grid = DEFAULT_GRID) {
  if (block) {
    normalizeBlockPadding(block);
    fitBlockGridHeight(block, grid);
    return { gw: block.gw ?? 12, gh: block.gh };
  }
  switch (type) {
    case "header":
      return { gw: 12, gh: 5 };
    case "section":
      return { gw: 12, gh: 10 };
    case "button":
      return { gw: 12, gh: 3 };
    case "image":
      return { gw: 12, gh: 2 };
    case "text":
      return { gw: 12, gh: 3 };
    case "metrics":
      return { gw: 12, gh: 3 };
    case "columns":
      return { gw: 12, gh: 3 };
    case "callout":
      return { gw: 12, gh: 3 };
    case "list":
      return { gw: 12, gh: 3 };
    case "divider":
      return { gw: 12, gh: 1 };
    case "spacer":
      return { gw: 12, gh: 2 };
    case "attachments":
      return { gw: 12, gh: 3 };
    case "footer":
      return { gw: 12, gh: 2 };
    case "custom":
      return { gw: 12, gh: 5 };
    default:
      return { gw: 12, gh: 3 };
  }
}

/** Clamp / fill missing gx,gy,gw,gh on a block. */
export function normalizeBlockGrid(block, cols = 12) {
  const d = defaultSpanForType(block.type);
  let gw = Math.max(1, Math.min(cols, Number(block.gw) || d.gw));
  let gh = Math.max(1, Math.min(48, Number(block.gh) || d.gh));
  let gx = Number.isFinite(Number(block.gx)) ? Number(block.gx) : 0;
  let gy = Number.isFinite(Number(block.gy)) ? Number(block.gy) : 0;
  gx = Math.max(0, Math.min(cols - gw, gx));
  gy = Math.max(0, gy);
  block.gx = gx;
  block.gy = gy;
  block.gw = gw;
  block.gh = gh;
  return block;
}

export function rectsOverlap(a, b) {
  return (
    a.gx < b.gx + b.gw &&
    a.gx + a.gw > b.gx &&
    a.gy < b.gy + b.gh &&
    a.gy + a.gh > b.gy
  );
}

/** Place addons stacked full-width (prior stack feel). Side-by-side is hover-only. */
export function placeBlocksSmart(doc) {
  const grid = ensureDocGrid(doc);
  const cols = grid.cols;
  let y = 0;
  for (const b of doc.blocks || []) {
    b.gx = 0;
    b.gy = y;
    b.gw = cols;
    normalizeBlockPadding(b);
    fitBlockGridHeight(b, grid);
    normalizeBlockGrid(b, cols);
    y += b.gh;
  }
}

export function placeBlocksStacked(doc) {
  placeBlocksSmart(doc);
}

/** Block whose footprint contains the pointer cell (excluding one id). */
export function hitTestBlockAt(doc, colX, rowY, excludeId = null) {
  const grid = ensureDocGrid(doc);
  const cols = grid.cols;
  const x = Math.max(0, Math.min(cols - 1, Math.floor(colX)));
  const y = Math.max(0, Math.floor(rowY));
  for (const b of doc.blocks || []) {
    if (!b || b.hidden || b.id === excludeId) continue;
    normalizeBlockGrid(b, cols);
    if (x >= b.gx && x < b.gx + b.gw && y >= b.gy && y < b.gy + b.gh) return b;
  }
  return null;
}

/**
 * @deprecated Headers are normal blocks; use migrateBaseHeaderToBlock instead.
 */
export function extractHeaderToBase(doc) {
  migrateBaseHeaderToBlock(doc);
  return null;
}

/** Bottom row used by content only (ignores canvas minRows). */
export function contentBottom(doc) {
  const grid = ensureDocGrid(doc);
  let max = 0;
  for (const b of doc.blocks || []) {
    if (b.hidden) continue;
    normalizeBlockGrid(b, grid.cols);
    max = Math.max(max, b.gy + b.gh);
  }
  return max;
}

/** Canvas height floor in rows (content + minRows). */
export function maxGridRow(doc) {
  const canvas = ensureCanvas(doc);
  return Math.max(canvas.minRows || 16, contentBottom(doc));
}

function cellFree(occ, x, y, gw, gh, cols) {
  for (let r = y; r < y + gh; r++) {
    const row = occ[r] || (occ[r] = {});
    for (let c = x; c < x + gw; c++) {
      if (c >= cols) return false;
      if (row[c]) return false;
    }
  }
  return true;
}

function markOcc(occ, x, y, gw, gh, id) {
  for (let r = y; r < y + gh; r++) {
    const row = occ[r] || (occ[r] = {});
    for (let c = x; c < x + gw; c++) row[c] = id;
  }
}

function buildOcc(doc, excludeId = null) {
  const grid = ensureDocGrid(doc);
  const occ = {};
  for (const b of doc.blocks || []) {
    if (b.hidden || b.id === excludeId) continue;
    normalizeBlockGrid(b, grid.cols);
    markOcc(occ, b.gx, b.gy, b.gw, b.gh, b.id);
  }
  return occ;
}

/** Active artboard height in grid rows (user-set canvas size, capped at CANVAS_ROWS_MAX). */
export function canvasRowLimit(doc) {
  const canvas = ensureCanvas(doc);
  return Math.min(
    CANVAS_ROWS_MAX,
    Math.max(CANVAS_ROWS_MIN, Number(canvas.minRows) || CANVAS_ROWS_DEFAULT),
  );
}

/** Next free slot for a new block (scan top→bottom, left→right). */
/** Whether a block's grid box fits within the artboard row cap. */
export function blockFitsCanvasRows(block, rowLimit = CANVAS_ROWS_MAX) {
  const gy = Number(block?.gy) || 0;
  const gh = Math.max(1, Number(block?.gh) || 1);
  return gy + gh <= rowLimit;
}

/** Clamp a grid rect to the artboard (width + row cap). */
export function clampBlockGridPos(doc, rect) {
  const grid = ensureDocGrid(doc);
  const cols = grid.cols;
  const rowLimit = canvasRowLimit(doc);
  const gh = Math.max(1, Math.min(48, Number(rect.gh) || 1));
  const gw = Math.max(1, Math.min(cols, Number(rect.gw) || 1));
  const gx = Math.max(0, Math.min(cols - gw, Number(rect.gx) || 0));
  const gy = Math.max(0, Math.min(rowLimit - gh, Number(rect.gy) || 0));
  return { gx, gy, gw, gh };
}

export function findNextSlot(doc, gw, gh, excludeId = null) {
  const grid = ensureDocGrid(doc);
  const cols = grid.cols;
  const occ = buildOcc(doc, excludeId);
  const spanW = Math.max(1, Math.min(cols, gw));
  const spanH = Math.max(1, gh);
  const rowLimit = canvasRowLimit(doc);
  for (let y = 0; y <= rowLimit - spanH; y++) {
    for (let x = 0; x <= cols - spanW; x++) {
      if (cellFree(occ, x, y, spanW, spanH, cols)) {
        return { gx: x, gy: y, gw: spanW, gh: spanH };
      }
    }
  }
  return null;
}

/**
 * Find a free slot inside the current artboard height (minRows), preferring top or bottom.
 * Shrinks gh to fit leftover space when needed. Returns mode "insert" for top when the
 * canvas is full (caller should push existing blocks down).
 * @param {"top" | "bottom"} edge
 * @returns {{ gx: number, gy: number, gw: number, gh: number, mode: "place" | "insert" }}
 */
export function findSlotAtCanvasEdge(doc, gw, gh, edge = "bottom", excludeId = null) {
  const grid = ensureDocGrid(doc);
  const cols = grid.cols;
  const rowLimit = canvasRowLimit(doc);
  const spanW = Math.max(1, Math.min(cols, gw));
  const wantH = Math.max(1, gh);
  const occ = buildOcc(doc, excludeId);
  const bottom = contentBottom(doc);

  const tryFit = (spanH, fromTop) => {
    const maxY = Math.max(0, rowLimit - spanH);
    if (fromTop) {
      for (let y = 0; y <= maxY; y++) {
        for (let x = 0; x <= cols - spanW; x++) {
          if (cellFree(occ, x, y, spanW, spanH, cols)) {
            return { gx: x, gy: y, gw: spanW, gh: spanH, mode: "place" };
          }
        }
      }
    } else {
      for (let y = maxY; y >= 0; y--) {
        for (let x = 0; x <= cols - spanW; x++) {
          if (cellFree(occ, x, y, spanW, spanH, cols)) {
            return { gx: x, gy: y, gw: spanW, gh: spanH, mode: "place" };
          }
        }
      }
    }
    return null;
  };

  if (edge === "top") {
    for (const h of [wantH, Math.min(wantH, Math.max(1, rowLimit)), Math.min(wantH, 4), 2, 1]) {
      if (h < 1) continue;
      const hit = tryFit(h, true);
      if (hit) return hit;
    }
    return { gx: 0, gy: 0, gw: spanW, gh: Math.min(wantH, rowLimit), mode: "insert" };
  }

  // bottom — prefer leftover under content, then any free band near the artboard floor
  const remain = Math.max(0, rowLimit - bottom);
  if (remain >= 1) {
    const h = Math.min(wantH, remain);
    if (cellFree(occ, 0, bottom, spanW, h, cols)) {
      return { gx: 0, gy: bottom, gw: spanW, gh: h, mode: "place" };
    }
  }
  for (const h of [wantH, Math.min(wantH, remain || wantH), Math.min(wantH, 4), 2, 1]) {
    if (h < 1) continue;
    const hit = tryFit(h, false);
    if (hit) return hit;
  }
  return null;
}

/**
 * Place a block at the top or bottom of the artboard without changing minRows.
 * Top may shift existing blocks down (content can extend past the artboard).
 * @param {"top" | "bottom"} edge
 */
export function placeBlockAtCanvasEdge(doc, block, edge = "bottom") {
  const grid = ensureDocGrid(doc);
  const canvas = ensureCanvas(doc);
  const lockedRows = canvas.minRows;
  const span = defaultSpanForType(block.type);
  const gw = block.gw || span.gw;
  const gh = block.gh || span.gh;
  const slot = findSlotAtCanvasEdge(doc, gw, gh, edge, block.id);
  if (!slot) return null;

  if (edge === "top" && slot.mode === "insert") {
    const lift = slot.gh;
    if (contentBottom(doc) + lift > canvasRowLimit(doc)) return null;
    for (const b of doc.blocks || []) {
      if (!b || b.hidden || b.id === block.id) continue;
      normalizeBlockGrid(b, grid.cols);
      b.gy += lift;
    }
  }

  Object.assign(block, { gx: slot.gx, gy: slot.gy, gw: slot.gw, gh: slot.gh });
  normalizeBlockGrid(block, grid.cols);
  if (!(doc.blocks || []).some((b) => b.id === block.id)) {
    doc.blocks = doc.blocks || [];
    if (edge === "top") doc.blocks.unshift(block);
    else doc.blocks.push(block);
  }
  canvas.minRows = lockedRows;
  return block;
}

function overlapsAny(doc, block, excludeId) {
  return (doc.blocks || []).find(
    (b) => b.id !== excludeId && !b.hidden && rectsOverlap(block, normalizeBlockGrid(b, ensureDocGrid(doc).cols)),
  );
}

/**
 * Resolve overlap: prefer sitting beside the blocker (smart side-by-side),
 * then below — so image can live right of text, list left of metrics.
 */
export function resolveCollision(doc, blockId, rowLimit = null) {
  const grid = ensureDocGrid(doc);
  const cols = grid.cols;
  const cap = rowLimit ?? CANVAS_ROWS_MAX;
  const block = (doc.blocks || []).find((b) => b.id === blockId);
  if (!block) return;
  normalizeBlockGrid(block, cols);
  let guard = 0;
  while (guard++ < 120) {
    const hit = overlapsAny(doc, block, blockId);
    if (!hit) break;
    normalizeBlockGrid(hit, cols);

    const tryX = (nx, ny) => {
      const trial = { gx: nx, gy: ny, gw: block.gw, gh: block.gh };
      if (nx < 0 || nx + block.gw > cols || ny < 0 || ny + block.gh > cap) return false;
      if (overlapsAny(doc, trial, blockId)) return false;
      block.gx = nx;
      block.gy = ny;
      return true;
    };

    // Prefer right of hit, then left, then below (aligned top), then below full
    if (tryX(hit.gx + hit.gw, hit.gy)) continue;
    if (tryX(hit.gx - block.gw, hit.gy)) continue;
    if (tryX(hit.gx + hit.gw, block.gy)) continue;
    const belowGy = hit.gy + hit.gh;
    if (belowGy + block.gh <= cap && tryX(0, belowGy)) continue;
    if (belowGy + block.gh <= cap) {
      block.gy = belowGy;
      block.gx = Math.max(0, Math.min(cols - block.gw, block.gx));
    }
    normalizeBlockGrid(block, cols);
  }
}

export const PHANTOM_ID = "__phantom__";

/**
 * Preview drop/move layout.
 * - Gap / top·bottom edge of a block: insert between and push lower blocks down
 * - Middle of a block (L/R): 50/50 side-by-side split
 * - Empty canvas: place under pointer (full-width when forced)
 *
 * @param {object} doc
 * @param {string | null} movingId existing block id, or null when using opts.phantom
 * @param {number} pointerGx pointer column
 * @param {number} pointerGy pointer row
 * @param {{
 *   origins?: Map<string, { gx: number, gy: number, gw: number, gh: number }>,
 *   phantom?: { gw: number, gh: number },
 *   forceFullWidth?: boolean,
 *   meta?: { mode?: string, insertAt?: number, hoverId?: string },
 * }} [opts]
 * @returns {Map<string, { gx: number, gy: number, gw: number, gh: number }>}
 */
export function previewLayoutShift(doc, movingId, pointerGx, pointerGy, opts = {}) {
  const grid = ensureDocGrid(doc);
  const cols = grid.cols;
  const rowLimit = opts.rowLimit ?? canvasRowLimit(doc);
  /** @type {Map<string, { gx: number, gy: number, gw: number, gh: number }>} */
  const pos = new Map();

  for (const b of doc.blocks || []) {
    if (b.hidden) continue;
    const o = opts.origins?.get(b.id);
    if (o) {
      pos.set(b.id, { gx: o.gx, gy: o.gy, gw: o.gw, gh: o.gh });
    } else {
      normalizeBlockGrid(b, cols);
      pos.set(b.id, { gx: b.gx, gy: b.gy, gw: b.gw, gh: b.gh });
    }
  }

  let id = movingId;
  /** @type {{ gx: number, gy: number, gw: number, gh: number } | undefined} */
  let mover = id ? pos.get(id) : undefined;
  if (!mover && opts.phantom) {
    id = PHANTOM_ID;
    const gh = Math.max(1, opts.phantom.gh || 3);
    const gw = opts.forceFullWidth !== false ? cols : Math.max(1, Math.min(cols, opts.phantom.gw || cols));
    mover = { gx: 0, gy: 0, gw, gh };
    pos.set(id, mover);
  }
  if (!mover || !id) return pos;

  const originM = opts.origins?.get(id);
  if (originM) {
    mover.gw = originM.gw;
    mover.gh = originM.gh;
  } else if (opts.forceFullWidth !== false && (id === PHANTOM_ID || opts.forceFullWidth)) {
    mover.gw = cols;
    mover.gx = 0;
  }

  const px = Math.max(0, Math.min(cols - 1, Number(pointerGx) || 0));
  const py = Math.max(0, Number(pointerGy) || 0);
  const pxCell = Math.floor(px);
  const pyCell = Math.floor(py);

  /** @type {{ id: string, gx: number, gy: number, gw: number, gh: number }[]} */
  const others = [];
  for (const [oid, op] of pos) {
    if (oid === id) continue;
    others.push({ id: oid, ...op });
  }
  others.sort((a, b) => a.gy - b.gy || a.gx - b.gx);

  const setMeta = (mode, extra = {}) => {
    if (!opts.meta) return;
    opts.meta.mode = mode;
    Object.assign(opts.meta, extra);
  };

  const clampMover = () => {
    if (!mover) return;
    mover.gy = Math.max(0, Math.min(mover.gy, rowLimit - mover.gh));
  };

  const finish = () => {
    clampMover();
    return pos;
  };

  const placeFullOrKeep = () => {
    if (opts.forceFullWidth !== false && (id === PHANTOM_ID || opts.forceFullWidth === true || (originM && originM.gw >= cols - 1))) {
      mover.gx = 0;
      mover.gw = cols;
    } else if (originM) {
      mover.gw = originM.gw;
      mover.gx = Math.max(0, Math.min(cols - mover.gw, Math.round(px - mover.gw / 2)));
    }
  };

  /** Insert at row `at`, push every block that starts at/below that line down. */
  const applyInsert = (at) => {
    const insertAt = Math.max(0, Math.round(at));
    placeFullOrKeep();
    mover.gy = insertAt;
    const lift = mover.gh;
    for (const [oid, op] of pos) {
      if (oid === id) continue;
      if (op.gy >= insertAt) op.gy += lift;
    }
    setMeta("insert", { insertAt });
  };

  // —— Over a block: top/bottom edges = stack insert, middle = L/R side-by-side split ——
  /** @type {typeof others[0] | null} */
  let over = null;
  for (const o of others) {
    if (pxCell >= o.gx && pxCell < o.gx + o.gw && pyCell >= o.gy && pyCell < o.gy + o.gh) {
      over = o;
      break;
    }
  }

  if (over) {
    const relY = (py - over.gy) / Math.max(1, over.gh);
    const relX = (px - over.gx) / Math.max(1, over.gw);
    // Thin stack bands — keep ~60%+ of the block as the split zone (was nearly impossible to hit)
    const edgeFrac = over.gh <= 2 ? 0.28 : 0.22;
    const nearTop = relY <= edgeFrac;
    const nearBot = relY >= 1 - edgeFrac;

    if (nearTop && (!nearBot || relY <= 0.5)) {
      applyInsert(over.gy);
      return finish();
    }
    if (nearBot) {
      applyInsert(over.gy + over.gh);
      return finish();
    }

    // Middle of block → 50/50 side-by-side (image right of text, etc.)
    {
      const hover = pos.get(over.id);
      const half = Math.max(1, Math.floor(cols / 2));
      const rightW = cols - half;
      const rowY = hover.gy;
      const rowH = Math.max(1, mover.gh, hover.gh);
      const leftFirst = relX < 0.5;
      if (leftFirst) {
        mover.gx = 0;
        mover.gy = rowY;
        mover.gw = half;
        mover.gh = rowH;
        hover.gx = half;
        hover.gy = rowY;
        hover.gw = rightW;
        hover.gh = rowH;
      } else {
        hover.gx = 0;
        hover.gy = rowY;
        hover.gw = half;
        hover.gh = rowH;
        mover.gx = half;
        mover.gy = rowY;
        mover.gw = rightW;
        mover.gh = rowH;
      }
      const rowBottom = rowY + rowH;
      for (const [oid, op] of pos) {
        if (oid === id || oid === over.id) continue;
        if (rectsOverlap(op, mover) || rectsOverlap(op, hover)) {
          op.gy = Math.max(op.gy, rowBottom);
        }
      }
      setMeta("split", { hoverId: over.id, leftFirst });
      return finish();
    }
  }

  // Open whitespace below all content — park at pointer (snap to canvas bottom when needed)
  if (others.length) {
    const last = others[others.length - 1];
    const end = last.gy + last.gh;
    const maxGy = rowLimit - mover.gh;
    if (py >= end - 0.15 && pyCell <= maxGy + 1) {
      placeFullOrKeep();
      mover.gy = Math.max(end, Math.min(Math.round(py - mover.gh / 2), maxGy));
      setMeta("place", { insertAt: mover.gy });
      return finish();
    }
  }

  // —— In a gap between stacked blocks (or near a boundary) ——
  for (let i = 0; i < others.length; i++) {
    const cur = others[i];
    const next = others[i + 1];
    const curBot = cur.gy + cur.gh;
    // Near bottom edge of a block / top of gap
    if (py >= curBot - 0.6 && py <= curBot + 0.85) {
      // If there's a real hole below, prefer parking in it over shoving
      if (next && next.gy > curBot && mover.gh <= next.gy - curBot) {
        placeFullOrKeep();
        mover.gy = curBot;
        setMeta("place", { insertAt: curBot });
        return finish();
      }
      // Whitespace below the last block — place freely, don't insert/shove
      if (!next) continue;
      applyInsert(curBot);
      return finish();
    }
    // Explicit gap between cur and next — fill the hole at the pointer
    if (next && py >= curBot && py < next.gy) {
      const gapH = next.gy - curBot;
      placeFullOrKeep();
      if (mover.gh <= gapH) {
        const maxStart = next.gy - mover.gh;
        mover.gy = Math.max(curBot, Math.min(pyCell, maxStart));
        setMeta("place", { insertAt: mover.gy });
        return finish();
      }
      applyInsert(curBot);
      return finish();
    }
    // Near top edge of a block when coming from immediately above
    if (py >= cur.gy - 0.85 && py < cur.gy + 0.45) {
      // Large empty band above this block → place into the hole, don't shove
      const bandTop = i === 0 ? 0 : others[i - 1].gy + others[i - 1].gh;
      const holeH = cur.gy - bandTop;
      if (holeH >= mover.gh && pyCell + mover.gh <= cur.gy) {
        placeFullOrKeep();
        mover.gy = Math.max(bandTop, Math.min(pyCell, cur.gy - mover.gh));
        setMeta("place", { insertAt: mover.gy });
        return finish();
      }
      applyInsert(cur.gy);
      return finish();
    }
  }

  // Empty band above the first block (e.g. after deleting a top section)
  if (others.length && py < others[0].gy) {
    const first = others[0];
    const holeH = first.gy;
    placeFullOrKeep();
    if (mover.gh <= holeH) {
      mover.gy = Math.max(0, Math.min(pyCell, first.gy - mover.gh));
      setMeta("place", { insertAt: mover.gy });
      return finish();
    }
    applyInsert(first.gy);
    return finish();
  }

  // After the last block — append below content
  if (others.length) {
    const last = others[others.length - 1];
    const end = last.gy + last.gh;
    if (py >= end - 0.15) {
      placeFullOrKeep();
      mover.gy = Math.max(end, Math.min(Math.round(py - mover.gh / 2), rowLimit - mover.gh));
      setMeta("place", { insertAt: mover.gy });
      return finish();
    }
  }

  // Empty canvas / free place
  placeFullOrKeep();
  if (opts.forceFullWidth !== false && (id === PHANTOM_ID || opts.forceFullWidth === true)) {
    mover.gx = 0;
    mover.gw = cols;
  } else {
    mover.gx = Math.max(0, Math.min(cols - mover.gw, Math.round(px - mover.gw / 2)));
  }
  mover.gy = Math.max(0, Math.min(Math.round(py - mover.gh / 2), rowLimit - mover.gh));
  setMeta("place", { insertAt: mover.gy });
  return finish();
}

/**
 * Live resize assist: keep the resized block at `nextRect`, shift overlapping
 * neighbors out of the way (prefer aside in the growth direction, else below).
 * Recalculates from origins each frame so neighbors snap back when you shrink.
 *
 * @param {object} doc
 * @param {string} resizingId
 * @param {{ gx: number, gy: number, gw: number, gh: number }} nextRect
 * @param {{
 *   origins?: Map<string, { gx: number, gy: number, gw: number, gh: number }>,
 *   growth?: { n?: boolean, s?: boolean, e?: boolean, w?: boolean },
 * }} [opts]
 * @returns {Map<string, { gx: number, gy: number, gw: number, gh: number }>}
 */
export function previewResizeShift(doc, resizingId, nextRect, opts = {}) {
  const grid = ensureDocGrid(doc);
  const cols = grid.cols;
  /** @type {Map<string, { gx: number, gy: number, gw: number, gh: number }>} */
  const pos = new Map();

  for (const b of doc.blocks || []) {
    if (b.hidden) continue;
    const o = opts.origins?.get(b.id);
    if (o) pos.set(b.id, { gx: o.gx, gy: o.gy, gw: o.gw, gh: o.gh });
    else {
      normalizeBlockGrid(b, cols);
      pos.set(b.id, { gx: b.gx, gy: b.gy, gw: b.gw, gh: b.gh });
    }
  }

  const self = pos.get(resizingId);
  if (!self) return pos;

  const gx = Math.max(0, Math.min(cols - 1, Math.round(Number(nextRect.gx) || 0)));
  const gw = Math.max(1, Math.min(cols - gx, Math.round(Number(nextRect.gw) || 1)));
  const gy = Math.max(0, Math.round(Number(nextRect.gy) || 0));
  const gh = Math.max(1, Math.min(48, Math.round(Number(nextRect.gh) || 1)));
  self.gx = gx;
  self.gy = gy;
  self.gw = gw;
  self.gh = gh;

  const growth = opts.growth || {};

  const freeAt = (id, trial) =>
    [...pos.entries()].every(([oid, op]) => oid === id || !rectsOverlap(trial, op));

  const rankCandidate = (other, c) => {
    // Prefer minimal travel, then growth-aligned moves
    const dx = Math.abs(c.gx - other.gx);
    const dy = Math.abs(c.gy - other.gy);
    let score = dx + dy * 1.15;
    if (growth.e && c.gx >= self.gx + self.gw) score -= 2;
    if (growth.w && c.gx + other.gw <= self.gx) score -= 2;
    if (growth.s && c.gy >= self.gy + self.gh) score -= 2;
    if (growth.n && c.gy + other.gh <= self.gy) score -= 2;
    return score;
  };

  let guard = 0;
  while (guard++ < 120) {
    let movedAny = false;
    const others = [...pos.keys()].filter((id) => id !== resizingId);

    // Resolve nearer conflicts with the resized block first
    others.sort((a, b) => {
      const A = pos.get(a);
      const B = pos.get(b);
      const da = Math.abs(A.gx - self.gx) + Math.abs(A.gy - self.gy);
      const db = Math.abs(B.gx - self.gx) + Math.abs(B.gy - self.gy);
      return da - db;
    });

    for (const id of others) {
      const other = pos.get(id);
      if (!rectsOverlap(self, other)) continue;

      const cxSelf = self.gx + self.gw / 2;
      const cySelf = self.gy + self.gh / 2;
      const cxO = other.gx + other.gw / 2;
      const cyO = other.gy + other.gh / 2;
      const rightOf = cxO >= cxSelf;
      const belowOf = cyO >= cySelf;

      /** @type {{ gx: number, gy: number }[]} */
      const candidates = [];

      if (growth.e || rightOf) candidates.push({ gx: self.gx + self.gw, gy: other.gy });
      if (growth.e || rightOf) candidates.push({ gx: self.gx + self.gw, gy: self.gy });
      if (growth.w || !rightOf) candidates.push({ gx: self.gx - other.gw, gy: other.gy });
      if (growth.w || !rightOf) candidates.push({ gx: self.gx - other.gw, gy: self.gy });
      if (growth.s || belowOf) candidates.push({ gx: other.gx, gy: self.gy + self.gh });
      if (growth.s || belowOf) candidates.push({ gx: self.gx, gy: self.gy + self.gh });
      if (growth.n || !belowOf) candidates.push({ gx: other.gx, gy: self.gy - other.gh });
      if (growth.n || !belowOf) candidates.push({ gx: self.gx, gy: self.gy - other.gh });

      if (self.gx + self.gw < cols) candidates.push({ gx: self.gx + self.gw, gy: self.gy });
      if (self.gx > 0) candidates.push({ gx: Math.max(0, self.gx - other.gw), gy: self.gy });

      candidates.push({ gx: other.gx, gy: self.gy + self.gh });
      candidates.push({ gx: 0, gy: self.gy + self.gh });
      candidates.push({ gx: Math.max(0, cols - other.gw), gy: self.gy + self.gh });
      candidates.push({ gx: other.gx, gy: Math.max(0, self.gy - other.gh) });
      candidates.push({ gx: 0, gy: Math.max(0, self.gy - other.gh) });

      const seen = new Set();
      const ranked = [];
      for (const c of candidates) {
        const nx = Math.max(0, Math.min(cols - other.gw, Math.round(c.gx)));
        const ny = Math.max(0, Math.round(c.gy));
        const key = `${nx}:${ny}`;
        if (seen.has(key)) continue;
        seen.add(key);
        ranked.push({ gx: nx, gy: ny, score: rankCandidate(other, { gx: nx, gy: ny }) });
      }
      ranked.sort((a, b) => a.score - b.score);

      let placed = false;
      // Take the best slot that clears the resized block. Neighbor↔neighbor
      // clashes are resolved in the cascade pass (keeps side-by-side slides smart).
      for (const c of ranked) {
        const trial = { gx: c.gx, gy: c.gy, gw: other.gw, gh: other.gh };
        if (rectsOverlap(trial, self)) continue;
        if (other.gx !== trial.gx || other.gy !== trial.gy) movedAny = true;
        other.gx = trial.gx;
        other.gy = trial.gy;
        placed = true;
        break;
      }

      if (!placed) {
        const ny = self.gy + self.gh;
        const nx = Math.max(0, Math.min(cols - other.gw, other.gx));
        if (other.gy !== ny || other.gx !== nx) movedAny = true;
        other.gy = ny;
        other.gx = nx;
      }
    }

    // Cascade: neighbors pushed aside may collide with each other — never move the resized block
    for (let i = 0; i < others.length; i++) {
      for (let j = i + 1; j < others.length; j++) {
        const a = pos.get(others[i]);
        const b = pos.get(others[j]);
        if (!rectsOverlap(a, b)) continue;

        // Prefer moving the block that is NOT hugging the resized block's
        // growth edge (keep the smart slide-aside), else move the lower one.
        const aOrig = opts.origins?.get(others[i]);
        const bOrig = opts.origins?.get(others[j]);
        const hugs = (p) =>
          (growth.e && p.gx === self.gx + self.gw) ||
          (growth.w && p.gx + p.gw === self.gx) ||
          (growth.s && p.gy === self.gy + self.gh) ||
          (growth.n && p.gy + p.gh === self.gy);
        const aHugs = hugs(a);
        const bHugs = hugs(b);
        let moveB;
        if (aHugs !== bHugs) moveB = aHugs; // move the non-hugging one
        else {
          const aOrigY = aOrig?.gy ?? a.gy;
          const bOrigY = bOrig?.gy ?? b.gy;
          if (aOrigY !== bOrigY) moveB = bOrigY > aOrigY;
          else {
            const aDisplaced = aOrig && (aOrig.gx !== a.gx || aOrig.gy !== a.gy);
            const bDisplaced = bOrig && (bOrig.gx !== b.gx || bOrig.gy !== b.gy);
            moveB = bDisplaced || (!aDisplaced && b.gy >= a.gy);
          }
        }
        const moving = moveB ? b : a;
        const movingId = moveB ? others[j] : others[i];
        const blocker = moveB ? a : b;

        const cascadeCandidates = [
          { gx: blocker.gx + blocker.gw, gy: moving.gy },
          { gx: blocker.gx + blocker.gw, gy: blocker.gy },
          { gx: moving.gx, gy: blocker.gy + blocker.gh },
          { gx: blocker.gx, gy: blocker.gy + blocker.gh },
          { gx: 0, gy: blocker.gy + blocker.gh },
          { gx: Math.max(0, cols - moving.gw), gy: blocker.gy + blocker.gh },
          { gx: Math.max(0, blocker.gx - moving.gw), gy: moving.gy },
        ];

        let placed = false;
        for (const c of cascadeCandidates) {
          const nx = Math.max(0, Math.min(cols - moving.gw, Math.round(c.gx)));
          const ny = Math.max(0, Math.round(c.gy));
          const trial = { gx: nx, gy: ny, gw: moving.gw, gh: moving.gh };
          if (rectsOverlap(trial, self)) continue;
          if (!freeAt(movingId, trial)) continue;
          if (moving.gx !== trial.gx || moving.gy !== trial.gy) movedAny = true;
          moving.gx = trial.gx;
          moving.gy = trial.gy;
          placed = true;
          break;
        }
        if (!placed) {
          const ny = Math.max(blocker.gy + blocker.gh, self.gy + self.gh);
          const nx = Math.max(0, Math.min(cols - moving.gw, moving.gx));
          if (moving.gy !== ny || moving.gx !== nx) movedAny = true;
          moving.gy = ny;
          moving.gx = nx;
        }
      }
    }

    if (!movedAny) break;
  }

  return pos;
}

/** Commit resize preview onto blocks (alias clarity for callers). */
export function applyResizeShift(doc, resizingId, nextRect, opts = {}) {
  const positions = previewResizeShift(doc, resizingId, nextRect, opts);
  applyLayoutPositions(doc, positions);
  return positions;
}

/** After a stack drop (no hover split), push overlapping blocks below the mover. */
export function pushOverlapsBelow(doc, blockId, rowLimit = null) {
  const grid = ensureDocGrid(doc);
  const cols = grid.cols;
  const cap = rowLimit ?? CANVAS_ROWS_MAX;
  const block = (doc.blocks || []).find((b) => b.id === blockId);
  if (!block) return;
  normalizeBlockGrid(block, cols);
  let guard = 0;
  while (guard++ < 80) {
    const hit = overlapsAny(doc, block, blockId);
    if (!hit) break;
    normalizeBlockGrid(hit, cols);
    // Prefer moving the *other* block down when both are full-width stacks
    if (block.gw >= cols - 1 && hit.gw >= cols - 1) {
      const nextGy = block.gy + block.gh;
      if (nextGy + hit.gh <= cap) {
        hit.gy = nextGy;
        continue;
      }
      resolveCollision(doc, blockId, cap);
      break;
    }
    resolveCollision(doc, blockId, cap);
    break;
  }
}

/** Commit a preview Map onto real blocks. */
export function applyLayoutPositions(doc, positions) {
  const grid = ensureDocGrid(doc);
  for (const b of doc.blocks || []) {
    const p = positions.get(b.id);
    if (!p) continue;
    b.gx = p.gx;
    b.gy = p.gy;
    b.gw = p.gw;
    b.gh = p.gh;
    normalizeBlockGrid(b, grid.cols);
  }
}

/**
 * Snap position to grid + align to other element edges/centers.
 * @returns {{ gx: number, gy: number, guides: { orient: 'v'|'h', at: number, kind: string }[] }}
 */
export function snapWithAlignment(doc, blockId, px, py, canvasW, gw, gh) {
  const grid = ensureDocGrid(doc);
  const cols = grid.cols;
  const colW = canvasW / cols;
  const rowH = grid.rowHeight;

  let gx = Math.round(px / colW);
  let gy = Math.round(py / rowH);
  gx = Math.max(0, Math.min(cols - gw, gx));
  gy = Math.max(0, gy);

  /** @type {{ orient: 'v'|'h', at: number, kind: string }[]} */
  const guides = [];

  const selfL = gx;
  const selfR = gx + gw;
  const selfCX = gx + gw / 2;
  const selfT = gy;
  const selfB = gy + gh;
  const selfCY = gy + gh / 2;

  // Canvas edges + center
  const targetsX = [
    { v: 0, kind: "canvas-left" },
    { v: cols, kind: "canvas-right" },
    { v: cols / 2, kind: "canvas-center" },
  ];
  const targetsY = [
    { v: 0, kind: "canvas-top" },
    { v: cols / 2, kind: "canvas-mid" }, // weak
  ];

  for (const b of doc.blocks || []) {
    if (b.id === blockId || b.hidden) continue;
    normalizeBlockGrid(b, cols);
    targetsX.push(
      { v: b.gx, kind: "edge" },
      { v: b.gx + b.gw, kind: "edge" },
      { v: b.gx + b.gw / 2, kind: "center" },
    );
    targetsY.push(
      { v: b.gy, kind: "edge" },
      { v: b.gy + b.gh, kind: "edge" },
      { v: b.gy + b.gh / 2, kind: "center" },
    );
  }

  let bestDx = 0;
  let bestDy = 0;
  let bestAbsX = ALIGN_THRESHOLD + 1;
  let bestAbsY = ALIGN_THRESHOLD + 1;
  let guideX = null;
  let guideY = null;

  for (const t of targetsX) {
    for (const [self, label] of [
      [selfL, "left"],
      [selfR, "right"],
      [selfCX, "center"],
    ]) {
      const d = t.v - self;
      const ad = Math.abs(d);
      if (ad <= ALIGN_THRESHOLD && ad < bestAbsX) {
        bestAbsX = ad;
        bestDx = d;
        guideX = { orient: "v", at: t.v, kind: `${t.kind}-${label}` };
      }
    }
  }
  for (const t of targetsY) {
    for (const [self, label] of [
      [selfT, "top"],
      [selfB, "bottom"],
      [selfCY, "center"],
    ]) {
      const d = t.v - self;
      const ad = Math.abs(d);
      if (ad <= ALIGN_THRESHOLD && ad < bestAbsY) {
        bestAbsY = ad;
        bestDy = d;
        guideY = { orient: "h", at: t.v, kind: `${t.kind}-${label}` };
      }
    }
  }

  if (guideX) {
    gx = Math.round(gx + bestDx);
    gx = Math.max(0, Math.min(cols - gw, gx));
    guides.push(guideX);
  }
  if (guideY) {
    gy = Math.round(gy + bestDy);
    gy = Math.max(0, gy);
    guides.push(guideY);
  }

  return { gx, gy, guides };
}

/**
 * Snap pixel position (relative to sheet) to grid coords.
 */
export function snapPxToGrid(px, py, canvasW, grid, gw, gh, rowLimit = null) {
  const cols = grid.cols;
  const colW = canvasW / cols;
  const rowH = grid.rowHeight;
  let gx = Math.round(px / colW);
  let gy = Math.round(py / rowH);
  gx = Math.max(0, Math.min(cols - gw, gx));
  gy = Math.max(0, gy);
  if (rowLimit != null) gy = Math.min(gy, Math.max(0, rowLimit - gh));
  return { gx, gy };
}

/** Clamp every position in a preview map to the artboard. */
export function clampLayoutPositions(rootDoc, positions) {
  if (!positions || !rootDoc) return positions;
  for (const [id, p] of positions) {
    positions.set(id, clampBlockGridPos(rootDoc, p));
  }
  return positions;
}

export function snapSizeToGrid(wPx, hPx, canvasW, grid, gx, gy) {
  const cols = grid.cols;
  const colW = canvasW / cols;
  const rowH = grid.rowHeight;
  let gw = Math.max(1, Math.round(wPx / colW));
  let gh = Math.max(1, Math.round(hPx / rowH));
  gw = Math.min(gw, cols - gx);
  gh = Math.min(48, gh);
  return { gw, gh };
}

export function blockFrameStyle(block, canvasW, grid) {
  normalizeBlockGrid(block, grid.cols);
  const colW = canvasW / grid.cols;
  const left = block.gx * colW;
  const top = block.gy * grid.rowHeight;
  const width = block.gw * colW;
  const height = block.gh * grid.rowHeight;
  let radius = 0;
  if (block.borderRadius != null && block.borderRadius !== "") {
    const n = Number(block.borderRadius);
    if (Number.isFinite(n)) radius = Math.max(0, Math.min(48, Math.round(n)));
  } else if (block.rounded || block.imageRounded) {
    radius = 8;
  }
  const radiusCss =
    radius > 0 && (block.type === "section" || block.type === "image" || block.type === "custom")
      ? `border-radius:${radius}px;overflow:hidden;`
      : "";
  return `left:${left}px;top:${top}px;width:${width}px;height:${height}px;${radiusCss}`;
}

/** Pixel width available for the image inside its grid cell. */
export function imageCellInnerWidth(block, canvasW, cols) {
  if (block.type !== "image") return 0;
  const colW = canvasW / cols;
  const cellW = block.gw * colW;
  const padX = Number(block.padX);
  const horizontalPad = Number.isFinite(padX) ? padX * 2 : 64;
  const inner = Math.max(80, cellW - horizontalPad);
  const layout = block.layout || "full";
  if (layout === "left" || layout === "right") return Math.min(280, Math.round(inner * 0.42));
  return Math.round(Math.min(600, inner));
}

export function imageDisplayHeightFromWidth(block, displayWidth) {
  const nw = Number(block.imageNaturalWidth);
  const nh = Number(block.imageNaturalHeight);
  if (Number.isFinite(nw) && nw > 0 && Number.isFinite(nh) && nh > 0) {
    return Math.max(24, Math.round((displayWidth / nw) * nh));
  }
  const cached = Number(block.imageDisplayHeight);
  if (Number.isFinite(cached) && cached > 0) return cached;
  return Math.max(24, Math.round(displayWidth * 0.5625));
}

/**
 * Measure rendered image height at the block's display width (for grid row fitting).
 */
export function measureImageDisplayHeight(src, displayWidth) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = displayWidth / Math.max(1, img.naturalWidth);
      resolve(Math.max(24, Math.round(img.naturalHeight * scale)));
    };
    img.onerror = () => resolve(Math.max(24, Math.round(displayWidth * 0.5625)));
    img.src = src;
  });
}

/** Sync image pixel width from grid span and refit segment height to aspect ratio. */
export function fitImageBlockToGrid(block, grid, canvasW) {
  if (block.type !== "image" || !block.src) return block;
  syncImageWidthFromGrid(block, canvasW, grid.cols);
  const displayW = Number(block.width) || imageCellInnerWidth(block, canvasW, grid.cols);
  block.imageDisplayHeight = imageDisplayHeightFromWidth(block, displayW);
  block.ghManual = false;
  fitBlockGridHeight(block, grid);
  return block;
}

/** Refit grid rows after an image src is set or the segment width changes. */
export async function refitImageBlockFromSrc(block, grid, canvasW) {
  if (block.type !== "image" || !block.src) return block;
  syncImageWidthFromGrid(block, canvasW, grid.cols);
  const displayW = Number(block.width) || imageCellInnerWidth(block, canvasW, grid.cols);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      block.imageNaturalWidth = img.naturalWidth;
      block.imageNaturalHeight = img.naturalHeight;
      block.imageDisplayHeight = imageDisplayHeightFromWidth(block, displayW);
      block.ghManual = false;
      fitBlockGridHeight(block, grid);
      resolve(block);
    };
    img.onerror = () => {
      block.imageDisplayHeight = Math.max(24, Math.round(displayW * 0.5625));
      block.ghManual = false;
      fitBlockGridHeight(block, grid);
      resolve(block);
    };
    img.src = block.src;
  });
}

/**
 * Sync image pixel width from grid span so stretch feels real.
 */
export function syncImageWidthFromGrid(block, canvasW, cols) {
  if (block.type !== "image") return;
  block.width = imageCellInnerWidth(block, canvasW, cols);
}

/**
 * Push overlapping blocks apart on a working list (does not touch locked layout
 * intent beyond making a valid table). Mutates the given array items in place.
 */
function resolveOverlapsOnBlocks(blocks, cols) {
  const order = [...blocks].sort((a, b) => a.gy - b.gy || a.gx - b.gx || String(a.id).localeCompare(String(b.id)));
  for (let i = 0; i < order.length; i++) {
    for (let j = i + 1; j < order.length; j++) {
      const a = order[i];
      const b = order[j];
      if (!rectsOverlap(a, b)) continue;
      b.gy = a.gy + a.gh;
      normalizeBlockGrid(b, cols);
      let guard = 0;
      while (guard++ < 80) {
        const hit = order.slice(0, j).find((o) => o.id !== b.id && rectsOverlap(b, o));
        if (!hit) break;
        b.gy = hit.gy + hit.gh;
        normalizeBlockGrid(b, cols);
      }
    }
  }
}

/**
 * Pack visible grid blocks into nested table rows for Gmail.
 * Uses % widths and never leaves column holes — matches studio grid.
 * Does not mutate the studio document (works on copies).
 * @param {object} doc
 * @param {(block: object, cellWidth: number) => string} renderCellHtml
 */
export function packGridToTableRows(doc, renderCellHtml) {
  const grid = ensureDocGrid(doc);
  const cols = grid.cols;
  const canvasW = Math.min(CANVAS_WIDTH_MAX, Math.max(CANVAS_WIDTH_MIN, Number(doc.canvasWidth) || CANVAS_WIDTH_DEFAULT));

  const blocks = (doc.blocks || [])
    .filter((b) => !b.hidden)
    .map((b) => {
      const copy = { ...b };
      normalizeBlockGrid(copy, cols);
      return copy;
    });

  if (!blocks.length) return "";

  resolveOverlapsOnBlocks(blocks, cols);

  /** @type {Record<number, Record<number, string>>} */
  const occ = {};
  /** @type {Map<string, object>} */
  const byId = new Map();
  for (const b of blocks) {
    byId.set(b.id, b);
    markOcc(occ, b.gx, b.gy, b.gw, b.gh, b.id);
  }

  let maxR = 0;
  for (const b of blocks) maxR = Math.max(maxR, b.gy + b.gh);
  maxR = Math.max(1, maxR);

  const skip = {};
  const rows = [];
  const pct = (span) => Math.round((span / cols) * 10000) / 100;
  const spacerTd = (span) => {
    const p = pct(span);
    return `<td width="${p}%" colspan="${span}" style="width:${p}%;padding:0;font-size:0;line-height:0;height:0;">&nbsp;</td>`;
  };

  for (let r = 0; r < maxR; r++) {
    const tds = [];
    let c = 0;
    let skipCount = 0;
    let rowHasOrigin = false;
    while (c < cols) {
      if (skip[`${r}:${c}`]) {
        skipCount += 1;
        c += 1;
        continue;
      }
      const id = occ[r]?.[c];
      if (!id) {
        let span = 1;
        while (c + span < cols && !occ[r]?.[c + span] && !skip[`${r}:${c + span}`]) span += 1;
        tds.push(spacerTd(span));
        c += span;
        continue;
      }
      const block = byId.get(id);
      if (!block || block.gx !== c || block.gy !== r) {
        tds.push(spacerTd(1));
        c += 1;
        continue;
      }
      rowHasOrigin = true;
      const gw = Math.max(1, Math.min(cols - c, block.gw));
      const gh = Math.max(1, block.gh);
      for (let rr = r; rr < r + gh; rr++) {
        for (let cc = c; cc < c + gw; cc++) {
          if (rr === r && cc === c) continue;
          skip[`${rr}:${cc}`] = true;
        }
      }
      const p = pct(gw);
      const cellW = Math.max(1, Math.round((gw / cols) * canvasW));
      const minH = Math.max(grid.rowHeight, gh * grid.rowHeight);
      const inner = renderCellHtml(block, cellW) || "&nbsp;";
      tds.push(
        `<td width="${p}%" colspan="${gw}" rowspan="${gh}" valign="top" style="width:${p}%;height:${minH}px;min-height:${minH}px;padding:0;vertical-align:top;overflow:hidden;">${inner}</td>`,
      );
      c += gw;
    }
    if (tds.length) {
      const emitted = tds.reduce((n, td) => {
        const m = td.match(/colspan="(\d+)"/);
        return n + (m ? Number(m[1]) : 1);
      }, 0);
      const need = cols - skipCount - emitted;
      if (need > 0) tds.push(spacerTd(need));
      const rowStyle = rowHasOrigin ? "" : ` style="height:${grid.rowHeight}px;"`;
      rows.push(`<tr${rowStyle}>${tds.join("")}</tr>`);
    } else if (skipCount > 0) {
      // Rowspan continuation — keep the <tr> so Gmail/clients honor rowspan height
      rows.push(`<tr style="height:${grid.rowHeight}px;"></tr>`);
    }
  }

  return `<tr><td style="padding:0;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="width:100%;border-collapse:collapse;table-layout:fixed;">
      ${rows.join("\n")}
    </table>
  </td></tr>`;
}

/** Inner packed table HTML for studio WYSIWYG (same structure as export). */
export function wysiwygBodyHtml(doc, renderCellHtml) {
  const packed = packGridToTableRows(doc, renderCellHtml);
  const m = String(packed).match(/<table[\s\S]*<\/table>/i);
  return m ? m[0] : packed;
}
