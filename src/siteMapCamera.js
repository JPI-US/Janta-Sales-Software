import L from "leaflet";
import { normalizeSiteMap } from "./siteMapModel.js";
import {
  SITE_LOCK_MIN_ZOOM,
  SITE_LOCK_PAD_METERS,
  SITE_LOCK_ZOOM,
  SITE_MAP_MAX_ZOOM,
  siteLockBounds,
} from "./siteMapMarkers.js";
import { towersLatLngBounds } from "./siteMapLayout.js";

/** Shared fit padding (px) so proposal preview and PDF bake frame the same. */
export const SITE_MAP_VIEW_PADDING = [24, 24];

/**
 * Apply the same camera (center + zoom) used by proposal preview and PDF bake.
 * Prefer the editor-saved view center + zoom so pan/zoom in SiteMapEditor
 * is mirrored in the proposal section and PDF.
 */
export function applySiteMapCamera(map, siteMapInput, { padding = SITE_MAP_VIEW_PADDING } = {}) {
  const current = normalizeSiteMap(siteMapInput);
  if (!map || current.lat == null || current.lng == null) return;

  const savedZoom = Number(current.zoom);
  const hasView =
    Number.isFinite(current.viewLat) && Number.isFinite(current.viewLng);
  const hasZoom = Number.isFinite(savedZoom) && savedZoom >= 1;

  // Explicit camera from the editor (pan + zoom) — highest priority.
  if (hasView && hasZoom) {
    const z = Math.min(SITE_MAP_MAX_ZOOM, Math.max(1, savedZoom));
    if (current.towers?.length) map.setMinZoom(14);
    else map.setMinZoom(1);
    map.setView([current.viewLat, current.viewLng], z, { animate: false });
    return;
  }

  const towerBounds = towersLatLngBounds(current.towers, 45);
  const bounds = L.latLngBounds(
    towerBounds || siteLockBounds(current.lat, current.lng, SITE_LOCK_PAD_METERS)
  );

  if (hasZoom && savedZoom >= 14) {
    if (towerBounds) {
      map.setMinZoom(14);
      map.setView(
        [
          (bounds.getSouth() + bounds.getNorth()) / 2,
          (bounds.getWest() + bounds.getEast()) / 2,
        ],
        Math.min(SITE_MAP_MAX_ZOOM, savedZoom),
        { animate: false }
      );
    } else {
      map.setMinZoom(SITE_LOCK_MIN_ZOOM);
      map.setView(
        [current.lat, current.lng],
        Math.min(SITE_MAP_MAX_ZOOM, savedZoom),
        { animate: false }
      );
    }
    return;
  }

  if (towerBounds) {
    map.setMinZoom(14);
    map.fitBounds(bounds, { animate: false, padding, maxZoom: SITE_LOCK_ZOOM });
  } else if (current.mapLocked === true) {
    map.setMaxBounds(bounds.pad(0.02));
    map.setMinZoom(SITE_LOCK_MIN_ZOOM);
    map.setView([current.lat, current.lng], SITE_LOCK_ZOOM, { animate: false });
  } else {
    map.setView(
      [current.lat, current.lng],
      Math.min(SITE_MAP_MAX_ZOOM, current.zoom || SITE_LOCK_ZOOM),
      { animate: false }
    );
  }
}
