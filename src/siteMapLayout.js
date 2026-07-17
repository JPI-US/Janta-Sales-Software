import { createTower } from "./siteMapModel.js";
import { DEFAULT_TOWER_ROTATION_DEG } from "./siteMapMarkers.js";

/**
 * Tower count is driven by system size: 11.2 kW → 2 towers ⇒ 5.6 kW/tower.
 */
export const KW_PER_TOWER = 5.6;

/** Max towers we auto-generate in one go (safety). */
export const AUTO_LAYOUT_MAX_TOWERS = 400;

/** Auto-layout only for this many towers and up (small jobs stay manual). */
export const AUTO_LAYOUT_MIN_TOWERS = 4;

/**
 * Center-to-center spacing (ft) — every neighbor is 25 ft apart
 * left/right (columns) and up/down (rows) for auto-layout / even-space.
 */
export const DEFAULT_COL_PITCH_FT = 25;
export const DEFAULT_ROW_PITCH_FT = 25;
export const TOWER_SPACING_FT = 25;

/** Finer snap while dragging — keeps layout pitch, but allows precise nudges. */
export const SNAP_GRID_FT = 5;

/** Hard minimum center-to-center clearance (ft) in any direction. */
export const MIN_TOWER_SEPARATION_FT = 25;

export function towersNeededForKw(kw) {
  const n = Math.ceil((Number(kw) || 0) / KW_PER_TOWER);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(AUTO_LAYOUT_MAX_TOWERS, n);
}

export function canAutoLayoutCount(count) {
  return (Number(count) || 0) >= AUTO_LAYOUT_MIN_TOWERS;
}

export function suggestColumns(count) {
  if (count <= 0) return 1;
  // Near-square grid; columns/rows then drive placement at fixed pitch
  return Math.max(1, Math.round(Math.sqrt(count)));
}

export function suggestRows(count, columns) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const cols = Math.max(1, Math.min(n || 1, Math.floor(Number(columns) || suggestColumns(n))));
  return n <= 0 ? 1 : Math.ceil(n / cols);
}

function offsetLatLng(lat, lng, eastFt, northFt) {
  const mE = eastFt * 0.3048;
  const mN = northFt * 0.3048;
  const dLat = mN / 111320;
  const dLng = mE / (111320 * Math.max(0.2, Math.abs(Math.cos((lat * Math.PI) / 180))));
  return { lat: lat + dLat, lng: lng + dLng };
}

export { offsetLatLng };

/**
 * Build a centered rectangular grid of towers around a site pin.
 * Rows run east–west; columns increase southward (typical south-facing field).
 */
export function buildTowerGrid({
  lat,
  lng,
  count,
  columns,
  colPitchFt = DEFAULT_COL_PITCH_FT,
  rowPitchFt = DEFAULT_ROW_PITCH_FT,
  rotationDeg = DEFAULT_TOWER_ROTATION_DEG,
} = {}) {
  const n = Math.min(AUTO_LAYOUT_MAX_TOWERS, Math.max(0, Math.floor(Number(count) || 0)));
  if (!n || lat == null || lng == null) return [];

  const cols = Math.max(1, Math.min(n, Math.floor(Number(columns) || suggestColumns(n))));
  const rows = Math.ceil(n / cols);

  const widthFt = (cols - 1) * colPitchFt;
  const heightFt = (rows - 1) * rowPitchFt;
  const originEast = -widthFt / 2;
  const originNorth = heightFt / 2; // first row north of center

  const towers = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const east = originEast + c * colPitchFt;
    const north = originNorth - r * rowPitchFt;
    const pos = offsetLatLng(lat, lng, east, north);
    towers.push(
      createTower({
        lat: pos.lat,
        lng: pos.lng,
        rotationDeg,
      })
    );
  }
  return towers;
}

/** East/north feet of a point relative to an origin. */
export function localOffsetsFt(lat, lng, originLat, originLng) {
  const northFt = ((lat - originLat) * 111320) / 0.3048;
  const cos = Math.max(0.2, Math.abs(Math.cos((originLat * Math.PI) / 180)));
  const eastFt = (((lng - originLng) * 111320 * cos)) / 0.3048;
  return { eastFt, northFt };
}

/**
 * Snap a lat/lng to the nearest site grid cell (aligned to map E/N, matching auto-layout pitches).
 */
export function snapLatLng(
  lat,
  lng,
  originLat,
  originLng,
  colPitchFt = DEFAULT_COL_PITCH_FT,
  rowPitchFt = DEFAULT_ROW_PITCH_FT
) {
  if (originLat == null || originLng == null) return { lat, lng };
  const col = Math.max(1, Number(colPitchFt) || DEFAULT_COL_PITCH_FT);
  const row = Math.max(1, Number(rowPitchFt) || DEFAULT_ROW_PITCH_FT);
  const { eastFt, northFt } = localOffsetsFt(lat, lng, originLat, originLng);
  const east = Math.round(eastFt / col) * col;
  const north = Math.round(northFt / row) * row;
  return offsetLatLng(originLat, originLng, east, north);
}

/** Center-to-center distance (ft) between two lat/lng points. */
export function towerSeparationFt(a, b) {
  if (a?.lat == null || a?.lng == null || b?.lat == null || b?.lng == null) return Infinity;
  const { eastFt, northFt } = localOffsetsFt(a.lat, a.lng, b.lat, b.lng);
  return Math.hypot(eastFt, northFt);
}

/**
 * True when every tower is at least minFt from every other (axis-aligned layout uses this
 * as the hard clearance for left/right and up/down placement).
 */
export function layoutRespectsMinSeparation(towers, minFt = MIN_TOWER_SEPARATION_FT) {
  const pts = (towers || []).filter((t) => t.lat != null && t.lng != null);
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      if (towerSeparationFt(pts[i], pts[j]) < minFt - 0.05) return false;
    }
  }
  return true;
}

/**
 * Merge proposed moves into the full tower list and check the min-separation rule.
 * `moves` is Map|Object id → {lat,lng}.
 */
export function movesRespectMinSeparation(existingTowers, moves, minFt = MIN_TOWER_SEPARATION_FT) {
  const moveMap = moves instanceof Map ? moves : new Map(Object.entries(moves || {}));
  const merged = (existingTowers || []).map((t) => {
    const m = moveMap.get(t.id);
    return m ? { ...t, lat: m.lat, lng: m.lng } : t;
  });
  return layoutRespectsMinSeparation(merged, minFt);
}

/**
 * Spiral out on the snap grid from a seed until a free cell is found (≥ minFt from others).
 */
export function findOpenSnapSlot({
  seedLat,
  seedLng,
  originLat,
  originLng,
  existingTowers = [],
  snapFt = SNAP_GRID_FT,
  minFt = MIN_TOWER_SEPARATION_FT,
  maxRing = 40,
} = {}) {
  const origin = {
    lat: originLat != null ? originLat : seedLat,
    lng: originLng != null ? originLng : seedLng,
  };
  const seed = snapLatLng(seedLat, seedLng, origin.lat, origin.lng, snapFt, snapFt);
  const others = (existingTowers || []).filter((t) => t.lat != null && t.lng != null);

  const isFree = (lat, lng) =>
    others.every((t) => towerSeparationFt({ lat, lng }, t) >= minFt - 0.05);

  if (isFree(seed.lat, seed.lng)) return seed;

  for (let ring = 1; ring <= maxRing; ring++) {
    for (let de = -ring; de <= ring; de++) {
      for (let dn = -ring; dn <= ring; dn++) {
        if (Math.max(Math.abs(de), Math.abs(dn)) !== ring) continue;
        const pos = offsetLatLng(seed.lat, seed.lng, de * snapFt, dn * snapFt);
        if (isFree(pos.lat, pos.lng)) return pos;
      }
    }
  }
  return null;
}

/**
 * Re-lay existing towers on an even grid around a center, keeping ids + rotation.
 * Uses selected subset when provided; otherwise all towers.
 */
export function redistributeEvenly(towers, {
  columns,
  colPitchFt = DEFAULT_COL_PITCH_FT,
  rowPitchFt = DEFAULT_ROW_PITCH_FT,
  centerLat,
  centerLng,
  ids = null,
} = {}) {
  const all = Array.isArray(towers) ? towers : [];
  const idSet = ids && ids.length ? new Set(ids) : null;
  const targets = idSet ? all.filter((t) => idSet.has(t.id)) : all.filter((t) => t.lat != null && t.lng != null);
  if (targets.length < 2) return all;

  let lat = centerLat;
  let lng = centerLng;
  if (lat == null || lng == null) {
    lat = targets.reduce((s, t) => s + t.lat, 0) / targets.length;
    lng = targets.reduce((s, t) => s + t.lng, 0) / targets.length;
  }

  const cols = Math.max(1, Math.min(targets.length, Math.floor(Number(columns) || suggestColumns(targets.length))));
  const placed = buildTowerGrid({
    lat,
    lng,
    count: targets.length,
    columns: cols,
    colPitchFt,
    rowPitchFt,
    rotationDeg: DEFAULT_TOWER_ROTATION_DEG,
  });

  const byId = new Map();
  targets.forEach((t, i) => {
    byId.set(t.id, {
      ...t,
      lat: placed[i].lat,
      lng: placed[i].lng,
      // keep each tower's own rotation
      rotationDeg: t.rotationDeg,
    });
  });

  return all.map((t) => byId.get(t.id) || t);
}

/** Bounding box around towers for lock/fit, with pad meters. */
export function towersLatLngBounds(towers, padMeters = 40) {
  const pts = (towers || []).filter((t) => t.lat != null && t.lng != null);
  if (!pts.length) return null;
  let minLat = pts[0].lat;
  let maxLat = pts[0].lat;
  let minLng = pts[0].lng;
  let maxLng = pts[0].lng;
  pts.forEach((t) => {
    minLat = Math.min(minLat, t.lat);
    maxLat = Math.max(maxLat, t.lat);
    minLng = Math.min(minLng, t.lng);
    maxLng = Math.max(maxLng, t.lng);
  });
  const dLat = padMeters / 111320;
  const midLat = (minLat + maxLat) / 2;
  const dLng = padMeters / (111320 * Math.max(0.2, Math.abs(Math.cos((midLat * Math.PI) / 180))));
  return [
    [minLat - dLat, minLng - dLng],
    [maxLat + dLat, maxLng + dLng],
  ];
}
