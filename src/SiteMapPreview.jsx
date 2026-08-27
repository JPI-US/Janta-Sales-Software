import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  ESRI_WORLD_IMAGERY_URL,
  normalizeSiteMap,
  siteMapHasLayout,
} from "./siteMapModel.js";
import { addCompassControl } from "./siteMapCompass.js";
import {
  SITE_MAP_MAX_ZOOM,
  SITE_MAP_NATIVE_ZOOM,
  sitePinHtml,
  towerIconHtml,
  updateTowerIconElement,
} from "./siteMapMarkers.js";
import { applySiteMapCamera } from "./siteMapCamera.js";
import { addTowerRotationCircles, ensureRadiiPane } from "./siteMapRadii.js";

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

function applyPreviewTowerVisual(marker, tower, zoom, towerCount) {
  const el = marker.getElement?.();
  if (el) {
    const updated = updateTowerIconElement(el, tower, zoom, false, { towerCount });
    if (updated) {
      el.style.width = `${updated.wPx}px`;
      el.style.height = `${updated.hPx}px`;
      el.style.marginLeft = `${-updated.iconAnchor[0]}px`;
      el.style.marginTop = `${-updated.iconAnchor[1]}px`;
      const icon = marker.options.icon;
      if (icon) {
        icon.options.iconSize = [updated.wPx, updated.hPx];
        icon.options.iconAnchor = updated.iconAnchor;
      }
      return;
    }
  }
  marker.setIcon(towerDivIcon(tower, zoom, towerCount));
}

function sitePinIcon() {
  return L.divIcon({
    className: "janta-site-pin",
    html: sitePinHtml(),
    iconSize: [28, 36],
    iconAnchor: [14, 36],
  });
}

/**
 * Read-only site map preview for proposal / PDF framing.
 * Camera follows siteMap.viewLat/viewLng + zoom from Region & System (SiteMapEditor).
 * Interaction is intentionally disabled — adjust the map only in the editor.
 *
 * @param {number|string} [height=280]
 * @param {number} [fixedWidth] — when set, map uses this CSS width (for bake-matched framing)
 */
export default function SiteMapPreview({
  siteMap,
  height = 280,
  fixedWidth,
}) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const circlesRef = useRef([]);
  const towersRef = useRef([]);

  const sm = normalizeSiteMap(siteMap);
  const layoutKey = useMemo(() => {
    if (!siteMapHasLayout(sm)) return "";
    return JSON.stringify({
      lat: sm.lat,
      lng: sm.lng,
      locked: sm.mapLocked === true,
      towers: sm.towers.map((t) => [t.id, t.lat, t.lng, t.rotationDeg]),
      fixedWidth: fixedWidth || null,
      height: height === "100%" ? "100%" : Number(height) || 280,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteMap?.lat, siteMap?.lng, siteMap?.mapLocked, siteMap?.towers, fixedWidth, height]);

  useEffect(() => {
    if (!layoutKey || !elRef.current) return undefined;

    const current = normalizeSiteMap(siteMap);
    towersRef.current = current.towers;
    const map = L.map(elRef.current, {
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
      zoomDelta: 0.5,
      markerZoomAnimation: false,
    });
    L.tileLayer(ESRI_WORLD_IMAGERY_URL, {
      attribution: "",
      maxZoom: SITE_MAP_MAX_ZOOM,
      maxNativeZoom: SITE_MAP_NATIVE_ZOOM,
      crossOrigin: true,
    }).addTo(map);
    addCompassControl(map, "topright");
    ensureRadiiPane(map);
    if (!map.getPane("jantaTowers")) {
      map.createPane("jantaTowers");
      map.getPane("jantaTowers").style.zIndex = 650;
    }

    applySiteMapCamera(map, current);

    L.marker([current.lat, current.lng], {
      icon: sitePinIcon(),
      interactive: false,
      keyboard: false,
      zIndexOffset: 800,
    }).addTo(map);

    circlesRef.current = addTowerRotationCircles(map, current.towers);

    const refreshTowerIcons = () => {
      const z = map.getZoom();
      const towers = towersRef.current;
      const count = towers.length;

      if (markersRef.current.length !== towers.filter((t) => t.lat != null && t.lng != null).length) {
        markersRef.current.forEach((m) => m.remove());
        markersRef.current = [];
        towers.forEach((tower) => {
          if (tower.lat == null || tower.lng == null) return;
          const marker = L.marker([tower.lat, tower.lng], {
            icon: towerDivIcon(tower, z, count),
            pane: "jantaTowers",
            interactive: false,
            keyboard: false,
            zIndexOffset: 600,
          }).addTo(map);
          markersRef.current.push(marker);
        });
        return;
      }

      let i = 0;
      towers.forEach((tower) => {
        if (tower.lat == null || tower.lng == null) return;
        const marker = markersRef.current[i++];
        if (!marker) return;
        marker.setLatLng([tower.lat, tower.lng]);
        applyPreviewTowerVisual(marker, tower, z, count);
      });
    };

    refreshTowerIcons();

    mapRef.current = map;
    map._jantaRefreshTowers = refreshTowerIcons;
    requestAnimationFrame(() => {
      map.invalidateSize(true);
      applySiteMapCamera(map, current);
      refreshTowerIcons();
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      circlesRef.current.forEach((c) => c.remove());
      circlesRef.current = [];
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey]);

  // Keep this map's camera linked to shared siteMap view from the editor.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const current = normalizeSiteMap(siteMap);
    const z = Number(current.zoom);
    const vLat = Number(current.viewLat);
    const vLng = Number(current.viewLng);
    if (!Number.isFinite(z)) return;

    const center = map.getCenter();
    const zoomSame = Math.abs(map.getZoom() - z) < 0.05;
    const centerSame =
      Number.isFinite(vLat) &&
      Number.isFinite(vLng) &&
      Math.abs(center.lat - vLat) < 1e-6 &&
      Math.abs(center.lng - vLng) < 1e-6;

    if (Number.isFinite(vLat) && Number.isFinite(vLng)) {
      if (zoomSame && centerSame) return;
    } else if (zoomSame) {
      return;
    }

    applySiteMapCamera(map, current);
    if (typeof map._jantaRefreshTowers === "function") map._jantaRefreshTowers();
  }, [siteMap?.zoom, siteMap?.viewLat, siteMap?.viewLng, siteMap?.lat, siteMap?.lng, siteMap?.towers, siteMap?.mapLocked]);

  useEffect(() => {
    towersRef.current = normalizeSiteMap(siteMap).towers;
  }, [siteMap]);

  if (!siteMapHasLayout(siteMap)) return null;

  const fillParent = height === "100%";
  const mapWidth = Number.isFinite(Number(fixedWidth)) ? Number(fixedWidth) : "100%";

  return (
    <div
      style={{
        position: "relative",
        width: mapWidth,
        height: fillParent ? "100%" : undefined,
      }}
    >
      <div
        ref={elRef}
        style={{
          width: mapWidth,
          height: fillParent ? "100%" : height,
          borderRadius: fixedWidth ? 0 : 8,
          overflow: "hidden",
          border: fixedWidth || fillParent ? "none" : "1px solid #DDE2E8",
          background: "#1a1a1a",
          pointerEvents: "none",
        }}
      />
      <style>{`
        .janta-tower-icon, .janta-site-pin { background: transparent !important; border: none !important; }
        .janta-compass-control .janta-compass,
        .janta-compass-control .janta-compass svg { transform: none !important; }
        .leaflet-control-attribution { display: none !important; }
      `}</style>
    </div>
  );
}
