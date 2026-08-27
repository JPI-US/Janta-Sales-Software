import { feetToPixels } from "./siteMapModel.js";

/** Fixed Janta tower footprint (ft). Layout / spacing still use these values. */
export const TOWER_WIDTH_FT = 8;
export const TOWER_LENGTH_FT = 14;

/** Draw icons a bit larger than true footprint so they read clearly on imagery. */
export const TOWER_ICON_SCALE = 1.38;

/**
 * Degrees clockwise from map north.
 * Compass N is always up on the map. Facing south ⇒ arrow points down ⇒ 180°.
 */
export const DEFAULT_TOWER_ROTATION_DEG = 180;

/**
 * Radius (ft) of the rotation sweep circle around a tower center —
 * half the footprint diagonal, scaled to match the on-screen icon.
 */
export const TOWER_ROTATION_RADIUS_FT =
  (Math.sqrt(TOWER_WIDTH_FT * TOWER_WIDTH_FT + TOWER_LENGTH_FT * TOWER_LENGTH_FT) / 2) *
  TOWER_ICON_SCALE;

/** Explore padding around the geocoded pin when the map is locked (meters). */
export const SITE_LOCK_PAD_METERS = 60;

/**
 * Esri World Imagery native tiles top out at 19; we allow overzoom past that
 * so sales can inspect tower placement more closely.
 */
export const SITE_MAP_MAX_ZOOM = 22;
export const SITE_MAP_NATIVE_ZOOM = 19;

/** Locked default zoom — start at native max, allow overzoom. */
export const SITE_LOCK_ZOOM = 19;
export const SITE_LOCK_MIN_ZOOM = 17;

/**
 * Icon fidelity by tower count + on-screen size.
 * Large installs use cheap DOM (solid rects) so pan/select stay responsive.
 * @returns {"full"|"simple"|"dot"}
 */
export function towerIconDetail(towerCount, wPx, { forceFull = false } = {}) {
  if (forceFull) return "full";
  const n = Number(towerCount) || 0;
  const w = Number(wPx) || 0;
  if (n >= 90 || w < 12) return "dot";
  if (n >= 40 || w < 20) return "simple";
  return "full";
}

/** Approximate lat/lng bounds padded by meters around a point. */
export function siteLockBounds(lat, lng, padMeters = SITE_LOCK_PAD_METERS) {
  const dLat = padMeters / 111320;
  const cos = Math.cos((lat * Math.PI) / 180);
  const dLng = padMeters / (111320 * Math.max(0.2, Math.abs(cos)));
  return [
    [lat - dLat, lng - dLng],
    [lat + dLat, lng + dLng],
  ];
}

export function sitePinHtml() {
  return `
    <div style="position:relative;width:28px;height:36px;transform:translate(-14px,-36px);filter:drop-shadow(0 2px 3px rgba(0,0,0,0.45));cursor:grab;">
      <svg width="28" height="36" viewBox="0 0 28 36" aria-hidden="true">
        <path d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.3 21.7 0 14 0z" fill="#C93C37"/>
        <circle cx="14" cy="13" r="5.5" fill="#fff"/>
      </svg>
    </div>
  `;
}

/** Layout metrics shared by HTML build + in-place DOM updates. */
export function towerIconMetrics(tower, zoom) {
  const lat = Number(tower.lat) || 0;
  const wPx = Math.round(feetToPixels(TOWER_WIDTH_FT, lat, zoom) * TOWER_ICON_SCALE * 10) / 10;
  const hPx = Math.round(feetToPixels(TOWER_LENGTH_FT, lat, zoom) * TOWER_ICON_SCALE * 10) / 10;
  const rot = Number.isFinite(Number(tower.rotationDeg))
    ? Math.round(Number(tower.rotationDeg) * 10) / 10
    : DEFAULT_TOWER_ROTATION_DEG;

  const arrowH = Math.max(9, Math.min(16, Math.round(hPx * 0.18)));
  const arrowW = Math.max(11, Math.min(Math.round(wPx * 0.42), arrowH + 3));
  const gap = Math.max(3, Math.round(hPx * 0.05));
  const topPad = arrowH + gap;
  const totalH = topPad + hPx;
  const originY = topPad + hPx / 2;

  return { wPx, hPx, rot, arrowH, arrowW, gap, topPad, totalH, originY };
}

function panelInnerHtml(detail, selected) {
  const rim = selected ? "#F3B664" : "rgba(255,255,255,0.92)";
  const rimW = selected ? 2.2 : 1.1;

  if (detail === "dot") {
    return `
      <svg viewBox="0 0 80 120" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="display:block">
        <rect x="8" y="10" width="64" height="100" rx="3" style="fill:#1E3F8A;stroke:${rim};stroke-width:${rimW}"/>
      </svg>
    `;
  }

  if (detail === "simple") {
    return `
      <svg viewBox="0 0 80 120" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="display:block">
        <rect x="6" y="9" width="32" height="94" rx="2" style="fill:#1E3F8A;stroke:${rim};stroke-width:${rimW}"/>
        <rect x="42" y="9" width="32" height="94" rx="2" style="fill:#244A9A;stroke:${rim};stroke-width:${rimW}"/>
      </svg>
    `;
  }

  // full — solid fills (no per-tower gradients) + light cell lines
  return `
    <svg viewBox="0 0 80 120" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="display:block">
      ${selected ? `<rect x="3" y="5" width="74" height="102" rx="3.5" fill="none" stroke="#F3B664" stroke-width="2.4"/>` : ""}
      <rect x="6" y="9" width="32" height="94" rx="2" style="fill:#1E3F8A;stroke:${rim};stroke-width:${rimW}"/>
      <g stroke="rgba(255,255,255,0.28)" stroke-width="0.55">
        <path d="M6 28 H38 M6 47 H38 M6 66 H38 M6 85 H38"/>
        <path d="M16.5 9 V103 M27 9 V103"/>
      </g>
      <rect x="42" y="9" width="32" height="94" rx="2" style="fill:#244A9A;stroke:${rim};stroke-width:${rimW}"/>
      <g stroke="rgba(255,255,255,0.28)" stroke-width="0.55">
        <path d="M42 28 H74 M42 47 H74 M42 66 H74 M42 85 H74"/>
        <path d="M53 9 V103 M63.5 9 V103"/>
      </g>
    </svg>
  `;
}

function facingArrowSvg() {
  return `
    <svg viewBox="0 0 24 16" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="display:block;overflow:visible">
      <path d="M12 1 L22 14 L12 11 L2 14 Z" fill="rgba(0,0,0,0.35)"/>
      <path d="M12 0.5 L21 13.5 L12 10.6 L3 13.5 Z" fill="#F3B664" stroke="#FFFFFF" stroke-width="1.15" stroke-linejoin="round"/>
    </svg>
  `;
}

/**
 * Icon layout (local coords, before rotation):
 *   [small arrow]
 *      ↕ gap
 *   [ 8×14 ft panel ]
 *
 * Rotated around panel center. Map north is up:
 *   0° → faces north · 180° → faces south (default)
 *
 * @param {object} [opts]
 * @param {"full"|"simple"|"dot"} [opts.detail]
 * @param {number} [opts.towerCount] — used when detail omitted
 * @param {boolean} [opts.forceFull]
 */
export function towerIconHtml(tower, zoom, selected, opts = {}) {
  const m = towerIconMetrics(tower, zoom);
  const detail =
    opts.detail ||
    towerIconDetail(opts.towerCount ?? 0, m.wPx, { forceFull: opts.forceFull });
  const showArrow = detail === "full";
  const topPad = showArrow ? m.topPad : 0;
  const totalH = topPad + m.hPx;
  const originY = topPad + m.hPx / 2;
  const sel = Boolean(selected);

  return {
    html: `
      <div class="janta-tower-hit${sel ? " is-selected" : ""}" data-detail="${detail}" style="width:${m.wPx}px;height:${totalH}px;position:relative;overflow:visible;cursor:grab;${sel ? "filter:drop-shadow(0 0 5px rgba(243,182,100,0.85));" : "filter:none;"}">
        <div class="janta-tower-spin" style="
          position:absolute;left:0;top:0;width:${m.wPx}px;height:${totalH}px;
          transform:rotate(${m.rot}deg);
          transform-origin:${(m.wPx / 2).toFixed(1)}px ${originY.toFixed(1)}px;
          filter:none;
        ">
          <div class="janta-tower-arrow" style="
            position:absolute;
            left:${((m.wPx - m.arrowW) / 2).toFixed(1)}px;
            top:0;
            width:${m.arrowW}px;
            height:${m.arrowH}px;
            pointer-events:none;
            display:${showArrow ? "block" : "none"};
          ">${showArrow ? facingArrowSvg() : ""}</div>
          <div class="janta-tower-body" style="
            position:absolute;
            left:0;top:${topPad}px;
            width:${m.wPx}px;height:${m.hPx}px;
            pointer-events:none;
            ${sel ? "outline:2.5px solid #F3B664;outline-offset:2px;border-radius:2px;" : "outline:none;"}
          ">${panelInnerHtml(detail, sel)}</div>
        </div>
      </div>
    `,
    wPx: m.wPx,
    hPx: totalH,
    iconAnchor: [m.wPx / 2, originY],
    detail,
    cacheKey: `${detail}|${m.wPx}|${totalH}|${m.rot}|${sel ? 1 : 0}`,
  };
}

/**
 * Mutate an existing tower icon DOM (avoids Leaflet setIcon / HTML reparse).
 * Returns false if structure is missing or detail level changed (caller should rebuild).
 */
export function updateTowerIconElement(rootEl, tower, zoom, selected, opts = {}) {
  if (!rootEl) return false;
  const hit = rootEl.classList?.contains("janta-tower-hit")
    ? rootEl
    : rootEl.querySelector?.(".janta-tower-hit");
  if (!hit) return false;

  const m = towerIconMetrics(tower, zoom);
  const detail =
    opts.detail ||
    towerIconDetail(opts.towerCount ?? 0, m.wPx, { forceFull: opts.forceFull });
  const prevDetail = hit.getAttribute("data-detail");
  if (prevDetail && prevDetail !== detail) return false;

  const showArrow = detail === "full";
  const topPad = showArrow ? m.topPad : 0;
  const totalH = topPad + m.hPx;
  const originY = topPad + m.hPx / 2;
  const sel = Boolean(selected);

  const spin = hit.querySelector(".janta-tower-spin");
  const arrow = hit.querySelector(".janta-tower-arrow");
  const body = hit.querySelector(".janta-tower-body");
  if (!spin || !body) return false;

  hit.classList.toggle("is-selected", sel);
  hit.setAttribute("data-detail", detail);
  hit.style.width = `${m.wPx}px`;
  hit.style.height = `${totalH}px`;

  spin.style.width = `${m.wPx}px`;
  spin.style.height = `${totalH}px`;
  spin.style.transform = `rotate(${m.rot}deg)`;
  spin.style.transformOrigin = `${(m.wPx / 2).toFixed(1)}px ${originY.toFixed(1)}px`;
  // Avoid filter on the rotating layer — some GPUs drop the whole paint with filter+transform.
  spin.style.filter = "none";
  hit.style.filter = sel ? "drop-shadow(0 0 5px rgba(243,182,100,0.85))" : "none";

  if (arrow) {
    arrow.style.display = showArrow ? "block" : "none";
    arrow.style.left = `${((m.wPx - m.arrowW) / 2).toFixed(1)}px`;
    arrow.style.width = `${m.arrowW}px`;
    arrow.style.height = `${m.arrowH}px`;
    if (showArrow && !arrow.childElementCount) {
      arrow.innerHTML = facingArrowSvg();
    }
  }

  body.style.top = `${topPad}px`;
  body.style.width = `${m.wPx}px`;
  body.style.height = `${m.hPx}px`;
  body.style.outline = sel ? "2.5px solid #F3B664" : "none";
  body.style.outlineOffset = sel ? "2px" : "";
  body.style.borderRadius = sel ? "2px" : "";

  // Keep panel SVG stable across selection — outline/filter carry the highlight.
  if (!body.childElementCount) {
    body.innerHTML = panelInnerHtml(detail, false);
  }

  return { wPx: m.wPx, hPx: totalH, iconAnchor: [m.wPx / 2, originY], detail };
}
