import L from "leaflet";
import "leaflet/dist/leaflet.css";
import html2canvas from "html2canvas";
import {
  ESRI_WORLD_IMAGERY_URL,
  createTower,
  normalizeSiteMap,
  siteMapHasLayout,
} from "./siteMapModel.js";
import { appendCompassOverlay } from "./siteMapCompass.js";
import {
  SITE_MAP_MAX_ZOOM,
  SITE_MAP_NATIVE_ZOOM,
  sitePinHtml,
  towerIconHtml,
} from "./siteMapMarkers.js";
import { applySiteMapCamera, SITE_MAP_VIEW_PADDING } from "./siteMapCamera.js";
import { addTowerRotationCircles, ensureRadiiPane } from "./siteMapRadii.js";

/** Same icon pipeline as SiteMapPreview so PDF matches the proposal section. */
function towerDivIcon(tower, zoom, towerCount = 0) {
  const { html, wPx, hPx, iconAnchor } = towerIconHtml(tower, zoom, false, {
    towerCount,
  });
  return L.divIcon({
    className: "janta-tower-icon",
    html,
    iconSize: [wPx, hPx],
    iconAnchor: iconAnchor || [wPx / 2, hPx / 2],
  });
}

function sitePinIcon() {
  return L.divIcon({
    className: "janta-site-pin",
    html: sitePinHtml(),
    iconSize: [28, 36],
    iconAnchor: [14, 36],
  });
}

function waitForTileLayer(layer, timeoutMs = 10000) {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    layer.once("load", () => {
      clearTimeout(timer);
      setTimeout(done, 350);
    });
    setTimeout(() => {
      if (!settled && layer._loading === false) {
        clearTimeout(timer);
        setTimeout(done, 350);
      }
    }, 100);
  });
}

/** Bake host size — keep in sync with proposal site-map block aspect. */
export const SITE_MAP_BAKE_WIDTH = 720;
export const SITE_MAP_BAKE_HEIGHT = 350;

/**
 * Off-screen Leaflet bake → PNG data URL for PDF.
 * Uses the same camera + tower icons as SiteMapPreview.
 * Returns null when there is no geocoded site map layout.
 */
export async function bakeSiteMapToDataUrl(siteMapInput) {
  const siteMap = normalizeSiteMap(siteMapInput);
  if (!siteMapHasLayout(siteMap)) return null;

  const host = document.createElement("div");
  host.id = "site-map-bake";
  host.setAttribute("data-janta-site-map-bake", "1");
  Object.assign(host.style, {
    position: "fixed",
    left: "-12000px",
    top: "0",
    width: `${SITE_MAP_BAKE_WIDTH}px`,
    height: `${SITE_MAP_BAKE_HEIGHT}px`,
    zIndex: "-1",
    background: "#1a1a1a",
  });
  document.body.appendChild(host);

  let map = null;
  try {
    map = L.map(host, {
      preferCanvas: true,
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      maxZoom: SITE_MAP_MAX_ZOOM,
      zoomSnap: 0,
      markerZoomAnimation: false,
    });

    const tiles = L.tileLayer(ESRI_WORLD_IMAGERY_URL, {
      attribution: "",
      maxZoom: SITE_MAP_MAX_ZOOM,
      maxNativeZoom: SITE_MAP_NATIVE_ZOOM,
      crossOrigin: true,
    }).addTo(map);

    map.invalidateSize(true);
    applySiteMapCamera(map, siteMap, { padding: SITE_MAP_VIEW_PADDING });
    map.invalidateSize(true);
    const zoom = map.getZoom();
    const towerCount = siteMap.towers.length;

    ensureRadiiPane(map);
    if (!map.getPane("jantaTowers")) {
      map.createPane("jantaTowers");
      map.getPane("jantaTowers").style.zIndex = 650;
    }

    L.marker([siteMap.lat, siteMap.lng], {
      icon: sitePinIcon(),
      interactive: false,
      keyboard: false,
      zIndexOffset: 800,
    }).addTo(map);

    addTowerRotationCircles(map, siteMap.towers);

    siteMap.towers.forEach((tower) => {
      if (tower.lat == null || tower.lng == null) return;
      L.marker([tower.lat, tower.lng], {
        icon: towerDivIcon(tower, zoom, towerCount),
        pane: "jantaTowers",
        interactive: false,
        keyboard: false,
        zIndexOffset: 600,
      }).addTo(map);
    });

    appendCompassOverlay(host);

    await waitForTileLayer(tiles);
    map.invalidateSize(true);
    // Re-apply after tiles/size settle so framing matches the live preview.
    applySiteMapCamera(map, siteMap, { padding: SITE_MAP_VIEW_PADDING });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const canvas = await html2canvas(host, {
      useCORS: true,
      allowTaint: false,
      logging: false,
      backgroundColor: "#1a1a1a",
      scale: 2,
      width: SITE_MAP_BAKE_WIDTH,
      height: SITE_MAP_BAKE_HEIGHT,
    });
    return canvas.toDataURL("image/png");
  } finally {
    if (map) map.remove();
    host.remove();
  }
}

export { towerDivIcon, createTower };
