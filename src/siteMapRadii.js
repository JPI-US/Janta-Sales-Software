import L from "leaflet";
import { TOWER_ROTATION_RADIUS_FT } from "./siteMapMarkers.js";

export const TOWER_ROTATION_RADIUS_M = TOWER_ROTATION_RADIUS_FT * 0.3048;

export const TOWER_RADIUS_STYLE = {
  color: "#F3B664",
  weight: 1.5,
  opacity: 0.9,
  fillColor: "#F3B664",
  fillOpacity: 0.06,
  interactive: false,
  className: "janta-rotation-circle",
};

/** Pane under tower markers so rings don't cover icons. */
export function ensureRadiiPane(map) {
  if (!map) return null;
  if (!map.getPane("jantaRadii")) {
    map.createPane("jantaRadii");
    const pane = map.getPane("jantaRadii");
    pane.style.zIndex = 450;
    pane.style.pointerEvents = "none";
  }
  return map.getPane("jantaRadii");
}

/**
 * Draw rotation-sweep circles for every placed tower.
 * Used by editor, proposal preview, and PDF bake so framing matches.
 */
export function addTowerRotationCircles(map, towers = []) {
  if (!map) return [];
  ensureRadiiPane(map);
  const radiusM = TOWER_ROTATION_RADIUS_M;
  const layers = [];
  (towers || []).forEach((tower) => {
    if (tower?.lat == null || tower?.lng == null) return;
    layers.push(
      L.circle([tower.lat, tower.lng], {
        ...TOWER_RADIUS_STYLE,
        radius: radiusM,
        pane: "jantaRadii",
      }).addTo(map)
    );
  });
  return layers;
}
