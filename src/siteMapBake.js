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
  SITE_LOCK_MIN_ZOOM,
  SITE_LOCK_PAD_METERS,
  SITE_LOCK_ZOOM,
  SITE_MAP_MAX_ZOOM,
  SITE_MAP_NATIVE_ZOOM,
  siteLockBounds,
  sitePinHtml,
  towerIconHtml,
} from "./siteMapMarkers.js";
import { towersLatLngBounds } from "./siteMapLayout.js";

function towerDivIcon(tower, zoom) {
  const { html, wPx, hPx, iconAnchor } = towerIconHtml(tower, zoom, false, {
    forceFull: true,
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

/**
 * Off-screen Leaflet bake → PNG data URL for PDF.
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
    width: "720px",
    height: "350px",
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
    });

    const tiles = L.tileLayer(ESRI_WORLD_IMAGERY_URL, {
      attribution: "",
      maxZoom: SITE_MAP_MAX_ZOOM,
      maxNativeZoom: SITE_MAP_NATIVE_ZOOM,
      crossOrigin: true,
    }).addTo(map);

    const towerBounds = towersLatLngBounds(siteMap.towers, 45);
    const bounds = L.latLngBounds(
      towerBounds || siteLockBounds(siteMap.lat, siteMap.lng, SITE_LOCK_PAD_METERS)
    );
    const savedZoom = Number(siteMap.zoom);
    if (Number.isFinite(savedZoom) && savedZoom >= 14) {
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
          [siteMap.lat, siteMap.lng],
          Math.min(SITE_MAP_MAX_ZOOM, savedZoom),
          { animate: false }
        );
      }
    } else if (towerBounds) {
      map.setMinZoom(14);
      map.fitBounds(bounds, { animate: false, padding: [28, 28], maxZoom: SITE_LOCK_ZOOM });
    } else if (siteMap.mapLocked !== false) {
      map.setMaxBounds(bounds.pad(0.02));
      map.setMinZoom(SITE_LOCK_MIN_ZOOM);
      map.setView([siteMap.lat, siteMap.lng], SITE_LOCK_ZOOM, { animate: false });
    } else {
      map.setView([siteMap.lat, siteMap.lng], Math.min(SITE_MAP_MAX_ZOOM, siteMap.zoom || SITE_LOCK_ZOOM));
    }
    map.invalidateSize(true);
    const zoom = map.getZoom();

    L.marker([siteMap.lat, siteMap.lng], {
      icon: sitePinIcon(),
      interactive: false,
      keyboard: false,
      zIndexOffset: 800,
    }).addTo(map);

    siteMap.towers.forEach((tower) => {
      if (tower.lat == null || tower.lng == null) return;
      L.marker([tower.lat, tower.lng], {
        icon: towerDivIcon(tower, zoom),
        interactive: false,
        keyboard: false,
        zIndexOffset: 600,
      }).addTo(map);
    });

    appendCompassOverlay(host);

    await waitForTileLayer(tiles);
    map.invalidateSize(true);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const canvas = await html2canvas(host, {
      useCORS: true,
      allowTaint: false,
      logging: false,
      backgroundColor: "#1a1a1a",
      scale: 2,
      width: 720,
      height: 350,
    });
    return canvas.toDataURL("image/png");
  } finally {
    if (map) map.remove();
    host.remove();
  }
}

export { towerDivIcon, createTower };
