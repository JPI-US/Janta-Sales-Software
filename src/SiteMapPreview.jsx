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
  SITE_LOCK_MIN_ZOOM,
  SITE_LOCK_PAD_METERS,
  SITE_LOCK_ZOOM,
  SITE_MAP_MAX_ZOOM,
  SITE_MAP_NATIVE_ZOOM,
  siteLockBounds,
  sitePinHtml,
  towerIconHtml,
  updateTowerIconElement,
} from "./siteMapMarkers.js";
import { towersLatLngBounds } from "./siteMapLayout.js";

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

function applyInitialView(map, current) {
  const towerBounds = towersLatLngBounds(current.towers, 45);
  const bounds = L.latLngBounds(
    towerBounds || siteLockBounds(current.lat, current.lng, SITE_LOCK_PAD_METERS)
  );
  const savedZoom = Number(current.zoom);

  // Shared zoom from System / proposal section.
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
        [current.lat, current.lng],
        Math.min(SITE_MAP_MAX_ZOOM, savedZoom),
        { animate: false }
      );
    }
    return;
  }

  if (towerBounds) {
    map.setMinZoom(14);
    map.fitBounds(bounds, { animate: false, padding: [24, 24], maxZoom: SITE_LOCK_ZOOM });
  } else if (current.mapLocked !== false) {
    map.setMaxBounds(bounds.pad(0.02));
    map.setMinZoom(SITE_LOCK_MIN_ZOOM);
    map.setView([current.lat, current.lng], SITE_LOCK_ZOOM, { animate: false });
  } else {
    map.setView(
      [current.lat, current.lng],
      Math.min(SITE_MAP_MAX_ZOOM, current.zoom || SITE_LOCK_ZOOM)
    );
  }
}

/**
 * Proposal site map preview.
 * - interactive=false: mirrors shared zoom (no +/-)
 * - interactive=true: +/- updates shared siteMap.zoom for all maps
 */
export default function SiteMapPreview({
  siteMap,
  height = 280,
  interactive = false,
  onZoomChange,
}) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const towersRef = useRef([]);
  const applyingSharedZoomRef = useRef(false);
  const onZoomChangeRef = useRef(onZoomChange);
  onZoomChangeRef.current = onZoomChange;

  const sm = normalizeSiteMap(siteMap);
  const layoutKey = useMemo(() => {
    if (!siteMapHasLayout(sm)) return "";
    return JSON.stringify({
      lat: sm.lat,
      lng: sm.lng,
      locked: sm.mapLocked !== false,
      interactive: Boolean(interactive),
      towers: sm.towers.map((t) => [t.id, t.lat, t.lng, t.rotationDeg]),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteMap?.lat, siteMap?.lng, siteMap?.mapLocked, siteMap?.towers, interactive]);

  useEffect(() => {
    if (!layoutKey || !elRef.current) return undefined;

    const current = normalizeSiteMap(siteMap);
    towersRef.current = current.towers;
    const map = L.map(elRef.current, {
      preferCanvas: true,
      zoomControl: false,
      attributionControl: false,
      dragging: interactive,
      scrollWheelZoom: interactive,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: interactive,
      maxZoom: SITE_MAP_MAX_ZOOM,
      zoomSnap: interactive ? 0 : 1,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 120,
      markerZoomAnimation: false,
    });
    L.tileLayer(ESRI_WORLD_IMAGERY_URL, {
      attribution: "",
      maxZoom: SITE_MAP_MAX_ZOOM,
      maxNativeZoom: SITE_MAP_NATIVE_ZOOM,
      crossOrigin: true,
    }).addTo(map);
    addCompassControl(map, "topright");

    applyInitialView(map, current);

    L.marker([current.lat, current.lng], {
      icon: sitePinIcon(),
      interactive: false,
      keyboard: false,
      zIndexOffset: 800,
    }).addTo(map);

    const refreshTowerIcons = () => {
      const z = map.getZoom();
      const towers = towersRef.current;
      const count = towers.length;

      // First paint or tower-set change: rebuild markers.
      if (markersRef.current.length !== towers.filter((t) => t.lat != null && t.lng != null).length) {
        markersRef.current.forEach((m) => m.remove());
        markersRef.current = [];
        towers.forEach((tower) => {
          if (tower.lat == null || tower.lng == null) return;
          const marker = L.marker([tower.lat, tower.lng], {
            icon: towerDivIcon(tower, z, count),
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

    let onZoomEnd = null;
    if (interactive) {
      onZoomEnd = () => {
        refreshTowerIcons();
        if (applyingSharedZoomRef.current) return;
        const z = map.getZoom();
        if (typeof onZoomChangeRef.current === "function") {
          onZoomChangeRef.current(z);
        }
      };
      map.on("zoomend", onZoomEnd);
    }

    mapRef.current = map;
    map._jantaRefreshTowers = refreshTowerIcons;
    requestAnimationFrame(() => map.invalidateSize(true));

    return () => {
      if (onZoomEnd) map.off("zoomend", onZoomEnd);
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey]);

  // Keep this map's zoom linked to shared siteMap.zoom.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const z = Number(normalizeSiteMap(siteMap).zoom);
    if (!Number.isFinite(z)) return;
    if (Math.abs(map.getZoom() - z) < 0.05) return;
    applyingSharedZoomRef.current = true;
    map.setZoom(z, { animate: false });
    if (typeof map._jantaRefreshTowers === "function") map._jantaRefreshTowers();
    requestAnimationFrame(() => {
      applyingSharedZoomRef.current = false;
    });
  }, [siteMap?.zoom]);

  useEffect(() => {
    towersRef.current = normalizeSiteMap(siteMap).towers;
  }, [siteMap]);

  if (!siteMapHasLayout(siteMap)) return null;

  return (
    <div style={{ position: "relative" }}>
      <div
        ref={elRef}
        style={{
          width: "100%",
          height,
          borderRadius: 8,
          overflow: "hidden",
          border: "1px solid #DDE2E8",
          background: "#1a1a1a",
        }}
      />
      <style>{`
        .janta-tower-icon, .janta-site-pin { background: transparent !important; border: none !important; }
        .leaflet-control-attribution { display: none !important; }
      `}</style>
    </div>
  );
}
