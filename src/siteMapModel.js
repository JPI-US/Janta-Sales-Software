import { DEFAULT_TOWER_ROTATION_DEG, TOWER_LENGTH_FT, TOWER_WIDTH_FT } from "./siteMapMarkers.js";

/** Esri World Imagery — URL uses {z}/{y}/{x} (not Leaflet's usual {z}/{x}/{y}). */
export const ESRI_WORLD_IMAGERY_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

export const ESRI_ATTRIBUTION =
  "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community";

export function createEmptySiteMap(overrides = {}) {
  return {
    address: "",
    lat: null,
    lng: null,
    /** Camera center for proposal preview / PDF (independent of site pin). */
    viewLat: null,
    viewLng: null,
    zoom: 19,
    mapLocked: false,
    towers: [],
    bakedImageDataUrl: null,
    ...overrides,
  };
}

export function newTowerId() {
  return `tower_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function createTower({ lat, lng, rotationDeg = DEFAULT_TOWER_ROTATION_DEG, id } = {}) {
  return {
    id: id || newTowerId(),
    lat: lat ?? null,
    lng: lng ?? null,
    rotationDeg: Number.isFinite(Number(rotationDeg)) ? Number(rotationDeg) : DEFAULT_TOWER_ROTATION_DEG,
    widthFt: TOWER_WIDTH_FT,
    heightFt: TOWER_LENGTH_FT,
  };
}

export function normalizeSiteMap(raw) {
  if (!raw || typeof raw !== "object") return createEmptySiteMap();
  const towers = Array.isArray(raw.towers)
    ? raw.towers
        .filter((t) => t && typeof t === "object")
        .map((t) =>
          createTower({
            id: typeof t.id === "string" ? t.id : newTowerId(),
            lat: Number.isFinite(Number(t.lat)) ? Number(t.lat) : null,
            lng: Number.isFinite(Number(t.lng)) ? Number(t.lng) : Number.isFinite(Number(t.lon)) ? Number(t.lon) : null,
            rotationDeg: t.rotationDeg,
          })
        )
    : [];
  const lat = Number.isFinite(Number(raw.lat)) ? Number(raw.lat) : null;
  const lng = Number.isFinite(Number(raw.lng))
    ? Number(raw.lng)
    : Number.isFinite(Number(raw.lon))
      ? Number(raw.lon)
      : null;
  const zoom = Number.isFinite(Number(raw.zoom)) ? Number(raw.zoom) : 19;
  const viewLat = Number.isFinite(Number(raw.viewLat))
    ? Number(raw.viewLat)
    : null;
  const viewLng = Number.isFinite(Number(raw.viewLng))
    ? Number(raw.viewLng)
    : Number.isFinite(Number(raw.viewLon))
      ? Number(raw.viewLon)
      : null;
  return createEmptySiteMap({
    address: typeof raw.address === "string" ? raw.address : "",
    lat,
    lng,
    viewLat,
    viewLng,
    zoom: Math.min(22, Math.max(1, zoom)),
    mapLocked: raw.mapLocked === true,
    towers,
    bakedImageDataUrl: typeof raw.bakedImageDataUrl === "string" ? raw.bakedImageDataUrl : null,
  });
}

export function siteMapHasLayout(siteMap) {
  const s = normalizeSiteMap(siteMap);
  return s.lat != null && s.lng != null;
}

/** True when enough towers are placed for the system size (5.6 kW/tower).
 * Projects with no size do not require a site map. Otherwise address + tower count must match.
 */
export function siteMapMeetsTowerRequirement(siteMap, projectKw) {
  const kw = Number(projectKw) || 0;
  const needed = kw > 0 ? Math.ceil(kw / 5.6) : 0;
  if (needed <= 0) return true;
  const s = normalizeSiteMap(siteMap);
  if (!siteMapHasLayout(s)) return false;
  return s.towers.length >= needed;
}

/** Meters per CSS pixel at lat/zoom (Web Mercator). */
export function metersPerPixel(lat, zoom) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
}

export function feetToPixels(feet, lat, zoom) {
  const mpp = metersPerPixel(lat, zoom);
  if (!Number.isFinite(mpp) || mpp <= 0) return 12;
  return Math.max(10, (Number(feet) * 0.3048) / mpp);
}
