import { htmlToPlain } from "./richtext.js";
import {
  estimateEmailBytes,
  formatBytes,
  GMAIL_MESSAGE_LIMIT_BYTES,
  MAX_EMBEDDED_IMAGE_BYTES,
  dataUrlApproxBytes,
} from "./compile.js";

/**
 * Lightweight pre-copy QA for Gmail-ready drafts.
 * @param {{ subject?: string, preheader?: string, blocks?: any[] }} doc
 * @returns {{ level: "error" | "warn", message: string }[]}
 */
export function runQa(doc) {
  const issues = [];
  const blocks = doc.blocks || [];

  if (!blocks.length) {
    issues.push({ level: "error", message: "Email has no segments." });
    return issues;
  }

  const placeholderRe = /\{\{[A-Za-z0-9_]+\}\}/g;
  const foundPlaceholders = new Set();

  const scanText = (text, label) => {
    const s = String(text || "");
    const plain = /</.test(s) ? htmlToPlain(s) : s;
    for (const m of plain.matchAll(placeholderRe)) foundPlaceholders.add(m[0]);
    if (label && !plain.trim() && !s.trim()) {
      issues.push({ level: "warn", message: `${label} is empty.` });
    }
  };

  const checkEmbedded = (src, label) => {
    if (!src || !String(src).startsWith("data:")) return;
    const approx = dataUrlApproxBytes(src);
    if (approx > MAX_EMBEDDED_IMAGE_BYTES) {
      issues.push({
        level: "error",
        message: `${label}: embedded image is ~${formatBytes(approx)} (max ${formatBytes(MAX_EMBEDDED_IMAGE_BYTES)} per file).`,
      });
    } else if (approx > MAX_EMBEDDED_IMAGE_BYTES * 0.7) {
      issues.push({
        level: "warn",
        message: `${label}: large embedded image (~${formatBytes(approx)}) may strain Gmail paste.`,
      });
    }
  };

  blocks.forEach((block, i) => {
    const n = i + 1;
    if (block.type === "header") {
      if (!block.heading?.trim()) issues.push({ level: "warn", message: `Header #${n}: missing heading.` });
      scanText(`${block.eyebrow || ""} ${block.heading || ""}`, null);
      checkEmbedded(block.bgImage, `Header #${n} background`);
    } else if (block.type === "text" || block.type === "callout" || block.type === "custom") {
      scanText(block.html, `${labelFor(block)} #${n}`);
      checkEmbedded(block.bgImage, `${labelFor(block)} #${n} background`);
      if (block.type === "custom") checkEmbedded(block.imageSrc, `Custom #${n} image`);
    } else if (block.type === "columns") {
      scanText(block.left, `Columns #${n} (left)`);
      scanText(block.right, `Columns #${n} (right)`);
      checkEmbedded(block.bgImage, `Columns #${n} background`);
    } else if (block.type === "list") {
      if (!(block.items || []).filter(Boolean).length) {
        issues.push({ level: "warn", message: `List #${n}: no items.` });
      }
      for (const it of block.items || []) scanText(it, null);
      checkEmbedded(block.bgImage, `List #${n} background`);
    } else if (block.type === "button") {
      const href = (block.href || "").trim();
      if (!href || href === "#" || href === "https://") {
        issues.push({ level: "error", message: `Button #${n}: missing or empty link URL.` });
      }
      scanText(`${block.label || ""} ${href}`, null);
      checkEmbedded(block.bgImage, `Button #${n} background`);
    } else if (block.type === "image") {
      if (!block.src) {
        issues.push({ level: "warn", message: `Image #${n}: no image set.` });
      } else {
        if (!block.alt?.trim()) {
          issues.push({ level: "warn", message: `Image #${n}: missing alt text.` });
        }
        checkEmbedded(block.src, `Image #${n}`);
      }
      checkEmbedded(block.bgImage, `Image #${n} background`);
    } else {
      checkEmbedded(block.bgImage, `${labelFor(block)} #${n} background`);
    }
  });

  if (foundPlaceholders.size) {
    issues.push({
      level: "warn",
      message: `Placeholders still present: ${[...foundPlaceholders].join(", ")}. Replace before sending.`,
    });
  }

  const bytes = estimateEmailBytes(doc);
  if (bytes >= GMAIL_MESSAGE_LIMIT_BYTES) {
    issues.push({
      level: "error",
      message: `Email HTML is ~${formatBytes(bytes)} — over Gmail's ~${formatBytes(GMAIL_MESSAGE_LIMIT_BYTES)} limit.`,
    });
  } else if (bytes >= GMAIL_MESSAGE_LIMIT_BYTES * 0.8) {
    issues.push({
      level: "warn",
      message: `Email HTML is ~${formatBytes(bytes)} of ~${formatBytes(GMAIL_MESSAGE_LIMIT_BYTES)} Gmail capacity.`,
    });
  }

  return issues;
}

function labelFor(block) {
  if (block.segmentName) return block.segmentName;
  if (block.type === "callout") return "Callout";
  if (block.type === "text") return "Text";
  if (block.type === "custom") return "Custom";
  return block.type;
}
