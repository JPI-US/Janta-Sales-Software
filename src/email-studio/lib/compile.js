import { richHtml, htmlToPlain } from "./richtext.js";
import { JANTA_LOGO_DATA_URL } from "./logo-data.js";
import { packGridToTableRows, ensureCanvas, enableGridLayout, CANVAS_WIDTH_MIN, CANVAS_WIDTH_MAX, CANVAS_WIDTH_DEFAULT, imageCellInnerWidth } from "./grid.js";

/** Local path for studio chrome (sidebar / favicon). */
export const LOGO_LOCAL = "/email-studio/assets/janta-logo.png";

/**
 * Logo src for email HTML. Embedded data URL so Gmail shows the real JP mark
 * (no localhost / CDN dependency). Studio UI still uses LOGO_LOCAL.
 */
export function logoSrc() {
  return JANTA_LOGO_DATA_URL || LOGO_LOCAL;
}

function esc(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function nl2br(text) {
  return esc(text).replaceAll("\n", "<br />");
}

/** Prefer rich HTML; fall back to escaped newlines for plain strings */
function bodyHtml(value) {
  const s = String(value || "");
  if (!s) return "";
  if (/<[a-z][\s\S]*>/i.test(s)) return richHtml(s);
  return nl2br(s);
}

const FOOTER_SOCIAL_META = {
  linkedin: { label: "LinkedIn", color: "#0A66C2", abbr: "in" },
  instagram: { label: "Instagram", color: "#E4405F", abbr: "ig" },
  twitter: { label: "X", color: "#111111", abbr: "X" },
  facebook: { label: "Facebook", color: "#1877F2", abbr: "f" },
  youtube: { label: "YouTube", color: "#FF0000", abbr: "▶" },
  website: { label: "Website", color: "#3a84dc", abbr: "↗" },
};

function footerLinks(block) {
  if (Array.isArray(block.links) && block.links.length) {
    return block.links.filter((l) => l && (l.label || l.href));
  }
  if (block.linkLabel) {
    return [{ label: block.linkLabel, href: block.linkHref || "https://jantaus.com/" }];
  }
  return [];
}

function renderFooterSocialRow(block) {
  const items = (block.social || []).filter((s) => s?.href);
  if (block.showSocial === false || !items.length) return "";
  const size = Math.max(22, Math.min(40, Number(block.socialSize) || 28));
  const cells = items
    .map((item) => {
      const meta = FOOTER_SOCIAL_META[item.network] || FOOTER_SOCIAL_META.website;
      const label = item.label || meta.label;
      const href = esc(item.href || "#");
      const bg = esc(item.color || meta.color);
      return `<td style="padding:0 6px;">
        <a href="${href}" style="text-decoration:none;display:inline-block;" title="${esc(label)}">
          <table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
            <td align="center" bgcolor="${bg}" style="width:${size}px;height:${size}px;border-radius:6px;font-family:Helvetica,Arial,sans-serif;font-size:${Math.max(10, Math.round(size * 0.38))}px;font-weight:700;color:#ffffff;line-height:${size}px;text-align:center;">${esc(meta.abbr)}</td>
          </tr></table>
        </a>
      </td>`;
    })
    .join("");
  return `<table cellpadding="0" cellspacing="0" border="0" role="presentation" align="${alignAttr(block.align)}" style="margin:0 auto 12px;"><tr>${cells}</tr></table>`;
}

function renderFooterLogosRow(block) {
  const items = (block.logos || []).filter((l) => l?.src);
  if (!block.showLogos || !items.length) return "";
  const h = Math.max(20, Math.min(64, Number(block.logoHeight) || 32));
  const gap = Math.max(4, Math.min(24, Number(block.logoGap) || 12));
  const cells = items
    .map((logo) => {
      const w = Math.max(40, Math.min(160, Number(logo.width) || Math.round(h * 2.4)));
      const img = `<img src="${esc(logo.src)}" alt="${esc(logo.alt || "Client logo")}" width="${w}" height="${h}" style="display:block;border:0;max-height:${h}px;width:auto;height:${h}px;object-fit:contain;" />`;
      const inner = logo.href
        ? `<a href="${esc(logo.href)}" style="text-decoration:none;">${img}</a>`
        : img;
      return `<td style="padding:0 ${gap / 2}px 8px;vertical-align:middle;">${inner}</td>`;
    })
    .join("");
  return `<table cellpadding="0" cellspacing="0" border="0" role="presentation" align="${alignAttr(block.align)}" style="margin:0 auto 10px;"><tr>${cells}</tr></table>`;
}

function renderFooterBlock(block, align) {
  const textColor = block.color || "#5a6a7a";
  const linkColor = block.linkColor || "#3a84dc";
  const fontSize = block.fontSize || 11;
  const parts = [];
  if (block.tagline) {
    parts.push(
      `<p style="margin:0 0 10px;font-size:${fontSize + 1}px;line-height:1.45;color:${textColor};">${bodyHtml(block.tagline)}</p>`,
    );
  }
  const links = footerLinks(block);
  if (links.length) {
    const linkHtml = links
      .map(
        (l) =>
          `<a href="${esc(l.href || "#")}" style="color:${linkColor};text-decoration:none;font-weight:600;">${esc(l.label || l.href || "Link")}</a>`,
      )
      .join(`<span style="color:${textColor};opacity:0.45;padding:0 6px;">·</span>`);
    parts.push(`<p style="margin:0 0 10px;font-size:${fontSize}px;line-height:1.5;">${linkHtml}</p>`);
  }
  parts.push(renderFooterSocialRow(block));
  parts.push(renderFooterLogosRow(block));
  const lineParts = [];
  if (block.company) lineParts.push(esc(block.company));
  if (block.location) lineParts.push(esc(block.location));
  if (lineParts.length) {
    parts.push(
      `<p style="margin:0;font-size:${fontSize}px;line-height:1.45;color:${textColor};">${lineParts.join(" · ")}</p>`,
    );
  }
  const divider =
    block.showDivider !== false
      ? `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:0 0 12px;"><tr><td style="height:1px;background-color:#d8dee6;font-size:1px;line-height:1px;">&nbsp;</td></tr></table>`
      : "";
  const body = parts.filter(Boolean).join("") || "&nbsp;";
  return `${divider}${body}`;
}

function alignAttr(align = "left") {
  if (align === "center") return "center";
  if (align === "right") return "right";
  return "left";
}

function padY(block, fallback = "16px 32px") {
  const t = block.padTop ?? null;
  const b = block.padBottom ?? null;
  const x = block.padX ?? null;
  if (t == null && b == null && x == null) return fallback;
  const side = x ?? 32;
  return `${t ?? 16}px ${side}px ${b ?? 16}px`;
}

/** Corner radius in px — supports borderRadius or legacy rounded / imageRounded flags. */
function cornerRadiusPx(block) {
  if (block.borderRadius != null && block.borderRadius !== "") {
    const n = Number(block.borderRadius);
    if (Number.isFinite(n)) return Math.max(0, Math.min(48, Math.round(n)));
  }
  if (block.rounded || block.imageRounded) return 8;
  return 0;
}

/** Nest content at contentWidth % when narrower than full (Gmail-safe table). */
function widthBox(innerHtml, block, align = "left") {
  const maxW = Number(block.contentWidth);
  if (!maxW || maxW >= 100) return innerHtml;
  const w = Math.min(100, Math.max(40, Math.round(maxW)));
  return `<table width="${w}%" cellpadding="0" cellspacing="0" border="0" role="presentation" align="${align}" style="max-width:${w}%;width:${w}%;"><tr><td>${innerHtml}</td></tr></table>`;
}

function normalizeHex(input, fallback = "#ffffff") {
  if (!input || input === "transparent") return fallback;
  let h = String(input).trim();
  if (h.startsWith("rgba") || h.startsWith("rgb")) return fallback;
  if (!h.startsWith("#")) h = `#${h}`;
  if (/^#[0-9a-fA-F]{3}$/.test(h)) {
    h = `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(h)) return fallback;
  return h.toLowerCase();
}

function hexToRgba(hex, alpha = 1) {
  const h = normalizeHex(hex, "#ffffff");
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  const a = Math.max(0, Math.min(1, alpha));
  if (a >= 0.999) return h;
  return `rgba(${r},${g},${b},${Number(a.toFixed(3))})`;
}

/** Build inline background styles: color + opacity + optional photo */
export function bgStyle(block, fallbackColor = "transparent") {
  const legacy = block.bg && block.bg !== "transparent" ? block.bg : null;
  const rawColor = block.bgColor || legacy || null;
  const opacityPct = block.bgOpacity != null ? Number(block.bgOpacity) : rawColor || block.bgImage ? 100 : 0;
  const alpha = Math.max(0, Math.min(100, opacityPct)) / 100;
  const size = block.bgSize || "cover";
  const pos = block.bgPosition || "center";
  const img = block.bgImage ? String(block.bgImage).replaceAll("'", "%27") : null;

  if (img && rawColor) {
    const tint = hexToRgba(normalizeHex(rawColor, "#1a2332"), alpha);
    return [
      `background-image:linear-gradient(${tint},${tint}),url('${img}')`,
      `background-size:${size}`,
      `background-position:${pos}`,
      "background-repeat:no-repeat",
    ].join(";");
  }

  if (img) {
    return [
      `background-image:url('${img}')`,
      `background-size:${size}`,
      `background-position:${pos}`,
      "background-repeat:no-repeat",
      `background-color:${fallbackColor}`,
    ].join(";");
  }

  if (rawColor) {
    return `background-color:${hexToRgba(normalizeHex(rawColor, "#ffffff"), alpha)}`;
  }

  return `background-color:${fallbackColor}`;
}

/**
 * Inner HTML for a grid cell (no wrapping &lt;tr&gt;/&lt;td&gt;).
 * Used by packGridToTableRows for Gmail-safe nested tables.
 * Preserves the block's td padding/background — stripping them caused edge-flush text.
 */
export function renderBlockCell(block, opts = {}, cellWidth = 0) {
  const compact = {
    ...block,
    contentWidth: 100,
    padTop: block.padTop ?? 16,
    padBottom: block.padBottom ?? 16,
    padX: block.padX ?? 32,
    buttonFill: true,
  };
  if (block.type === "button" && cellWidth > 0 && cellWidth < 180) {
    compact.buttonPadX = Math.min(compact.buttonPadX ?? 22, 14);
    compact.buttonPadY = Math.min(compact.buttonPadY ?? 12, 10);
  }
  const html = renderBlock(compact, { ...opts, gridCell: true, cellWidth });
  const m = String(html).match(/<tr[^>]*>\s*<td([^>]*)>([\s\S]*)<\/td>\s*<\/tr>/i);
  if (!m) return html;
  const attrs = m[1] || "";
  const inner = m[2];
  const styleM = attrs.match(/style="([^"]*)"/i);
  let style = styleM ? styleM[1].trim() : "";
  if (!/padding\s*:/i.test(style)) {
    style = `padding:${padY(compact)};${style}`;
  }
  style = style.replace(/;\s*$/, "");
  const alignM = attrs.match(/align="([^"]*)"/i);
  const align = alignM?.[1] ? `text-align:${alignM[1]};` : "";
  const isGridCell = opts.gridCell !== false;
  const fillShell = isGridCell
    ? "height:100%;min-height:100%;display:flex;flex-direction:column;justify-content:flex-start;align-self:stretch;"
    : "";
  return `<div style="box-sizing:border-box;width:100%;${fillShell}${align}${style}">${inner}</div>`;
}

function nestedChildrenTable(block, opts = {}, cellWidth = 536) {
  const kids = (block.children || []).filter((c) => !c.hidden);
  if (!kids.length) {
    return `<div style="color:#94a3b8;padding:28px 20px;font-size:12px;line-height:1.45;text-align:center;">Double-click to add content</div>`;
  }
  const nestedDoc = {
    layoutMode: "grid",
    canvasWidth: Math.max(160, Math.round(cellWidth || 536)),
    grid: { cols: 12, rowHeight: 28 },
    blocks: kids,
  };
  const packed = packGridToTableRows(nestedDoc, (b, w) => renderBlockCell(b, opts, w));
  const m = String(packed).match(/<table[\s\S]*<\/table>/i);
  return m ? m[0] : packed;
}

export function renderBlock(block, { absoluteLogoOrigin, gridCell = false, cellWidth = 0 } = {}) {
  const align = alignAttr(block.align);
  const opts = { absoluteLogoOrigin, gridCell, cellWidth };

  switch (block.type) {
    case "section": {
      const inner = nestedChildrenTable(block, opts, cellWidth || 536);
      const radius = cornerRadiusPx(block);
      const radiusCss = radius ? `border-radius:${radius}px;overflow:hidden;` : "";
      return `
        <tr>
          <td style="padding:${padY(block, "28px 28px")};${bgStyle(block)};${radiusCss}" align="${align}">
            ${inner}
          </td>
        </tr>`;
    }
    case "header": {
      const logo = block.showLogo !== false
        ? `<img src="${logoSrc()}" alt="Janta Power" width="48" height="48" style="display:block;border:0;width:48px;height:48px;object-fit:contain;" />`
        : "";
      // Migrate legacy bg
      const headerBlock = {
        ...block,
        bgColor: block.bgColor || (block.bg && block.bg !== "transparent" ? block.bg : "#1a2332"),
        bgOpacity: block.bgOpacity != null ? block.bgOpacity : 100,
      };
      const headInner = `
            ${logo ? `<div style="margin:0 0 14px;">${logo}</div>` : ""}
            ${block.eyebrow ? `<p style="margin:0;font-size:12px;font-weight:600;color:#3a84dc;letter-spacing:0.06em;text-transform:uppercase;">${esc(block.eyebrow)}</p>` : ""}
            <p style="margin:${block.eyebrow ? "10px" : "0"} 0 0;font-size:22px;font-weight:700;line-height:1.25;color:#ffffff;">${esc(block.heading || "")}</p>`;
      return `
        <tr>
          <td style="${bgStyle(headerBlock, "#1a2332")};padding:${padY(block, "24px 32px")};" align="${align}">
            ${widthBox(headInner, block, align)}
          </td>
        </tr>`;
    }
    case "text": {
      const inner = `<div style="margin:0;font-size:${block.fontSize || 15}px;line-height:1.55;color:${block.color || "#1a2332"};">${bodyHtml(block.html || "")}</div>`;
      return `
        <tr>
          <td style="padding:${padY(block, "16px 32px")};${bgStyle(block)};" align="${align}">
            ${widthBox(inner, block, align)}
          </td>
        </tr>`;
    }
    case "image": {
      if (!block.src) {
        return `
        <tr>
          <td style="padding:${padY(block, "12px 32px")};${bgStyle(block)};" align="${align}">
            <div style="border:1px dashed #d8dee6;color:#5a6a7a;padding:12px 16px;font-size:13px;text-align:center;">Drop an image or GIF</div>
          </td>
        </tr>`;
      }
      const w = block.width || imageCellInnerWidth(block, cellWidth || 536, 12);
      const radius = cornerRadiusPx(block);
      const radiusCss = radius ? `border-radius:${radius}px;` : "border-radius:0;";
      const imgStyle = gridCell
        ? `display:block;border:0;width:100%;max-width:100%;height:auto;${radiusCss}`
        : `display:block;border:0;max-width:100%;width:${w}px;height:auto;${radiusCss}`;
      const img = `<img src="${esc(block.src)}" width="${w}" alt="${esc(block.alt || "")}" style="${imgStyle}" />`;
      const layout = block.layout || "full";
      if (layout === "left" || layout === "right") {
        const copy = block.html
          ? `<div style="margin:0;font-size:${block.fontSize || 15}px;line-height:1.55;color:${block.color || "#1a2332"};">${bodyHtml(block.html)}</div>`
          : block.caption
            ? `<p style="margin:0;font-size:12px;color:#5a6a7a;">${esc(block.caption)}</p>`
            : "&nbsp;";
        const imgCell = `<td width="42%" valign="top">${img}</td>`;
        const textCell = `<td width="58%" valign="middle">${copy}</td>`;
        const gap = `<td width="14" style="width:14px;font-size:1px;">&nbsp;</td>`;
        const row =
          layout === "left" ? `${imgCell}${gap}${textCell}` : `${textCell}${gap}${imgCell}`;
        return `
        <tr>
          <td style="padding:${padY(block, "12px 32px")};${bgStyle(block)};" align="${align}">
            ${widthBox(
              `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>${row}</tr></table>`,
              block,
              align,
            )}
          </td>
        </tr>`;
      }
      return `
        <tr>
          <td style="padding:${padY(block, "12px 32px")};${bgStyle(block)};" align="${align}">
            ${widthBox(
              `${img}${block.caption ? `<p style="margin:8px 0 0;font-size:12px;color:#5a6a7a;">${esc(block.caption)}</p>` : ""}`,
              block,
              align,
            )}
          </td>
        </tr>`;
    }
    case "button": {
      const bPadX = block.buttonPadX ?? 22;
      const bPadY = block.buttonPadY ?? 12;
      const bSize = block.buttonFontSize || 14;
      const bRadius = block.buttonRadius ?? 4;
      const fill = gridCell || block.buttonFill;
      const btn = fill
        ? `
            <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
              <tr>
                <td align="center" bgcolor="${block.buttonColor || "#3a84dc"}" style="border-radius:${bRadius}px;">
                  <a href="${esc(block.href || "https://jantaus.com/")}" style="display:block;padding:${bPadY}px ${bPadX}px;font-size:${bSize}px;font-weight:600;color:${block.buttonTextColor || "#ffffff"};text-decoration:none;border-radius:${bRadius}px;text-align:center;">${esc(block.label || "Learn more")}</a>
                </td>
              </tr>
            </table>`
        : `
            <table cellpadding="0" cellspacing="0" border="0" role="presentation" align="${align}">
              <tr>
                <td align="center" bgcolor="${block.buttonColor || "#3a84dc"}" style="border-radius:${bRadius}px;">
                  <a href="${esc(block.href || "https://jantaus.com/")}" style="display:inline-block;padding:${bPadY}px ${bPadX}px;font-size:${bSize}px;font-weight:600;color:${block.buttonTextColor || "#ffffff"};text-decoration:none;border-radius:${bRadius}px;">${esc(block.label || "Learn more")}</a>
                </td>
              </tr>
            </table>`;
      return `
        <tr>
          <td style="padding:${padY(block, "16px 32px")};${bgStyle(block)};" align="${align}">
            ${widthBox(btn, block, align)}
          </td>
        </tr>`;
    }
    case "metrics": {
      const items = block.items || [];
      const cells = items
        .map(
          (it, i) => `
          <td width="${Math.floor(100 / Math.max(items.length, 1))}%" align="center" style="padding:18px 8px;${i > 0 ? "border-left:1px solid #d8dee6;" : ""}">
            <div style="font-size:22px;font-weight:700;color:#3a84dc;line-height:1.1;">${esc(it.value)}</div>
            <div style="font-size:11px;font-weight:500;color:#5a6a7a;margin-top:6px;text-transform:uppercase;letter-spacing:0.04em;">${esc(it.label)}</div>
          </td>`,
        )
        .join("");
      const metrics = `
            <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background-color:#f4f7fa;">
              <tr>${cells}</tr>
            </table>`;
      return `
        <tr>
          <td style="padding:${padY(block, "8px 32px")};${bgStyle(block)};" align="${align}">
            ${widthBox(metrics, block, align)}
          </td>
        </tr>`;
    }
    case "columns": {
      const left = block.left || "";
      const right = block.right || "";
      const cols = `
            <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
              <tr>
                <td width="48%" valign="top" style="font-size:14px;line-height:1.5;color:#1a2332;padding-right:12px;">${bodyHtml(left)}</td>
                <td width="4%"></td>
                <td width="48%" valign="top" style="font-size:14px;line-height:1.5;color:#1a2332;padding-left:12px;">${bodyHtml(right)}</td>
              </tr>
            </table>`;
      return `
        <tr>
          <td style="padding:${padY(block, "12px 32px")};${bgStyle(block)};" align="${align}">
            ${widthBox(cols, block, align)}
          </td>
        </tr>`;
    }
    case "callout": {
      const box = `
            <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background-color:${block.calloutBg || "#f4f7fa"};border-left:3px solid ${block.accent || "#3a84dc"};">
              <tr>
                <td style="padding:14px 16px;font-size:14px;line-height:1.5;color:#1a2332;">${bodyHtml(block.html || "")}</td>
              </tr>
            </table>`;
      return `
        <tr>
          <td style="padding:${padY(block, "12px 32px")};${bgStyle(block)};" align="${align}">
            ${widthBox(box, block, align)}
          </td>
        </tr>`;
    }
    case "list": {
      const items = (block.items || []).filter(Boolean);
      const lis = items.map((it) => `<li style="margin:0 0 6px;">${bodyHtml(it)}</li>`).join("");
      const list = `<ul style="margin:0;padding-left:18px;font-size:15px;line-height:1.5;color:#1a2332;">${lis}</ul>`;
      return `
        <tr>
          <td style="padding:${padY(block, "16px 32px")};${bgStyle(block)};" align="${align}">
            ${widthBox(list, block, align)}
          </td>
        </tr>`;
    }
    case "divider": {
      const line = `
            <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
              <tr><td style="height:1px;background-color:${block.color || "#d8dee6"};font-size:1px;line-height:1px;">&nbsp;</td></tr>
            </table>`;
      return `
        <tr>
          <td style="padding:${padY(block, "8px 32px")};${bgStyle(block)};" align="${align}">
            ${widthBox(line, block, align)}
          </td>
        </tr>`;
    }
    case "spacer": {
      const h = gridCell
        ? Math.max(8, (block.gh || 1) * 28)
        : block.size || 16;
      return `<tr><td style="height:${h}px;font-size:1px;line-height:1px;${bgStyle(block)};">&nbsp;</td></tr>`;
    }
    case "attachments": {
      const items = block.items || [];
      if (!items.length) {
        return `
        <tr>
          <td style="padding:${padY(block, "12px 32px")};${bgStyle(block)};" align="${align}">
            ${widthBox(`<div style="border:1px dashed #d8dee6;color:#5a6a7a;padding:16px;font-size:12px;">Attachment checklist (empty)</div>`, block, align)}
          </td>
        </tr>`;
      }
      const list = items
        .map(
          (a) =>
            `<li style="margin:0 0 6px;font-size:13px;color:#1a2332;"><strong>${esc(a.name)}</strong>${a.sizeLabel ? ` <span style="color:#5a6a7a;">(${esc(a.sizeLabel)})</span>` : ""}</li>`,
        )
        .join("");
      const card = `
            <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background-color:#f4f7fa;">
              <tr>
                <td style="padding:14px 16px;">
                  <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#2a5080;text-transform:uppercase;letter-spacing:0.04em;">Attachments to include</p>
                  <ul style="margin:0;padding-left:18px;">${list}</ul>
                  <p style="margin:10px 0 0;font-size:11px;color:#5a6a7a;">Attach these files in Gmail when you send.</p>
                </td>
              </tr>
            </table>`;
      return `
        <tr>
          <td style="padding:${padY(block, "12px 32px 20px")};${bgStyle(block)};" align="${align}">
            ${widthBox(card, block, align)}
          </td>
        </tr>`;
    }
    case "footer": {
      const inner = renderFooterBlock(block, align);
      return `
        <tr>
          <td style="padding:${padY(block, "16px 32px")};${bgStyle(block)};" align="${align}">
            ${widthBox(inner, block, align)}
          </td>
        </tr>`;
    }
    case "custom":
      if (block.children?.length) {
        const inner = nestedChildrenTable(block, opts, cellWidth || 536);
        return `
        <tr>
          <td style="padding:${padY(block, "8px")};${bgStyle(block)};" align="${align}">
            ${inner}
          </td>
        </tr>`;
      }
      return renderCustomBlock(block, align);
    default:
      return "";
  }
}

function fontStack(key) {
  const map = {
    dm: "'DM Sans',Helvetica Neue,Helvetica,Arial,sans-serif",
    helvetica: "Helvetica Neue,Helvetica,Arial,sans-serif",
    arial: "Arial,Helvetica,sans-serif",
    georgia: "Georgia,'Times New Roman',Times,serif",
    verdana: "Verdana,Geneva,sans-serif",
    trebuchet: "'Trebuchet MS',Helvetica,Arial,sans-serif",
    mono: "'Courier New',Courier,monospace",
  };
  return map[key] || map.dm;
}

function renderCustomBlock(block, align) {
  const padT = block.padTop ?? 16;
  const padB = block.padBottom ?? 16;
  const padX = block.padX ?? 32;
  const font = fontStack(block.fontFamily);
  const weight = block.fontWeight || 400;
  const lh = block.lineHeight || 1.55;
  const tracking = block.letterSpacing != null ? `${block.letterSpacing}em` : "0";
  const linkColor = block.linkColor || "#3a84dc";
  const maxW = block.contentWidth || 100;
  const radius = block.borderRadius ?? 0;
  const borderW = block.borderWidth ?? 0;
  const borderC = block.borderColor || "#d8dee6";
  const borderStyle = block.borderStyle || "solid";
  const innerBg = block.useInnerBg && block.innerBg ? block.innerBg : "";
  const innerPad = block.innerPad ?? 0;
  const showTitle = block.showTitle !== false && block.title;
  const titleSize = block.titleSize || 12;
  const titleWeight = block.titleWeight || 700;
  const titleTransform = block.titleTransform || "uppercase";
  const titleTrack = block.titleTracking != null ? `${block.titleTracking}em` : "0.06em";
  const imagePos = block.imagePosition || "above";
  const sideImage = block.showImage && block.imageSrc && (imagePos === "left" || imagePos === "right");

  const titleHtml = showTitle
    ? `<p style="margin:0 0 ${block.html || block.showButton ? "10px" : "0"};font-size:${titleSize}px;font-weight:${titleWeight};letter-spacing:${titleTrack};text-transform:${titleTransform};color:${block.titleColor || "#3a84dc"};font-family:${font};">${esc(block.title)}</p>`
    : "";
  const body =
    block.html
      ? `<div style="margin:0;font-size:${block.fontSize || 15}px;line-height:${lh};font-weight:${weight};letter-spacing:${tracking};color:${block.color || "#1a2332"};font-family:${font};">${bodyHtml(block.html).replaceAll('style="color:#3a84dc;text-decoration:underline;"', `style="color:${linkColor};text-decoration:underline;"`)}</div>`
      : "";
  let buttonHtml = "";
  if (block.showButton && block.buttonLabel) {
    const bAlign = block.buttonAlign || align || "left";
    buttonHtml = `
      <table cellpadding="0" cellspacing="0" border="0" role="presentation" align="${bAlign}" style="margin-top:14px;">
        <tr>
          <td align="center" bgcolor="${block.buttonColor || "#3a84dc"}" style="border-radius:${block.buttonRadius ?? 4}px;">
            <a href="${esc(block.buttonHref || "https://jantaus.com/")}" style="display:inline-block;padding:${block.buttonPadY ?? 12}px ${block.buttonPadX ?? 22}px;font-size:${block.buttonFontSize || 14}px;font-weight:600;color:${block.buttonTextColor || "#ffffff"};text-decoration:none;border-radius:${block.buttonRadius ?? 4}px;font-family:${font};">${esc(block.buttonLabel)}</a>
          </td>
        </tr>
      </table>`;
  }

  let inner = "";
  if (sideImage) {
    const w = Math.min(block.imageWidth || 200, 280);
    const img = `<img src="${esc(block.imageSrc)}" width="${w}" alt="${esc(block.imageAlt || "")}" style="display:block;border:0;max-width:100%;height:auto;border-radius:${block.imageRounded ? "8px" : "0"};" />`;
    const copy = `${titleHtml}${body}${buttonHtml}` || "&nbsp;";
    const imgCell = `<td width="38%" valign="top">${img}</td>`;
    const textCell = `<td width="62%" valign="middle">${copy}</td>`;
    const gap = `<td width="14" style="width:14px;font-size:1px;">&nbsp;</td>`;
    inner =
      imagePos === "left"
        ? `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>${imgCell}${gap}${textCell}</tr></table>`
        : `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>${textCell}${gap}${imgCell}</tr></table>`;
  } else {
    if (block.showImage && block.imageSrc && imagePos !== "below") {
      inner += customImageHtml(block);
    }
    inner += titleHtml + body;
    if (block.showImage && block.imageSrc && imagePos === "below") {
      inner += customImageHtml(block);
    }
    inner += buttonHtml;
  }

  const cardStyles = [
    innerBg ? `background-color:${innerBg}` : "",
    borderW > 0 ? `border:${borderW}px ${borderStyle} ${borderC}` : "",
    radius ? `border-radius:${radius}px` : "",
    innerPad ? `padding:${innerPad}px` : "",
    maxW < 100 ? `max-width:${maxW}%;width:${maxW}%` : "width:100%",
  ]
    .filter(Boolean)
    .join(";");

  let content = inner;
  if (cardStyles) {
    content = `<table width="${maxW < 100 ? maxW + "%" : "100%"}" cellpadding="0" cellspacing="0" border="0" role="presentation" align="${align}" style="${cardStyles}"><tr><td>${inner}</td></tr></table>`;
  }

  if (block.showAccent) {
    const accent = block.accentColor || "#3a84dc";
    const aw = block.accentWidth || 3;
    const side = block.accentSide || "left";
    if (side === "top") {
      content = `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
          <tr><td style="height:${aw}px;background:${accent};font-size:1px;line-height:1px;">&nbsp;</td></tr>
          <tr><td style="padding-top:12px;">${content}</td></tr>
        </table>`;
    } else {
      content = `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
          <tr>
            <td width="${aw}" style="width:${aw}px;background:${accent};font-size:1px;">&nbsp;</td>
            <td style="padding-left:14px;">${content}</td>
          </tr>
        </table>`;
    }
  }

  return `
    <tr>
      <td style="padding:${padT}px ${padX}px ${padB}px;${bgStyle(block)};" align="${align}">
        ${content || "&nbsp;"}
      </td>
    </tr>`;
}

function customImageHtml(block) {
  const w = block.imageWidth || 536;
  const mt = block.imagePosition === "below" ? "12px" : "0";
  const mb = block.imagePosition === "below" ? "0" : block.title || block.html ? "12px" : "0";
  return `<div style="margin:${mt} 0 ${mb};" align="${block.align || "left"}"><img src="${esc(block.imageSrc)}" width="${w}" alt="${esc(block.imageAlt || "")}" style="display:inline-block;border:0;max-width:100%;height:auto;border-radius:${block.imageRounded ? "8px" : "0"};" /></div>`;
}

export function compileEmailHtml(doc, { absoluteLogoOrigin } = {}) {
  const canvasW = Math.min(CANVAS_WIDTH_MAX, Math.max(CANVAS_WIDTH_MIN, Number(doc.canvasWidth) || CANVAS_WIDTH_DEFAULT));
  const opts = { absoluteLogoOrigin };
  // Unified canvas: migrate older stack docs / baseHeader chrome, then pack to Gmail tables
  enableGridLayout(doc);
  const canvas = ensureCanvas(doc);
  const canvasBg = canvas.bgColor || "#ffffff";
  const packed = packGridToTableRows(doc, (b, w) => renderBlockCell(b, opts, w));
  const blocks = packed;

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(doc.subject || "Janta Power")}</title>
</head>
<body style="margin:0;padding:0;background:#e8eef4;">
  ${doc.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(doc.preheader)}</div>` : ""}
  <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background:#e8eef4;padding:32px 12px;">
    <tr>
      <td align="center">
        <table width="${canvasW}" cellpadding="0" cellspacing="0" border="0" role="presentation" style="max-width:${canvasW}px;width:100%;background:${canvasBg};font-family:'DM Sans',Helvetica Neue,Helvetica,Arial,sans-serif;">
          ${blocks}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  if (absoluteLogoOrigin) {
    html = html.replaceAll('src="/assets/', `src="${absoluteLogoOrigin}/assets/`);
  }
  // Prefer embedded logo so Gmail / paste always shows the JP mark
  const embedded = logoSrc();
  html = html.replaceAll(`src="${LOGO_LOCAL}"`, `src="${embedded}"`);
  html = html.replaceAll(`src='${LOGO_LOCAL}'`, `src='${embedded}'`);
  if (absoluteLogoOrigin) {
    html = html.replaceAll(`src="${absoluteLogoOrigin}/assets/janta-logo.png"`, `src="${embedded}"`);
    html = html.replaceAll(`src='${absoluteLogoOrigin}/assets/janta-logo.png'`, `src='${embedded}'`);
  }
  return html;
}

export function compilePlainText(doc) {
  const lines = [];
  if (doc.subject) lines.push(`Subject: ${doc.subject}`, "");
  for (const block of doc.blocks || []) {
    if (block.hidden) continue;
    if (block.type === "header") {
      if (block.eyebrow) lines.push(block.eyebrow);
      if (block.heading) lines.push(block.heading, "");
    } else if (block.type === "text" || block.type === "callout" || block.type === "custom") {
      if (block.type === "custom" && block.title && block.showTitle !== false) lines.push(block.title);
      lines.push(htmlToPlain(block.html || ""), "");
      if (block.type === "custom" && block.showButton && block.buttonLabel) {
        lines.push(`${block.buttonLabel}: ${block.buttonHref || ""}`, "");
      }
    } else if (block.type === "button") {
      lines.push(`${block.label || "Link"}: ${block.href || ""}`, "");
    } else if (block.type === "metrics") {
      for (const it of block.items || []) lines.push(`${it.value} — ${it.label}`);
      lines.push("");
    } else if (block.type === "columns") {
      lines.push(htmlToPlain(block.left || ""), "", htmlToPlain(block.right || ""), "");
    } else if (block.type === "list") {
      for (const it of block.items || []) lines.push(`• ${htmlToPlain(it)}`);
      lines.push("");
    } else if (block.type === "attachments" && block.items?.length) {
      lines.push("Attachments to include:");
      for (const a of block.items) lines.push(`- ${a.name}${a.sizeLabel ? ` (${a.sizeLabel})` : ""}`);
      lines.push("");
    } else if (block.type === "image" && block.src) {
      lines.push(`[Image: ${block.alt || block.caption || "embedded"}]`, block.src, "");
    } else if (block.type === "footer") {
      if (block.tagline) lines.push(htmlToPlain(block.tagline));
      for (const l of footerLinks(block)) lines.push(`${l.label || "Link"}: ${l.href || ""}`);
      for (const s of (block.social || []).filter((x) => x?.href)) {
        lines.push(`${s.label || s.network || "Social"}: ${s.href}`);
      }
      const parts = [block.company, block.location].filter(Boolean);
      if (parts.length) lines.push(parts.join(" · "), "");
    }
  }
  return lines.join("\n");
}

/**
 * Body fragment for rich paste into Gmail/Word (not a full HTML document).
 * @param {string} html
 */
export function htmlPasteFragment(html) {
  const s = String(html || "");
  const body = s.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return (body ? body[1] : s).trim();
}

/**
 * Copy email markup so rich editors (Gmail) paste rendered HTML, not source code.
 * Uses text/html + text/plain. Falls back to writeText if ClipboardItem is unavailable.
 * @param {string} html Full document or fragment
 * @param {string} [plain]
 */
export async function copyRichHtmlToClipboard(html, plain = "") {
  const fragment = htmlPasteFragment(html);
  const plainText = plain || fragment.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([fragment], { type: "text/html" }),
          "text/plain": new Blob([plainText], { type: "text/plain" }),
        }),
      ]);
      return;
    } catch {
      /* fall through — some Chromium builds reject dual MIME without gesture quirks */
    }
  }

  // Fallback: execCommand copy with a hidden contenteditable that holds HTML
  const host = document.createElement("div");
  host.setAttribute("contenteditable", "true");
  host.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none;";
  host.innerHTML = fragment;
  document.body.appendChild(host);
  const range = document.createRange();
  range.selectNodeContents(host);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  const ok = document.execCommand("copy");
  sel?.removeAllRanges();
  host.remove();
  if (!ok && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(html);
  }
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Gmail total message size ceiling (approx). */
export const GMAIL_MESSAGE_LIMIT_BYTES = 25 * 1024 * 1024;

/** Max size for a single embedded image/GIF upload. */
export const MAX_EMBEDDED_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * UTF-8 byte length of the compiled HTML body (what gets copied into Gmail).
 * @param {{ subject?: string, preheader?: string, blocks?: any[], canvasWidth?: number }} doc
 * @param {{ absoluteLogoOrigin?: string }} [opts]
 */
export function estimateEmailBytes(doc, opts = {}) {
  const html = compileEmailHtml(doc, opts);
  return new TextEncoder().encode(html).length;
}

/**
 * @param {number} bytes
 * @param {number} [limit]
 * @returns {"ok" | "caution" | "warn" | "over"}
 */
export function emailSizeLevel(bytes, limit = GMAIL_MESSAGE_LIMIT_BYTES) {
  const ratio = bytes / limit;
  if (ratio >= 1) return "over";
  if (ratio >= 0.8) return "warn";
  if (ratio >= 0.5) return "caution";
  return "ok";
}

/** Approximate original file bytes from a data URL. */
export function dataUrlApproxBytes(dataUrl) {
  const s = String(dataUrl || "");
  if (!s.startsWith("data:")) return 0;
  const comma = s.indexOf(",");
  if (comma < 0) return 0;
  const meta = s.slice(0, comma);
  const payload = s.slice(comma + 1);
  if (/;base64/i.test(meta)) return Math.floor((payload.length * 3) / 4);
  try {
    return new TextEncoder().encode(decodeURIComponent(payload)).length;
  } catch {
    return payload.length;
  }
}
