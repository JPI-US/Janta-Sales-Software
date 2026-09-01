/** Nested section helpers — children live in a local grid inside a container. */

import {
  ensureDocGrid,
  normalizeBlockGrid,
  defaultSpanForType,
  findNextSlot,
  packGridToTableRows,
  maxGridRow,
  previewLayoutShift,
  applyLayoutPositions,
  snapWithAlignment,
  blockFrameStyle,
  syncImageWidthFromGrid,
} from "./grid.js";

export function isContainerType(type) {
  // Only Section is a nestable container. Custom stays a normal content block.
  return type === "section";
}

export function ensureChildren(block) {
  if (!Array.isArray(block.children)) block.children = [];
  // Older sections used 8px pads — give nested content room to breathe
  if (block.type === "section") {
    if (block.padTop == null || block.padTop <= 8) block.padTop = 28;
    if (block.padBottom == null || block.padBottom <= 8) block.padBottom = 28;
    if (block.padX == null || block.padX <= 8) block.padX = 28;
  }
  return block.children;
}

/** Walk all blocks including nested children. */
export function walkBlocks(blocks, fn, parent = null) {
  for (const b of blocks || []) {
    fn(b, parent);
    if (b.children?.length) walkBlocks(b.children, fn, b);
  }
}

export function findBlockAnywhere(doc, id) {
  let found = null;
  walkBlocks(doc.blocks || [], (b) => {
    if (b.id === id) found = b;
  });
  return found;
}

/** Path from root to block (inclusive). */
export function findBlockPath(doc, id) {
  function search(list, path) {
    for (const b of list || []) {
      const next = [...path, b];
      if (b.id === id) return next;
      if (b.children?.length) {
        const hit = search(b.children, next);
        if (hit) return hit;
      }
    }
    return null;
  }
  return search(doc.blocks || [], []);
}

/** Blocks editable in the current scope (root canvas or inside a section). */
export function getScopeBlocks(doc, scopeId) {
  if (!scopeId) {
    return doc.blocks || [];
  }
  const parent = findBlockAnywhere(doc, scopeId);
  if (!parent || !isContainerType(parent.type)) return [];
  return ensureChildren(parent);
}

export function getScopeParent(doc, scopeId) {
  if (!scopeId) return null;
  return findBlockAnywhere(doc, scopeId);
}

/**
 * Pixel width available inside a container on the root canvas.
 */
export function scopeCanvasWidth(doc, scopeId, sheetW) {
  if (!scopeId) return sheetW;
  const parent = findBlockAnywhere(doc, scopeId);
  if (!parent) return sheetW;
  const grid = ensureDocGrid(doc);
  normalizeBlockGrid(parent, grid.cols);
  const colW = sheetW / grid.cols;
  const padX = parent.padX ?? 28;
  return Math.max(160, parent.gw * colW - padX * 2);
}

/** Local grid for nested editing (same cols, slightly tighter rows). */
export function scopeGrid(doc) {
  const g = ensureDocGrid(doc);
  return { cols: g.cols, rowHeight: Math.max(20, g.rowHeight - 4) };
}

export function placeChildInScope(doc, scopeId, block) {
  const list = getScopeBlocks(doc, scopeId);
  const grid = scopeGrid(doc);
  const span = defaultSpanForType(block.type);
  // Temporary doc-like for findNextSlot
  const fake = { blocks: list, grid };
  const slot = findNextSlot(fake, span.gw, span.gh);
  Object.assign(block, slot);
  normalizeBlockGrid(block, grid.cols);
  // Section already insets — keep nested parts from stacking full email side pads
  if (block.type !== "spacer" && (block.padX == null || block.padX >= 28)) {
    block.padX = 16;
  }
  if (block.type === "text" && (block.padTop == null || block.padTop >= 18)) {
    block.padTop = 12;
  }
  if (!list.includes(block)) list.push(block);
  return block;
}

export {
  packGridToTableRows,
  previewLayoutShift,
  applyLayoutPositions,
  snapWithAlignment,
  blockFrameStyle,
  syncImageWidthFromGrid,
  maxGridRow,
  normalizeBlockGrid,
  ensureDocGrid,
  defaultSpanForType,
};
