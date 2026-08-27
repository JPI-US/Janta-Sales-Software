import { useEffect, useId, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  ESRI_WORLD_IMAGERY_URL,
  createEmptySiteMap,
  createTower,
  normalizeSiteMap,
} from "./siteMapModel.js";
import { addCompassControl } from "./siteMapCompass.js";
import {
  DEFAULT_TOWER_ROTATION_DEG,
  siteLockBounds,
  SITE_LOCK_MIN_ZOOM,
  SITE_LOCK_PAD_METERS,
  SITE_LOCK_ZOOM,
  SITE_MAP_MAX_ZOOM,
  SITE_MAP_NATIVE_ZOOM,
  sitePinHtml,
  TOWER_LENGTH_FT,
  TOWER_WIDTH_FT,
  towerIconDetail,
  towerIconHtml,
  towerIconMetrics,
  updateTowerIconElement,
} from "./siteMapMarkers.js";
import {
  buildTowerGrid,
  canAutoLayoutCount,
  findOpenSnapSlot,
  KW_PER_TOWER,
  MIN_TOWER_SEPARATION_FT,
  movesRespectMinSeparation,
  redistributeEvenly,
  snapLatLng,
  suggestColumns,
  suggestRows,
  SNAP_GRID_FT,
  TOWER_SPACING_FT,
  towersLatLngBounds,
  towersNeededForKw,
} from "./siteMapLayout.js";
import { geocodeSiteAddress, parseLatLngQuery, simplifyAddressLabel, suggestSiteAddresses } from "./siteMapGeocode.js";
import { applySiteMapCamera } from "./siteMapCamera.js";
import { TOWER_RADIUS_STYLE, TOWER_ROTATION_RADIUS_M, ensureRadiiPane } from "./siteMapRadii.js";

const C = {
  navy: "#2F3B4C",
  gold: "#F3B664",
  white: "#FFFFFF",
  cream: "#F9FAFB",
  g100: "#ECEEF1",
  g200: "#DDE2E8",
  g300: "#C7CFD8",
  g500: "#6F8096",
  g700: "#354356",
  green: "#2A9D8F",
  red: "#F55A5A",
};

const fontSans = "'Inter', system-ui, -apple-system, sans-serif";

function towerDivIcon(tower, zoom, selected, towerCount = 0) {
  const { html, wPx, hPx, iconAnchor } = towerIconHtml(tower, zoom, selected, {
    towerCount,
  });
  return L.divIcon({
    className: "janta-tower-icon",
    html,
    iconSize: [wPx, hPx],
    iconAnchor: iconAnchor || [wPx / 2, hPx / 2],
  });
}

/** Prefer in-place DOM resize over setIcon (setIcon reparses HTML for every tower). */
function applyTowerVisual(marker, tower, zoom, selected, towerCount) {
  const el = marker.getElement?.();
  if (el) {
    const updated = updateTowerIconElement(el, tower, zoom, selected, { towerCount });
    if (updated) {
      // Keep Leaflet's icon wrapper size/anchor in sync (otherwise zoom drifts).
      el.style.width = `${updated.wPx}px`;
      el.style.height = `${updated.hPx}px`;
      el.style.marginLeft = `${-updated.iconAnchor[0]}px`;
      el.style.marginTop = `${-updated.iconAnchor[1]}px`;
      const icon = marker.options.icon;
      if (icon) {
        icon.options.iconSize = [updated.wPx, updated.hPx];
        icon.options.iconAnchor = updated.iconAnchor;
      }
      return true;
    }
  }
  marker.setIcon(towerDivIcon(tower, zoom, selected, towerCount));
  return false;
}

function sitePinIcon() {
  return L.divIcon({
    className: "janta-site-pin",
    html: sitePinHtml(),
    iconSize: [28, 36],
    iconAnchor: [14, 36],
  });
}

function mapToolBtn() {
  return {
    width: 36,
    height: 36,
    borderRadius: 8,
    border: "1px solid #DDE2E8",
    background: "#FFFFFF",
    color: "#2F3B4C",
    boxShadow: "0 2px 8px rgba(0,0,0,0.28)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    padding: 0,
  };
}

/**
 * Site map editor — writes plain data into `siteMap` via onChange (single source of truth).
 * Most tooling lives as overlays inside the map frame.
 */
export default function SiteMapEditor({
  siteMap,
  onChange,
  defaultAddress = "",
  knownLat = null,
  knownLng = null,
  projectKw = 0,
  colors = C,
  titleColor,
}) {
  const palette = colors || C;
  const headingColor = titleColor || palette.navy;
  const mapDomId = useId().replace(/:/g, "");
  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map());
  const pinRef = useRef(null);
  const rotationCirclesRef = useRef(new Map());
  const lockedMinZoomRef = useRef(null);
  const siteMapRef = useRef(siteMap);
  const selectedIdsRef = useRef([]);
  const hoveredTowerIdRef = useRef(null);
  const lastCenterKeyRef = useRef("");
  const lastSyncedCustomerAddressRef = useRef("");
  const addressDirtyRef = useRef(false);
  const groupDragRef = useRef(null);
  const boxSelectRef = useRef(null);
  const boxRectElRef = useRef(null);
  const isGroupDraggingRef = useRef(false);
  const justDraggedRef = useRef(false);
  const snapEnabledRef = useRef(true);
  const zoomPersistTimerRef = useRef(null);
  const zoomIconRafRef = useRef(null);
  const lastIconZoomRef = useRef(null);
  const applyingCameraRef = useRef(false);
  /** Ignore moveend/zoomend persist while we programmatically set the camera. */
  const suppressCameraPersistRef = useRef(false);
  const undoStackRef = useRef([]);
  const applyingUndoRef = useRef(false);
  const rotationUndoArmedRef = useRef(false);
  const [undoCount, setUndoCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState([]);
  const [addressDraft, setAddressDraft] = useState(() => siteMap?.address || defaultAddress || "");
  const [finding, setFinding] = useState(false);
  const [findError, setFindError] = useState("");
  const [autoOpen, setAutoOpen] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestHighlight, setSuggestHighlight] = useState(-1);
  const suggestAbortRef = useRef(null);
  const suggestTimerRef = useRef(null);
  const addressWrapRef = useRef(null);
  const skipSuggestRef = useRef(false);

  const neededCount = towersNeededForKw(projectKw);
  const autoLayoutAllowed = canAutoLayoutCount(neededCount);
  const [autoCols, setAutoCols] = useState(() => suggestColumns(neededCount || 4));
  const [autoRows, setAutoRows] = useState(() => suggestRows(neededCount || 4, suggestColumns(neededCount || 4)));

  siteMapRef.current = siteMap;
  selectedIdsRef.current = selectedIds;
  snapEnabledRef.current = snapEnabled;

  const normalized = normalizeSiteMap(siteMap);
  const mapLocked = normalized.mapLocked === true;
  const towerCount = normalized.towers.length;
  const groupRotation =
    towerCount > 0
      ? Math.round(
          normalized.towers.reduce((s, t) => s + (Number(t.rotationDeg) || 0), 0) / towerCount
        )
      : DEFAULT_TOWER_ROTATION_DEG;

  useEffect(() => {
    if (neededCount > 0) {
      const cols = suggestColumns(neededCount);
      setAutoCols(cols);
      setAutoRows(suggestRows(neededCount, cols));
    }
    if (!canAutoLayoutCount(neededCount)) setAutoOpen(false);
  }, [neededCount]);

  const patch = (updater, { recordUndo = false } = {}) => {
    if (recordUndo && !applyingUndoRef.current) pushUndoSnapshot();
    const prev = normalizeSiteMap(siteMapRef.current);
    const next = typeof updater === "function" ? updater(prev) : { ...prev, ...updater };
    const normalized = { ...normalizeSiteMap(next), bakedImageDataUrl: null };
    siteMapRef.current = normalized;
    onChange(normalized);
  };

  function cloneSiteMapSnapshot(sm = normalizeSiteMap(siteMapRef.current)) {
    const n = normalizeSiteMap(sm);
    return {
      address: n.address,
      lat: n.lat,
      lng: n.lng,
      viewLat: n.viewLat,
      viewLng: n.viewLng,
      zoom: n.zoom,
      mapLocked: n.mapLocked,
      towers: (n.towers || []).map((t) => ({ ...t })),
    };
  }

  function pushUndoSnapshot() {
    const snap = cloneSiteMapSnapshot();
    undoStackRef.current.push(snap);
    if (undoStackRef.current.length > 50) undoStackRef.current.shift();
    setUndoCount(undoStackRef.current.length);
  }

  function undoLast() {
    const prev = undoStackRef.current.pop();
    if (!prev) return;
    setUndoCount(undoStackRef.current.length);
    applyingUndoRef.current = true;
    const next = {
      ...normalizeSiteMap(siteMapRef.current),
      ...prev,
      towers: (prev.towers || []).map((t) => ({ ...t })),
      bakedImageDataUrl: null,
    };
    const normalized = normalizeSiteMap(next);
    siteMapRef.current = normalized;
    onChange(normalized);
    const keep = new Set(normalized.towers.map((t) => t.id));
    setSelectedIds((ids) => {
      const filtered = ids.filter((id) => keep.has(id));
      selectedIdsRef.current = filtered;
      return filtered;
    });
    if ((normalized.address || "") !== addressDraft) {
      skipSuggestRef.current = true;
      setAddressDraft(normalized.address || "");
    }
    lastCenterKeyRef.current = "";
    requestAnimationFrame(() => {
      applyingUndoRef.current = false;
      const sm = normalizeSiteMap(siteMapRef.current);
      applyLockMode(sm);
      syncSitePin(sm);
      syncMarkers(sm, selectedIdsRef.current);
    });
  }

  function getSnapOrigin(sm = normalizeSiteMap(siteMapRef.current)) {
    if (sm.lat != null && sm.lng != null) return { lat: sm.lat, lng: sm.lng };
    const first = sm.towers?.find((t) => t.lat != null && t.lng != null);
    if (first) return { lat: first.lat, lng: first.lng };
    return null;
  }

  function applySnap(lat, lng) {
    if (!snapEnabledRef.current) return { lat, lng };
    const origin = getSnapOrigin();
    if (!origin) return { lat, lng };
    return snapLatLng(lat, lng, origin.lat, origin.lng, SNAP_GRID_FT, SNAP_GRID_FT);
  }

  function applyMarkerPositions(positions) {
    positions.forEach((pos, tid) => {
      const m = markersRef.current.get(tid);
      if (m && pos) m.setLatLng([pos.lat, pos.lng]);
      const circle = rotationCirclesRef.current.get(tid);
      if (circle && pos) circle.setLatLng([pos.lat, pos.lng]);
    });
  }

  /** Build proposed group positions from a snapped driver lat/lng; null if too close. */
  function proposedGroupMoves(gd, driverLat, driverLng) {
    const startDriver = gd.starts[gd.driverId] || { lat: gd.originLat, lng: gd.originLng };
    const dLat = driverLat - startDriver.lat;
    const dLng = driverLng - startDriver.lng;
    const moves = new Map();
    gd.ids.forEach((tid) => {
      const start = gd.starts[tid];
      if (!start) return;
      moves.set(tid, { lat: start.lat + dLat, lng: start.lng + dLng });
    });
    const sm = normalizeSiteMap(siteMapRef.current);
    if (!movesRespectMinSeparation(sm.towers, moves, MIN_TOWER_SEPARATION_FT)) return null;
    return moves;
  }

  function refreshTowerIcons(force = false) {
    const map = mapRef.current;
    if (!map || isGroupDraggingRef.current) return;
    const zoom = map.getZoom();
    if (
      !force &&
      lastIconZoomRef.current != null &&
      Math.abs(lastIconZoomRef.current - zoom) < 0.06
    ) {
      return;
    }
    lastIconZoomRef.current = zoom;
    const sm = normalizeSiteMap(siteMapRef.current);
    const selected = new Set(selectedIdsRef.current);
    const towerCount = sm.towers.length;
    sm.towers.forEach((tower) => {
      if (tower.lat == null || tower.lng == null) return;
      const marker = markersRef.current.get(tower.id);
      if (!marker) return;
      applyTowerVisual(marker, tower, zoom, selected.has(tower.id), towerCount);
      marker._jantaZoom = zoom;
      marker._jantaSel = selected.has(tower.id);
      marker._jantaRot = Number(tower.rotationDeg);
      marker._jantaCount = towerCount;
      marker._jantaDetail = towerIconDetail(
        towerCount,
        towerIconMetrics(tower, zoom).wPx
      );
    });
  }

  function syncSitePin(sm) {
    const map = mapRef.current;
    if (!map) return;
    if (sm.lat == null || sm.lng == null) {
      if (pinRef.current) {
        pinRef.current.remove();
        pinRef.current = null;
      }
      return;
    }
    if (!pinRef.current) {
      const marker = L.marker([sm.lat, sm.lng], {
        icon: sitePinIcon(),
        draggable: true,
        autoPan: true,
        keyboard: false,
        zIndexOffset: 800,
      }).addTo(map);
      marker.on("dragstart", () => {
        justDraggedRef.current = true;
      });
      marker.on("dragend", () => {
        const ll = marker.getLatLng();
        patch(
          {
            lat: ll.lat,
            lng: ll.lng,
            // Pin move keeps towers where they are — only relocates the site marker.
          },
          { recordUndo: true }
        );
        lastCenterKeyRef.current = "";
        requestAnimationFrame(() => {
          applyLockMode(normalizeSiteMap({ ...siteMapRef.current, lat: ll.lat, lng: ll.lng }));
        });
        setTimeout(() => {
          justDraggedRef.current = false;
        }, 40);
      });
      pinRef.current = marker;
    } else {
      const cur = pinRef.current.getLatLng();
      if (Math.abs(cur.lat - sm.lat) > 1e-9 || Math.abs(cur.lng - sm.lng) > 1e-9) {
        pinRef.current.setLatLng([sm.lat, sm.lng]);
      }
      if (!pinRef.current.dragging?.enabled()) {
        pinRef.current.dragging?.enable();
      }
    }
  }

  /** Rotation sweep circles — always shown for every placed tower (matches proposal/PDF). */
  function syncRotationCircles(sm) {
    const map = mapRef.current;
    if (!map) return;
    ensureRadiiPane(map);
    const towers = (sm.towers || []).filter((t) => t.lat != null && t.lng != null);
    const radiusM = TOWER_ROTATION_RADIUS_M;
    const keep = new Set();

    towers.forEach((tower) => {
      keep.add(tower.id);
      let circle = rotationCirclesRef.current.get(tower.id);
      if (!circle) {
        circle = L.circle([tower.lat, tower.lng], {
          ...TOWER_RADIUS_STYLE,
          radius: radiusM,
          pane: "jantaRadii",
        }).addTo(map);
        rotationCirclesRef.current.set(tower.id, circle);
      } else {
        circle.setLatLng([tower.lat, tower.lng]);
        circle.setRadius(radiusM);
      }
    });

    rotationCirclesRef.current.forEach((circle, id) => {
      if (keep.has(id)) return;
      circle.remove();
      rotationCirclesRef.current.delete(id);
    });
  }

  function applyLockMode(sm, { forceFit = false } = {}) {
    const map = mapRef.current;
    if (!map || sm.lat == null || sm.lng == null) return;

    if (sm.mapLocked === true) {
      const towerBounds = towersLatLngBounds(sm.towers, 45);
      const bounds = L.latLngBounds(
        towerBounds || siteLockBounds(sm.lat, sm.lng, SITE_LOCK_PAD_METERS)
      );
      map.setMaxBounds(bounds.pad(0.08));
      map.options.maxBoundsViscosity = 1.0;
      const savedZoom = Number(sm.zoom);
      const hasView = Number.isFinite(sm.viewLat) && Number.isFinite(sm.viewLng);
      if (towerBounds) {
        map.setMinZoom(14);
        const preferSaved =
          !forceFit && Number.isFinite(savedZoom) && savedZoom >= 14;
        if (preferSaved && hasView) {
          applyingCameraRef.current = true;
          suppressCameraPersistRef.current = true;
          map.setView(
            [sm.viewLat, sm.viewLng],
            Math.min(SITE_MAP_MAX_ZOOM, savedZoom),
            { animate: false }
          );
          requestAnimationFrame(() => {
            applyingCameraRef.current = false;
            setTimeout(() => {
              suppressCameraPersistRef.current = false;
            }, 50);
          });
        } else if (preferSaved) {
          map.setView(
            [
              (bounds.getSouth() + bounds.getNorth()) / 2,
              (bounds.getWest() + bounds.getEast()) / 2,
            ],
            Math.min(SITE_MAP_MAX_ZOOM, savedZoom),
            { animate: false }
          );
        } else {
          map.fitBounds(bounds, { animate: false, padding: [36, 36], maxZoom: SITE_LOCK_ZOOM });
        }
        const fitted = map.getZoom();
        const minZ = Math.max(14, Math.min(SITE_LOCK_MIN_ZOOM, Math.floor(fitted) - 1));
        map.setMinZoom(minZ);
        lockedMinZoomRef.current = minZ;
      } else {
        map.setMinZoom(SITE_LOCK_MIN_ZOOM);
        lockedMinZoomRef.current = SITE_LOCK_MIN_ZOOM;
        const z = Number.isFinite(savedZoom) && savedZoom >= SITE_LOCK_MIN_ZOOM
          ? Math.min(SITE_MAP_MAX_ZOOM, savedZoom)
          : SITE_LOCK_ZOOM;
        applyingCameraRef.current = true;
        map.setView(
          hasView && !forceFit ? [sm.viewLat, sm.viewLng] : [sm.lat, sm.lng],
          z,
          { animate: false }
        );
        requestAnimationFrame(() => {
          applyingCameraRef.current = false;
        });
      }
    } else {
      map.setMaxBounds(null);
      map.options.maxBoundsViscosity = 0;
      map.setMinZoom(1);
      lockedMinZoomRef.current = null;
      if (!forceFit && Number.isFinite(sm.viewLat) && Number.isFinite(sm.viewLng)) {
        const z = Number(sm.zoom);
        applyingCameraRef.current = true;
        map.setView(
          [sm.viewLat, sm.viewLng],
          Number.isFinite(z) ? Math.min(SITE_MAP_MAX_ZOOM, z) : SITE_LOCK_ZOOM,
          { animate: false }
        );
        requestAnimationFrame(() => {
          applyingCameraRef.current = false;
        });
      }
    }
  }

  function persistCameraQuiet({ zoom, viewLat, viewLng } = {}) {
    if (applyingCameraRef.current || suppressCameraPersistRef.current) return;
    const map = mapRef.current;
    const sm = normalizeSiteMap(siteMapRef.current);
    const center = map?.getCenter?.();
    const nextZ = Math.round(Number(zoom != null ? zoom : map?.getZoom?.()) * 100) / 100;
    const nextLat = Number.isFinite(Number(viewLat))
      ? Number(viewLat)
      : center
        ? Math.round(center.lat * 1e7) / 1e7
        : sm.viewLat;
    const nextLng = Number.isFinite(Number(viewLng))
      ? Number(viewLng)
      : center
        ? Math.round(center.lng * 1e7) / 1e7
        : sm.viewLng;
    if (!Number.isFinite(nextZ) || !Number.isFinite(nextLat) || !Number.isFinite(nextLng)) return;

    const zoomSame = Number.isFinite(sm.zoom) && Math.abs(sm.zoom - nextZ) < 0.02;
    const latSame = Number.isFinite(sm.viewLat) && Math.abs(sm.viewLat - nextLat) < 1e-7;
    const lngSame = Number.isFinite(sm.viewLng) && Math.abs(sm.viewLng - nextLng) < 1e-7;
    if (zoomSame && latSame && lngSame) return;

    // Shared camera for editor + proposal preview + proposal section (+ PDF bake).
    const next = {
      ...sm,
      zoom: nextZ,
      viewLat: nextLat,
      viewLng: nextLng,
      bakedImageDataUrl: null,
    };
    siteMapRef.current = next;
    onChange(next);
  }

  function applyCameraFromState(sm) {
    const map = mapRef.current;
    if (!map) return;
    const z = Number(sm.zoom);
    const vLat = Number(sm.viewLat);
    const vLng = Number(sm.viewLng);
    if (!Number.isFinite(z)) return;

    const center = map.getCenter();
    const zoomSame = Math.abs(map.getZoom() - z) < 0.05;
    const centerSame =
      Number.isFinite(vLat) &&
      Number.isFinite(vLng) &&
      Math.abs(center.lat - vLat) < 1e-5 &&
      Math.abs(center.lng - vLng) < 1e-5;

    if (Number.isFinite(vLat) && Number.isFinite(vLng)) {
      if (zoomSame && centerSame) return;
      applyingCameraRef.current = true;
      suppressCameraPersistRef.current = true;
      map.setView([vLat, vLng], Math.min(SITE_MAP_MAX_ZOOM, z), { animate: false });
      refreshTowerIcons(true);
      requestAnimationFrame(() => {
        applyingCameraRef.current = false;
        // Release after Leaflet finishes moveend from this setView.
        setTimeout(() => {
          suppressCameraPersistRef.current = false;
        }, 50);
      });
      return;
    }

    if (zoomSame) return;
    applyingCameraRef.current = true;
    suppressCameraPersistRef.current = true;
    map.setZoom(z, { animate: false });
    refreshTowerIcons(true);
    requestAnimationFrame(() => {
      applyingCameraRef.current = false;
      setTimeout(() => {
        suppressCameraPersistRef.current = false;
      }, 50);
    });
  }

  function syncMarkers(sm, selIds) {
    const map = mapRef.current;
    if (!map) return;
    // Never rewrite markers mid-drag — setIcon kills Leaflet's drag handler.
    if (isGroupDraggingRef.current) return;

    const zoom = map.getZoom();
    const keep = new Set();
    const selected = new Set(selIds || []);
    const towerCount = sm.towers.length;

    sm.towers.forEach((tower) => {
      if (tower.lat == null || tower.lng == null) return;
      keep.add(tower.id);
      let marker = markersRef.current.get(tower.id);
      const isSel = selected.has(tower.id);
      // Recreate markers that predate the dedicated tower pane (or lost their icon DOM).
      if (marker && (marker.options.pane !== "jantaTowers" || !marker.getElement()?.querySelector?.(".janta-tower-body svg"))) {
        marker.remove();
        markersRef.current.delete(tower.id);
        marker = null;
      }
      if (!marker) {
        const icon = towerDivIcon(tower, zoom, isSel, towerCount);
        marker = L.marker([tower.lat, tower.lng], {
          icon,
          pane: "jantaTowers",
          draggable: true,
          autoPan: false,
          zIndexOffset: isSel ? 900 : 600,
        });
        marker.on("mousedown", (e) => {
          // Update selection ref only — never setState here (setIcon breaks drags).
          const id = tower.id;
          const multi =
            e.originalEvent?.shiftKey ||
            e.originalEvent?.metaKey ||
            e.originalEvent?.ctrlKey;
          const cur = selectedIdsRef.current;
          if (multi) {
            if (!cur.includes(id)) selectedIdsRef.current = [...cur, id];
          } else if (!cur.includes(id)) {
            selectedIdsRef.current = [id];
          }
          // Already selected → keep the full group for multi-drag.
        });
        marker.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          if (justDraggedRef.current) {
            justDraggedRef.current = false;
            setSelectedIds([...selectedIdsRef.current]);
            return;
          }
          const id = tower.id;
          const multi =
            e.originalEvent?.shiftKey ||
            e.originalEvent?.metaKey ||
            e.originalEvent?.ctrlKey;
          if (multi) {
            setSelectedIds((prev) => {
              const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
              selectedIdsRef.current = next;
              return next;
            });
            return;
          }
          if (selectedIdsRef.current.includes(id) && selectedIdsRef.current.length > 1) {
            // Keep multi-selection when clicking a member (PowerPoint-style).
            setSelectedIds([...selectedIdsRef.current]);
            return;
          }
          selectedIdsRef.current = [id];
          setSelectedIds([id]);
        });
        marker.on("dragstart", (e) => {
          justDraggedRef.current = true;
          isGroupDraggingRef.current = true;
          const id = tower.id;
          let ids = selectedIdsRef.current.includes(id)
            ? [...selectedIdsRef.current]
            : [id];
          selectedIdsRef.current = ids;
          const starts = {};
          ids.forEach((tid) => {
            const m = markersRef.current.get(tid);
            if (m) {
              const ll = m.getLatLng();
              starts[tid] = { lat: ll.lat, lng: ll.lng };
            }
          });
          const origin = e.target.getLatLng();
          groupDragRef.current = {
            driverId: id,
            ids,
            starts,
            originLat: origin.lat,
            originLng: origin.lng,
            lastGood: new Map(Object.entries(starts).map(([k, v]) => [k, { ...v }])),
          };
        });
        marker.on("drag", (e) => {
          const gd = groupDragRef.current;
          if (!gd || gd.driverId !== tower.id) return;
          let now = e.target.getLatLng();
          if (snapEnabledRef.current) {
            const snapped = applySnap(now.lat, now.lng);
            now = snapped;
          }
          const moves = proposedGroupMoves(gd, now.lat, now.lng);
          if (moves) {
            gd.lastGood = moves;
            applyMarkerPositions(moves);
          } else if (gd.lastGood) {
            applyMarkerPositions(gd.lastGood);
          }
        });
        marker.on("dragend", (e) => {
          const gd = groupDragRef.current;
          groupDragRef.current = null;
          const finish = () => {
            isGroupDraggingRef.current = false;
            const sm = normalizeSiteMap(siteMapRef.current);
            syncMarkers(sm, selectedIdsRef.current);
            syncRotationCircles(sm);
          };
          if (!gd || gd.driverId !== tower.id) {
            finish();
            return;
          }
          let now = e.target.getLatLng();
          if (snapEnabledRef.current) now = applySnap(now.lat, now.lng);
          let moves = proposedGroupMoves(gd, now.lat, now.lng);
          if (!moves) moves = gd.lastGood || new Map(Object.entries(gd.starts).map(([k, v]) => [k, { ...v }]));
          applyMarkerPositions(moves);
          patch((prev) => ({
            ...prev,
            towers: prev.towers.map((t) => {
              const m = moves.get(t.id);
              return m ? { ...t, lat: m.lat, lng: m.lng } : t;
            }),
          }), { recordUndo: true });
          finish();
        });
        marker.on("mouseover", () => {
          hoveredTowerIdRef.current = tower.id;
        });
        marker.on("mouseout", () => {
          if (hoveredTowerIdRef.current === tower.id) hoveredTowerIdRef.current = null;
        });
        marker.addTo(map);
        markersRef.current.set(tower.id, marker);
        marker._jantaSel = isSel;
        marker._jantaZoom = zoom;
        marker._jantaRot = Number(tower.rotationDeg);
        marker._jantaCount = towerCount;
        marker._jantaDetail = towerIconDetail(
          towerCount,
          towerIconMetrics(tower, zoom).wPx
        );
      } else {
        const ll = marker.getLatLng();
        if (ll.lat !== tower.lat || ll.lng !== tower.lng) {
          marker.setLatLng([tower.lat, tower.lng]);
        }
        const rot = Number(tower.rotationDeg);
        const metrics = towerIconMetrics(tower, zoom);
        const detail = towerIconDetail(towerCount, metrics.wPx);
        const zoomChanged =
          marker._jantaZoom == null || Math.abs(marker._jantaZoom - zoom) >= 0.06;
        const selChanged = marker._jantaSel !== isSel;
        const rotChanged = marker._jantaRot !== rot;
        const detailChanged = marker._jantaDetail !== detail;
        if (zoomChanged || selChanged || rotChanged || detailChanged) {
          applyTowerVisual(marker, tower, zoom, isSel, towerCount);
          marker._jantaSel = isSel;
          marker._jantaZoom = zoom;
          marker._jantaRot = rot;
          marker._jantaCount = towerCount;
          marker._jantaDetail = detail;
        }
        marker.setZIndexOffset(isSel ? 900 : 600);
      }
    });

    markersRef.current.forEach((marker, id) => {
      if (!keep.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
        if (hoveredTowerIdRef.current === id) hoveredTowerIdRef.current = null;
      }
    });
  }

  function removeTowersByIds(ids) {
    const list = Array.isArray(ids) ? ids.filter(Boolean) : [];
    if (!list.length) return false;
    const remove = new Set(list);
    patch((prev) => ({
      ...prev,
      towers: prev.towers.filter((t) => !remove.has(t.id)),
    }), { recordUndo: true });
    setSelectedIds((prev) => {
      const next = prev.filter((id) => !remove.has(id));
      selectedIdsRef.current = next;
      return next;
    });
    if (hoveredTowerIdRef.current && remove.has(hoveredTowerIdRef.current)) {
      hoveredTowerIdRef.current = null;
    }
    return true;
  }

  useEffect(() => {
    const isTypingTarget = (el) =>
      el &&
      (el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.tagName === "SELECT" ||
        el.isContentEditable);

    const onKeyDown = (e) => {
      if (isTypingTarget(e.target)) return;

      if ((e.key === "a" || e.key === "A") && (e.metaKey || e.ctrlKey)) {
        const sm = normalizeSiteMap(siteMapRef.current);
        const ids = sm.towers.map((t) => t.id).filter(Boolean);
        if (!ids.length) return;
        e.preventDefault();
        selectedIdsRef.current = ids;
        setSelectedIds(ids);
        return;
      }

      if ((e.key === "z" || e.key === "Z") && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        if (!undoStackRef.current.length) return;
        e.preventDefault();
        undoLast();
        return;
      }

      if (e.key !== "Backspace" && e.key !== "Delete") return;
      const ids = selectedIdsRef.current.length
        ? [...selectedIdsRef.current]
        : hoveredTowerIdRef.current
          ? [hoveredTowerIdRef.current]
          : [];
      if (!ids.length) return;
      e.preventDefault();
      removeTowersByIds(ids);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapElRef.current || mapRef.current) return undefined;
    const map = L.map(mapElRef.current, {
      preferCanvas: true,
      zoomControl: false,
      attributionControl: false,
      doubleClickZoom: false,
      boxZoom: false,
      // Left-drag is for selection; pan with right-drag instead.
      dragging: false,
      maxBoundsViscosity: 1.0,
      maxZoom: SITE_MAP_MAX_ZOOM,
      // Fractional zoom for smoother wheel; icons only rebuild on zoomend
      zoomSnap: 0,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 120,
      wheelDebounceTime: 40,
      zoomAnimation: true,
      // DivIcons with real-world size shouldn't CSS-scale mid-zoom (causes jumps)
      markerZoomAnimation: false,
      fadeAnimation: true,
      inertia: true,
    });
    L.tileLayer(ESRI_WORLD_IMAGERY_URL, {
      attribution: "",
      maxZoom: SITE_MAP_MAX_ZOOM,
      maxNativeZoom: SITE_MAP_NATIVE_ZOOM,
      crossOrigin: true,
      updateWhenZooming: false,
      keepBuffer: 2,
    }).addTo(map);
    mapRef.current = map;
    addCompassControl(map, "topright");

    // Radii under towers: canvas overlays must not paint over DivIcon markers.
    ensureRadiiPane(map);
    if (!map.getPane("jantaTowers")) {
      map.createPane("jantaTowers");
      map.getPane("jantaTowers").style.zIndex = 650;
    }
    if (map.getPane("markerPane")) {
      map.getPane("markerPane").style.zIndex = 600;
    }
    if (map.getPane("overlayPane")) {
      map.getPane("overlayPane").style.zIndex = 400;
    }

    const start = normalizeSiteMap(siteMapRef.current);
    if (start.lat != null && start.lng != null) {
      lastCenterKeyRef.current = `${start.lat},${start.lng}`;
      if (start.mapLocked === true) applyLockMode(start);
      else applySiteMapCamera(map, start);
      syncSitePin(start);
      syncMarkers(start, []);
      // Seed shared camera if this session never saved a view yet.
      if (!Number.isFinite(start.viewLat) || !Number.isFinite(start.viewLng)) {
        requestAnimationFrame(() => persistCameraQuiet());
      }
    } else {
      map.setView([39.8283, -98.5795], 4);
    }

    const onZoomStart = () => {
      // Freeze icon rebuilds while the camera moves — prevents tower "jumps"
      if (zoomIconRafRef.current != null) {
        cancelAnimationFrame(zoomIconRafRef.current);
        zoomIconRafRef.current = null;
      }
    };

    const onZoomEnd = () => {
      if (zoomIconRafRef.current != null) {
        cancelAnimationFrame(zoomIconRafRef.current);
        zoomIconRafRef.current = null;
      }
      // One rebuild after zoom settles, sized to the final zoom
      zoomIconRafRef.current = requestAnimationFrame(() => {
        zoomIconRafRef.current = null;
        refreshTowerIcons(true);
      });
      const z = map.getZoom();
      if (zoomPersistTimerRef.current) clearTimeout(zoomPersistTimerRef.current);
      zoomPersistTimerRef.current = setTimeout(() => {
        if (suppressCameraPersistRef.current || applyingCameraRef.current) return;
        persistCameraQuiet({ zoom: z });
      }, 280);
    };

    map.on("zoomstart", onZoomStart);
    map.on("zoomend", onZoomEnd);

    const container = map.getContainer();
    container.style.cursor = "default";
    const rightPanRef = { active: false, x: 0, y: 0 };
    let suppressMapClick = false;

    const onMoveEnd = () => {
      // Skip while right-pan is mid-gesture — wait for mouseup to settle.
      if (rightPanRef.active) return;
      if (isGroupDraggingRef.current) return;
      if (applyingCameraRef.current || suppressCameraPersistRef.current) return;
      if (zoomPersistTimerRef.current) clearTimeout(zoomPersistTimerRef.current);
      zoomPersistTimerRef.current = setTimeout(() => persistCameraQuiet(), 180);
    };
    map.on("moveend", onMoveEnd);

    const onContextMenu = (e) => {
      e.preventDefault();
    };

    const onRightPanDown = (e) => {
      if (e.button !== 2) return;
      e.preventDefault();
      rightPanRef.active = true;
      rightPanRef.x = e.clientX;
      rightPanRef.y = e.clientY;
      container.style.cursor = "grabbing";
    };

    const onRightPanMove = (e) => {
      if (!rightPanRef.active) return;
      const dx = e.clientX - rightPanRef.x;
      const dy = e.clientY - rightPanRef.y;
      rightPanRef.x = e.clientX;
      rightPanRef.y = e.clientY;
      map.panBy([-dx, -dy], { animate: false });
    };

    const onRightPanUp = () => {
      if (!rightPanRef.active) return;
      rightPanRef.active = false;
      container.style.cursor = "default";
      if (zoomPersistTimerRef.current) clearTimeout(zoomPersistTimerRef.current);
      zoomPersistTimerRef.current = setTimeout(() => persistCameraQuiet(), 80);
    };

    container.addEventListener("contextmenu", onContextMenu);
    container.addEventListener("mousedown", onRightPanDown);
    window.addEventListener("mousemove", onRightPanMove);
    window.addEventListener("mouseup", onRightPanUp);

    const ensureBoxEl = () => {
      if (boxRectElRef.current) return boxRectElRef.current;
      const el = document.createElement("div");
      el.className = "janta-box-select";
      Object.assign(el.style, {
        position: "absolute",
        border: "1.5px dashed #C9933E",
        background: "rgba(201,147,62,0.15)",
        pointerEvents: "none",
        zIndex: 650,
        display: "none",
      });
      map.getContainer().appendChild(el);
      boxRectElRef.current = el;
      return el;
    };

    const onMouseDown = (e) => {
      // Left-drag on empty map = marquee select. Right-drag pans.
      if (e.originalEvent?.button !== 0) return;
      if (e.originalEvent.target?.closest?.(".leaflet-marker-icon")) return;
      L.DomEvent.preventDefault(e);
      const startPt = e.containerPoint;
      boxSelectRef.current = {
        startPt,
        startLatLng: e.latlng,
        additive: Boolean(
          e.originalEvent?.shiftKey || e.originalEvent?.metaKey || e.originalEvent?.ctrlKey
        ),
      };
      const box = ensureBoxEl();
      box.style.display = "block";
      box.style.left = `${startPt.x}px`;
      box.style.top = `${startPt.y}px`;
      box.style.width = "0px";
      box.style.height = "0px";
    };

    const onMouseMove = (e) => {
      const bs = boxSelectRef.current;
      if (!bs) return;
      const cur = e.containerPoint;
      const x = Math.min(bs.startPt.x, cur.x);
      const y = Math.min(bs.startPt.y, cur.y);
      const w = Math.abs(cur.x - bs.startPt.x);
      const h = Math.abs(cur.y - bs.startPt.y);
      const box = ensureBoxEl();
      box.style.left = `${x}px`;
      box.style.top = `${y}px`;
      box.style.width = `${w}px`;
      box.style.height = `${h}px`;
    };

    const onMouseUp = (e) => {
      const bs = boxSelectRef.current;
      if (!bs) return;
      boxSelectRef.current = null;
      if (boxRectElRef.current) boxRectElRef.current.style.display = "none";

      const endPt = e.containerPoint;
      const minX = Math.min(bs.startPt.x, endPt.x);
      const maxX = Math.max(bs.startPt.x, endPt.x);
      const minY = Math.min(bs.startPt.y, endPt.y);
      const maxY = Math.max(bs.startPt.y, endPt.y);
      if (maxX - minX < 4 && maxY - minY < 4) return;

      // Marquee just finished — ignore the synthetic click that would clear selection.
      suppressMapClick = true;

      const sm = normalizeSiteMap(siteMapRef.current);
      const hit = [];
      sm.towers.forEach((t) => {
        if (t.lat == null || t.lng == null) return;
        const pt = map.latLngToContainerPoint([t.lat, t.lng]);
        if (pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY) hit.push(t.id);
      });
      setSelectedIds((prev) => {
        const next = bs.additive ? [...new Set([...prev, ...hit])] : hit;
        selectedIdsRef.current = next;
        return next;
      });
    };

    map.on("mousedown", onMouseDown);
    map.on("mousemove", onMouseMove);
    map.on("mouseup", onMouseUp);
    map.on("click", (e) => {
      if (suppressMapClick) {
        suppressMapClick = false;
        return;
      }
      if (e.originalEvent?.button !== 0) return;
      if (e.originalEvent?.shiftKey) return;
      if (e.originalEvent?.target?.closest?.(".leaflet-marker-icon")) return;
      selectedIdsRef.current = [];
      setSelectedIds([]);
    });

    return () => {
      map.off("zoomstart", onZoomStart);
      map.off("zoomend", onZoomEnd);
      map.off("moveend", onMoveEnd);
      map.off("mousedown", onMouseDown);
      map.off("mousemove", onMouseMove);
      map.off("mouseup", onMouseUp);
      container.removeEventListener("contextmenu", onContextMenu);
      container.removeEventListener("mousedown", onRightPanDown);
      window.removeEventListener("mousemove", onRightPanMove);
      window.removeEventListener("mouseup", onRightPanUp);
      if (zoomPersistTimerRef.current) clearTimeout(zoomPersistTimerRef.current);
      if (zoomIconRafRef.current != null) cancelAnimationFrame(zoomIconRafRef.current);
      if (boxRectElRef.current) {
        boxRectElRef.current.remove();
        boxRectElRef.current = null;
      }
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      rotationCirclesRef.current.forEach((c) => c.remove());
      rotationCirclesRef.current.clear();
      if (pinRef.current) {
        pinRef.current.remove();
        pinRef.current = null;
      }
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const sm = normalizeSiteMap(siteMap);
    const map = mapRef.current;
    if (!map) return;

    if (sm.lat != null && sm.lng != null) {
      const key = `${sm.lat},${sm.lng}|${sm.mapLocked === true}|${sm.towers.length}`;
      if (key !== lastCenterKeyRef.current) {
        lastCenterKeyRef.current = key;
        applyLockMode(sm);
        // When unlocking, keep the current view — do not snap back to the site pin
        // (that felt like reverting the address / location).
      } else if (sm.mapLocked === true) {
        const towerBounds = towersLatLngBounds(sm.towers, 45);
        const bounds = L.latLngBounds(
          towerBounds || siteLockBounds(sm.lat, sm.lng, SITE_LOCK_PAD_METERS)
        );
        map.setMaxBounds(bounds.pad(0.02));
      }
    }

    const alive = new Set(sm.towers.map((t) => t.id));
    setSelectedIds((prev) => {
      const next = prev.filter((id) => alive.has(id));
      if (next.length === prev.length && next.every((id, i) => id === prev[i])) return prev;
      return next;
    });

    syncSitePin(sm);
    syncMarkers(sm, selectedIdsRef.current);
    syncRotationCircles(sm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteMap]);

  useEffect(() => {
    const sm = normalizeSiteMap(siteMapRef.current);
    syncMarkers(sm, selectedIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds]);

  // Keep editor camera linked to shared siteMap view (proposal section / preview / undo).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || isGroupDraggingRef.current) return;
    applyCameraFromState(normalizeSiteMap(siteMap));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteMap?.zoom, siteMap?.viewLat, siteMap?.viewLng]);

  useEffect(() => {
    const next = String(defaultAddress || "").trim();
    if (!next) return;

    // Once the user edits the field (or picks a different suggestion), stop overwriting.
    if (addressDirtyRef.current) return;

    const sm = normalizeSiteMap(siteMapRef.current);
    // If the site map already has an address, lock/unlock and other updates must not
    // replace it with the page-1 / SAM defaultAddress.
    if ((sm.address || "").trim()) return;

    const prevSynced = lastSyncedCustomerAddressRef.current;
    if (next === prevSynced && addressDraft.trim() === next) return;

    lastSyncedCustomerAddressRef.current = next;
    skipSuggestRef.current = true;
    setAddressDraft(next);
    if ((sm.address || "").trim() !== next) {
      onChange({
        ...sm,
        address: next,
        bakedImageDataUrl: sm.bakedImageDataUrl,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultAddress]);

  function applyGeocodeHit(hit, fallbackLabel = "") {
    if (!hit || !Number.isFinite(hit.lat) || !Number.isFinite(hit.lng)) {
      setFindError("Could not place that address on the map.");
      return;
    }
    const prev = normalizeSiteMap(siteMapRef.current);
    const label =
      simplifyAddressLabel(hit.displayName || fallbackLabel || addressDraft.trim()) ||
      hit.displayName ||
      fallbackLabel ||
      addressDraft.trim();
    skipSuggestRef.current = true;
    addressDirtyRef.current = true; // keep user/geocode choice; don't overwrite from page-1 address
    setAddressDraft(label);
    setAddressSuggestions([]);
    setSuggestOpen(false);
    setSuggestHighlight(-1);
    setFindError("");

    // Relocate existing towers with the pin so changing address keeps the layout.
    let towers = prev.towers;
    if (
      prev.lat != null &&
      prev.lng != null &&
      towers.length > 0 &&
      (Math.abs(prev.lat - hit.lat) > 1e-8 || Math.abs(prev.lng - hit.lng) > 1e-8)
    ) {
      const dLat = hit.lat - prev.lat;
      const dLng = hit.lng - prev.lng;
      towers = towers.map((t) =>
        t.lat == null || t.lng == null
          ? t
          : { ...t, lat: t.lat + dLat, lng: t.lng + dLng }
      );
    }

    const next = {
      address: label,
      lat: hit.lat,
      lng: hit.lng,
      viewLat: hit.lat,
      viewLng: hit.lng,
      zoom: SITE_LOCK_ZOOM,
      towers,
      // Keep current lock preference — finding an address must not toggle lock.
    };
    patch(next, { recordUndo: true });
    lastCenterKeyRef.current = "";
    requestAnimationFrame(() => {
      const sm = normalizeSiteMap({ ...siteMapRef.current, ...next });
      applyLockMode(sm, { forceFit: true });
      syncSitePin(sm);
      syncMarkers(sm, selectedIdsRef.current);
      syncRotationCircles(sm);
      persistCameraQuiet();
    });
  }

  async function findAddress() {
    const q = addressDraft.trim();
    if (!q) {
      setFindError("Enter an address or coordinates (lat, lng).");
      return;
    }
    // Prefer highlighted / first suggestion if the dropdown is open
    if (suggestOpen && addressSuggestions.length) {
      const idx = suggestHighlight >= 0 ? suggestHighlight : 0;
      applyGeocodeHit(addressSuggestions[idx], q);
      return;
    }
    // Fast path for pasted coordinates
    const coords = parseLatLngQuery(q);
    if (coords) {
      applyGeocodeHit(
        {
          lat: coords.lat,
          lng: coords.lng,
          displayName: `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`,
        },
        q
      );
      return;
    }
    setFinding(true);
    setFindError("");
    setSuggestOpen(false);
    try {
      const hit = await geocodeSiteAddress(q, {
        biasLat: Number.isFinite(Number(knownLat)) ? Number(knownLat) : undefined,
        biasLng: Number.isFinite(Number(knownLng)) ? Number(knownLng) : undefined,
      });
      applyGeocodeHit(hit, q);
    } catch (err) {
      setFindError(err?.message || "Could not find that address.");
    } finally {
      setFinding(false);
    }
  }

  function scheduleAddressSuggest(value) {
    if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current);
    if (suggestAbortRef.current) {
      suggestAbortRef.current.abort();
      suggestAbortRef.current = null;
    }
    const q = value.trim();
    if (q.length < 3) {
      setAddressSuggestions([]);
      setSuggestOpen(false);
      setSuggestLoading(false);
      setSuggestHighlight(-1);
      return;
    }
    setSuggestLoading(true);
    suggestTimerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      suggestAbortRef.current = controller;
      try {
        const hits = await suggestSiteAddresses(q, {
          limit: 7,
          signal: controller.signal,
          biasLat: Number.isFinite(Number(knownLat)) ? Number(knownLat) : undefined,
          biasLng: Number.isFinite(Number(knownLng)) ? Number(knownLng) : undefined,
        });
        if (controller.signal.aborted) return;
        setAddressSuggestions(hits);
        setSuggestOpen(hits.length > 0);
        setSuggestHighlight(hits.length ? 0 : -1);
        if (!hits.length) setFindError("");
      } catch (err) {
        if (err?.name === "AbortError") return;
        setAddressSuggestions([]);
        setSuggestOpen(false);
      } finally {
        if (!controller.signal.aborted) setSuggestLoading(false);
      }
    }, 280);
  }

  useEffect(() => {
    const onDocDown = (e) => {
      if (!addressWrapRef.current) return;
      if (!addressWrapRef.current.contains(e.target)) {
        setSuggestOpen(false);
        setSuggestHighlight(-1);
      }
    };
    document.addEventListener("mousedown", onDocDown);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current);
      if (suggestAbortRef.current) suggestAbortRef.current.abort();
    };
  }, []);

  /** Use already-geocoded proposal coords when Find hasn't succeeded yet. */
  useEffect(() => {
    const sm = normalizeSiteMap(siteMapRef.current);
    if (sm.lat != null && sm.lng != null) return;
    const lat = Number(knownLat);
    const lng = Number(knownLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const next = {
      ...sm,
      address: sm.address || addressDraft || defaultAddress || "",
      lat,
      lng,
      viewLat: lat,
      viewLng: lng,
      zoom: SITE_LOCK_ZOOM,
      bakedImageDataUrl: null,
    };
    siteMapRef.current = next;
    onChange(next);
    lastCenterKeyRef.current = "";
    requestAnimationFrame(() => {
      applyLockMode(normalizeSiteMap(next));
      syncSitePin(normalizeSiteMap(next));
      persistCameraQuiet();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knownLat, knownLng]);

  function evenlySpaceTowers() {
    const sm = normalizeSiteMap(siteMapRef.current);
    if (sm.towers.length < 2) {
      setFindError("Need at least 2 towers to even-space.");
      return;
    }
    const ids = selectedIds.length >= 2 ? selectedIds : null;
    const n = ids ? ids.length : sm.towers.length;
    const cols = suggestColumns(n);
    const towers = redistributeEvenly(sm.towers, {
      ids,
      columns: cols,
      colPitchFt: TOWER_SPACING_FT,
      rowPitchFt: TOWER_SPACING_FT,
      centerLat: sm.lat,
      centerLng: sm.lng,
    });
    patch({ towers }, { recordUndo: true });
    setFindError("");
    lastCenterKeyRef.current = "";
    requestAnimationFrame(() => {
      applyLockMode(normalizeSiteMap({ ...siteMapRef.current, towers }), {
        forceFit: true,
      });
      const map = mapRef.current;
      if (map) persistCameraQuiet();
    });
  }

  function toggleLock() {
    const sm = normalizeSiteMap(siteMapRef.current);
    if (sm.lat == null || sm.lng == null) {
      setFindError("Find an address first.");
      return;
    }
    const nextLocked = !sm.mapLocked;
    // Only toggle map pan bounds — never touch address / lat / lng.
    patch({ mapLocked: nextLocked });
    lastCenterKeyRef.current = "";
    requestAnimationFrame(() => {
      applyLockMode(normalizeSiteMap({ ...siteMapRef.current, mapLocked: nextLocked }));
    });
  }

  function addTower() {
    const map = mapRef.current;
    const sm = normalizeSiteMap(siteMapRef.current);
    if (!map || sm.lat == null || sm.lng == null) {
      setFindError("Find an address on the map first.");
      return;
    }
    if (neededCount > 0 && towerCount >= neededCount) {
      setFindError(`System size supports ${neededCount} tower${neededCount === 1 ? "" : "s"} (${KW_PER_TOWER} kW each). Use auto-layout or clear first.`);
      return;
    }
    const center = map.getCenter();
    const seed = applySnap(center.lat, center.lng);
    const slot = findOpenSnapSlot({
      seedLat: seed.lat,
      seedLng: seed.lng,
      originLat: sm.lat,
      originLng: sm.lng,
      existingTowers: sm.towers,
      snapFt: SNAP_GRID_FT,
      minFt: MIN_TOWER_SEPARATION_FT,
    });
    if (!slot) {
      setFindError(`No open spot with ${MIN_TOWER_SEPARATION_FT} ft clearance near the map center.`);
      return;
    }
    const rot = towerCount > 0 ? groupRotation : DEFAULT_TOWER_ROTATION_DEG;
    const tower = createTower({
      lat: slot.lat,
      lng: slot.lng,
      rotationDeg: rot,
    });
    setFindError("");
    patch((prev) => ({
      ...prev,
      zoom: map.getZoom(),
      towers: [...prev.towers, tower],
    }), { recordUndo: true });
    setSelectedIds([tower.id]);
  }

  function setAllRotations(deg) {
    const r = ((Number(deg) % 360) + 360) % 360;
    if (rotationUndoArmedRef.current) {
      pushUndoSnapshot();
      rotationUndoArmedRef.current = false;
    }
    patch((prev) => ({
      ...prev,
      towers: prev.towers.map((t) => ({ ...t, rotationDeg: r })),
    }));
  }

  function resetAllRotations() {
    pushUndoSnapshot();
    rotationUndoArmedRef.current = false;
    const r = DEFAULT_TOWER_ROTATION_DEG;
    patch((prev) => ({
      ...prev,
      towers: prev.towers.map((t) => ({ ...t, rotationDeg: r })),
    }));
  }

  function clearTowers() {
    if (!towerCount) return;
    const ok = window.confirm(
      `Delete ALL ${towerCount} tower${towerCount === 1 ? "" : "s"} from this site map?`
    );
    if (!ok) return;
    patch({ towers: [] }, { recordUndo: true });
    setSelectedIds([]);
  }

  function deleteSelected() {
    if (!selectedIds.length) return;
    const n = selectedIds.length;
    const ok = window.confirm(
      n === 1
        ? "Delete the selected tower?"
        : `Delete ${n} selected towers?`
    );
    if (!ok) return;
    removeTowersByIds(selectedIds);
  }

  function selectAllTowers() {
    const ids = normalizeSiteMap(siteMapRef.current).towers.map((t) => t.id).filter(Boolean);
    selectedIdsRef.current = ids;
    setSelectedIds(ids);
  }

  function runAutoLayout() {
    const sm = normalizeSiteMap(siteMapRef.current);
    if (sm.lat == null || sm.lng == null) {
      setFindError("Find an address before auto-layout.");
      return;
    }
    if (!canAutoLayoutCount(neededCount)) {
      setFindError("Auto-layout needs a system of 4 towers or more.");
      setAutoOpen(false);
      return;
    }
    const count = neededCount;
    const cols = Math.max(1, Math.min(count, Math.floor(Number(autoCols) || suggestColumns(count))));
    const rows = Math.max(1, Math.ceil(count / cols));
    if (towerCount > 0) {
      const ok = window.confirm(
        `Replace ${towerCount} existing tower${towerCount === 1 ? "" : "s"} with a ${cols}×${rows} grid (${count} towers, ${TOWER_SPACING_FT} ft spacing) for ${Math.round(projectKw * 10) / 10} kW?`
      );
      if (!ok) return;
    }
    const towers = buildTowerGrid({
      lat: sm.lat,
      lng: sm.lng,
      count,
      columns: cols,
      colPitchFt: TOWER_SPACING_FT,
      rowPitchFt: TOWER_SPACING_FT,
      rotationDeg: DEFAULT_TOWER_ROTATION_DEG,
    });
    patch({ towers }, { recordUndo: true });
    setSelectedIds([]);
    setAutoOpen(false);
    setFindError("");
    lastCenterKeyRef.current = "";
    requestAnimationFrame(() => {
      applyLockMode(normalizeSiteMap({ ...siteMapRef.current, towers }), {
        forceFit: true,
      });
      const map = mapRef.current;
      if (map) persistCameraQuiet();
    });
  }

  const hasCoords = normalized.lat != null && normalized.lng != null;
  const btn = (enabled, primary = false) => ({
    padding: "8px 12px",
    background: !enabled ? palette.g300 : primary ? palette.navy : palette.white,
    color: !enabled ? palette.g500 : primary ? "#F8F2E8" : palette.navy,
    border: primary ? "none" : `1px solid ${palette.g200}`,
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    fontFamily: fontSans,
    cursor: enabled ? "pointer" : "default",
  });

  const toolDisabled = !hasCoords;
  const lockColor = mapLocked ? "#C9933E" : "#6F8096";
  const selectedCount = selectedIds.length;
  const atCapacity = neededCount > 0 && towerCount >= neededCount;

  return (
    <div style={{ background: palette.white, borderRadius: 10, padding: "14px 16px", border: `1px solid ${palette.g200}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ width: 4, height: 16, background: palette.gold, borderRadius: 2 }} />
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: headingColor }}>Site map</h3>
        {neededCount > 0 && (
          <span style={{ marginLeft: "auto", fontSize: 11, color: palette.g500, fontFamily: fontSans }}>
            {Math.round(projectKw * 10) / 10} kW · {neededCount} tower{neededCount === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <label style={{ display: "block", color: palette.g500, fontSize: 10, marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: fontSans }}>
        Property address
      </label>
      <div ref={addressWrapRef} style={{ position: "relative", marginBottom: 8 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={addressDraft}
            onChange={(e) => {
              addressDirtyRef.current = true;
              const v = e.target.value;
              setAddressDraft(v);
              setFindError("");
              if (skipSuggestRef.current) {
                skipSuggestRef.current = false;
                return;
              }
              scheduleAddressSuggest(v);
            }}
            onBlur={() => {
              const v = simplifyAddressLabel(addressDraft.trim()) || addressDraft.trim();
              if (v !== addressDraft.trim()) {
                skipSuggestRef.current = true;
                setAddressDraft(v);
              }
              const sm = normalizeSiteMap(siteMapRef.current);
              if ((sm.address || "").trim() === v) return;
              addressDirtyRef.current = true;
              // Persist the typed label without changing map coordinates.
              patch({ address: v });
            }}
            onFocus={() => {
              if (addressSuggestions.length) setSuggestOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" && suggestOpen && addressSuggestions.length) {
                e.preventDefault();
                setSuggestHighlight((i) => Math.min(addressSuggestions.length - 1, (i < 0 ? -1 : i) + 1));
                return;
              }
              if (e.key === "ArrowUp" && suggestOpen && addressSuggestions.length) {
                e.preventDefault();
                setSuggestHighlight((i) => Math.max(0, (i < 0 ? 0 : i) - 1));
                return;
              }
              if (e.key === "Escape") {
                setSuggestOpen(false);
                setSuggestHighlight(-1);
                return;
              }
              if (e.key === "Enter") {
                e.preventDefault();
                findAddress();
              }
            }}
            placeholder="Address or lat, lng…"
            autoComplete="off"
            role="combobox"
            aria-expanded={suggestOpen}
            aria-autocomplete="list"
            style={{
              flex: 1,
              padding: "7px 10px",
              border: `1px solid ${palette.g200}`,
              borderRadius: 5,
              fontSize: 13,
              fontFamily: fontSans,
              color: palette.g700,
              background: palette.cream,
            }}
          />
          <button type="button" onClick={findAddress} disabled={finding || !addressDraft.trim()} style={btn(Boolean(addressDraft.trim()) && !finding, true)}>
            {finding || suggestLoading ? "…" : "Find address"}
          </button>
        </div>
        {suggestOpen && addressSuggestions.length > 0 && (
          <ul
            role="listbox"
            style={{
              listStyle: "none",
              margin: "4px 0 0",
              padding: 4,
              position: "absolute",
              left: 0,
              right: 0,
              top: "100%",
              zIndex: 1200,
              maxHeight: 260,
              overflowY: "auto",
              background: "#fff",
              border: `1px solid ${palette.g200}`,
              borderRadius: 8,
              boxShadow: "0 10px 28px rgba(0,0,0,0.16)",
              fontFamily: fontSans,
            }}
          >
            {addressSuggestions.map((hit, idx) => {
              const active = idx === suggestHighlight;
              return (
                <li key={hit.id || `${hit.lat},${hit.lng},${idx}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onMouseEnter={() => setSuggestHighlight(idx)}
                    onMouseDown={(e) => {
                      // mousedown so selection happens before input blur
                      e.preventDefault();
                      applyGeocodeHit(hit, addressDraft.trim());
                    }}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      border: "none",
                      borderRadius: 6,
                      padding: "8px 10px",
                      cursor: "pointer",
                      background: active ? "#F3F1EC" : "transparent",
                      color: palette.navy,
                      fontFamily: fontSans,
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>
                      {hit.primary || hit.displayName}
                    </div>
                    {(hit.secondary || hit.displayName) && (
                      <div style={{ fontSize: 11, color: palette.g500, marginTop: 2, lineHeight: 1.35 }}>
                        {hit.secondary || hit.displayName}
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {suggestLoading && addressDraft.trim().length >= 3 && !suggestOpen && (
          <div style={{ fontSize: 10, color: palette.g500, fontFamily: fontSans, marginTop: 4 }}>Searching addresses…</div>
        )}
      </div>
      {findError && (
        <div style={{ fontSize: 10, color: palette.red, fontFamily: fontSans, marginBottom: 8 }}>{findError}</div>
      )}
      {neededCount > 0 && towerCount < neededCount && (
        <div style={{ fontSize: 11, color: palette.red, fontFamily: fontSans, marginBottom: 8, fontWeight: 600 }}>
          Place {neededCount} tower{neededCount === 1 ? "" : "s"} for this {Math.round(projectKw * 10) / 10} kW project
          ({towerCount} of {neededCount} on the map). Continue is blocked until the count matches.
        </div>
      )}

      <div style={{ position: "relative", borderRadius: 8, overflow: "hidden", border: `1px solid ${palette.g200}` }}>
        <div
          id={`site-map-${mapDomId}`}
          ref={mapElRef}
          style={{
            width: "100%",
            height: 440,
            background: "#1a1a1a",
          }}
        />

        {/* Map toolbar — horizontal across top */}
        <div
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            right: 52,
            zIndex: 1000,
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            disabled={!undoCount}
            onClick={undoLast}
            title="Undo (Ctrl/Cmd+Z)"
            style={{ ...mapToolBtn(), opacity: undoCount ? 1 : 0.4 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M9 14L4 9l5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M4 9h10.5a5.5 5.5 0 1 1 0 11H12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button
            type="button"
            disabled={toolDisabled}
            onClick={toggleLock}
            title={mapLocked ? "Unlock map" : "Lock map to site"}
            style={{ ...mapToolBtn(), color: lockColor, opacity: toolDisabled ? 0.45 : 1 }}
          >
            {mapLocked ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 11V8a4 4 0 0 1 7.5-1.9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
            )}
          </button>
          <button
            type="button"
            disabled={toolDisabled || atCapacity}
            onClick={addTower}
            title={atCapacity ? `At system-size limit (${neededCount})` : "Add one tower at map center"}
            style={{ ...mapToolBtn(), opacity: toolDisabled || atCapacity ? 0.45 : 1 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
          </button>
          <button
            type="button"
            disabled={toolDisabled || !autoLayoutAllowed}
            onClick={() => setAutoOpen((v) => !v)}
            title={
              autoLayoutAllowed
                ? "Place tower grid from system size"
                : "Auto-layout needs 4+ towers (set a larger system size)"
            }
            style={{
              ...mapToolBtn(),
              color: autoOpen ? "#C9933E" : "#2F3B4C",
              opacity: toolDisabled || !autoLayoutAllowed ? 0.45 : 1,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              <rect x="5" y="4.2" width="3.2" height="3.6" rx="0.6" fill="currentColor"/>
              <rect x="10.4" y="4.2" width="3.2" height="3.6" rx="0.6" fill="currentColor"/>
              <rect x="15.8" y="4.2" width="3.2" height="3.6" rx="0.6" fill="currentColor"/>
              <rect x="5" y="10.2" width="3.2" height="3.6" rx="0.6" fill="currentColor"/>
              <rect x="10.4" y="10.2" width="3.2" height="3.6" rx="0.6" fill="currentColor"/>
              <rect x="15.8" y="10.2" width="3.2" height="3.6" rx="0.6" fill="currentColor"/>
              <rect x="5" y="16.2" width="3.2" height="3.6" rx="0.6" fill="currentColor"/>
              <rect x="10.4" y="16.2" width="3.2" height="3.6" rx="0.6" fill="currentColor"/>
              <rect x="15.8" y="16.2" width="3.2" height="3.6" rx="0.6" fill="currentColor"/>
            </svg>
          </button>
          <button
            type="button"
            disabled={towerCount < 2}
            onClick={evenlySpaceTowers}
            title={selectedCount >= 2 ? "Evenly space selected towers" : "Evenly space all towers"}
            style={{ ...mapToolBtn(), opacity: towerCount < 2 ? 0.4 : 1 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M4 12h16M8 8v8M16 8v8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"/>
              <circle cx="8" cy="12" r="2.2" fill="currentColor"/>
              <circle cx="16" cy="12" r="2.2" fill="currentColor"/>
            </svg>
          </button>
          <button
            type="button"
            disabled={toolDisabled}
            onClick={() => setSnapEnabled((v) => !v)}
            title={snapEnabled ? `Snap to 5 ft grid on · min ${MIN_TOWER_SEPARATION_FT} ft between towers` : "Snap to grid off (click to turn on)"}
            style={{
              ...mapToolBtn(),
              color: snapEnabled ? "#C9933E" : "#6F8096",
              opacity: toolDisabled ? 0.45 : 1,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M4 4h4v4H4zM10 4h4v4h-4zM16 4h4v4h-4zM4 10h4v4H4zM10 10h4v4h-4zM16 10h4v4h-4zM4 16h4v4H4zM10 16h4v4h-4zM16 16h4v4h-4z" stroke="currentColor" strokeWidth="1.4"/>
            </svg>
          </button>
          <button
            type="button"
            disabled={!towerCount}
            onClick={selectAllTowers}
            title="Select all towers (Ctrl/Cmd+A)"
            style={{ ...mapToolBtn(), opacity: towerCount ? 1 : 0.4 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <rect x="3.5" y="3.5" width="8" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.7"/>
              <rect x="12.5" y="3.5" width="8" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.7"/>
              <rect x="3.5" y="12.5" width="8" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.7"/>
              <rect x="12.5" y="12.5" width="8" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.7"/>
            </svg>
          </button>
          <button
            type="button"
            disabled={!towerCount}
            onClick={clearTowers}
            title="Clear all towers"
            style={{ ...mapToolBtn(), color: towerCount ? "#C93C37" : "#6F8096", opacity: towerCount ? 1 : 0.4 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 7h14M10 7V5h4v2M8 7l1 12h6l1-12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          {selectedCount > 0 && (
            <button
              type="button"
              onClick={deleteSelected}
              title={`Delete ${selectedCount} selected`}
              style={{ ...mapToolBtn(), color: "#C93C37" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>
          )}
          {selectedCount > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, color: "#F3B664", textShadow: "0 1px 3px rgba(0,0,0,0.75)", fontFamily: fontSans, marginLeft: 4 }}>
              {selectedCount} selected{selectedCount > 1 ? " · drag any to move all" : ""}
            </span>
          )}
        </div>

        {/* Auto-layout popover */}
        {autoOpen && hasCoords && autoLayoutAllowed && (
          <div
            style={{
              position: "absolute",
              top: 54,
              left: 10,
              zIndex: 1001,
              width: 260,
              padding: 12,
              borderRadius: 10,
              background: "rgba(255,255,255,0.96)",
              border: "1px solid #DDE2E8",
              boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
              fontFamily: fontSans,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: palette.navy, marginBottom: 6 }}>Auto-layout</div>
            <div style={{ fontSize: 10, color: palette.g500, lineHeight: 1.4, marginBottom: 10 }}>
              Places exactly <strong style={{ color: palette.navy }}>{neededCount}</strong> towers
              ({KW_PER_TOWER} kW each) for {Math.round(projectKw * 10) / 10} kW.
              Columns × rows set the grid shape; every tower is <strong style={{ color: palette.navy }}>{TOWER_SPACING_FT} ft</strong> apart.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
              <label style={{ fontSize: 10, color: palette.g500, textTransform: "uppercase", display: "block" }}>
                Columns
                <input
                  type="number"
                  min={1}
                  max={neededCount}
                  value={Math.min(autoCols, neededCount)}
                  onChange={(e) => {
                    const cols = Math.max(1, Math.min(neededCount, Number(e.target.value) || 1));
                    setAutoCols(cols);
                    setAutoRows(suggestRows(neededCount, cols));
                  }}
                  style={{ width: "100%", marginTop: 4, padding: "6px 8px", border: `1px solid ${palette.g200}`, borderRadius: 5, fontSize: 13, boxSizing: "border-box" }}
                />
              </label>
              <label style={{ fontSize: 10, color: palette.g500, textTransform: "uppercase", display: "block" }}>
                Rows
                <input
                  type="number"
                  min={1}
                  max={neededCount}
                  value={Math.min(autoRows, neededCount)}
                  onChange={(e) => {
                    const rows = Math.max(1, Math.min(neededCount, Number(e.target.value) || 1));
                    const cols = Math.max(1, Math.ceil(neededCount / rows));
                    setAutoRows(rows);
                    setAutoCols(cols);
                  }}
                  style={{ width: "100%", marginTop: 4, padding: "6px 8px", border: `1px solid ${palette.g200}`, borderRadius: 5, fontSize: 13, boxSizing: "border-box" }}
                />
              </label>
            </div>
            <div style={{ fontSize: 10, color: palette.g500, marginBottom: 10 }}>
              Grid {Math.min(autoCols, neededCount)} × {suggestRows(neededCount, autoCols)} · {TOWER_SPACING_FT} ft spacing
            </div>
            <button type="button" onClick={runAutoLayout} style={{ ...btn(true, true), width: "100%" }}>
              Place {neededCount} tower grid
            </button>
          </div>
        )}

        {/* Bottom rotation bar — applies to all towers */}
        {towerCount > 0 && (
          <div
            style={{
              position: "absolute",
              left: 10,
              right: 10,
              bottom: 10,
              zIndex: 1000,
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 12px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.95)",
              border: "1px solid #DDE2E8",
              boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
              fontFamily: fontSans,
            }}
          >
            <div style={{ fontSize: 10, color: palette.g500, textTransform: "uppercase", whiteSpace: "nowrap", fontWeight: 600 }}>
              Rotate all
            </div>
            <input
              type="range"
              min={0}
              max={359}
              value={((groupRotation % 360) + 360) % 360}
              onPointerDown={() => {
                rotationUndoArmedRef.current = true;
              }}
              onChange={(e) => setAllRotations(Number(e.target.value))}
              style={{ flex: 1, minWidth: 0 }}
              title="Rotate every tower together"
            />
            <div style={{ fontSize: 11, color: palette.navy, fontWeight: 700, minWidth: 42, textAlign: "right" }}>
              {((groupRotation % 360) + 360) % 360}°
            </div>
            <button
              type="button"
              onClick={resetAllRotations}
              title="Reset all towers to south (180°)"
              style={{
                border: `1px solid ${palette.g200}`,
                background: palette.white,
                color: palette.navy,
                borderRadius: 6,
                padding: "5px 8px",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: fontSans,
                whiteSpace: "nowrap",
              }}
            >
              Reset
            </button>
            <div style={{ fontSize: 10, color: palette.g500, whiteSpace: "nowrap" }}>
              {towerCount}/{neededCount || "—"} · {TOWER_WIDTH_FT}×{TOWER_LENGTH_FT} ft
            </div>
          </div>
        )}
      </div>

      <style>{`
        .janta-tower-icon, .janta-site-pin { background: transparent !important; border: none !important; overflow: visible !important; }
        .janta-compass-control .janta-compass,
        .janta-compass-control .janta-compass svg {
          transform: none !important;
        }
        .leaflet-container { font-family: ${fontSans}; }
        .leaflet-jantaTowers-pane { z-index: 650 !important; }
        .leaflet-jantaRadii-pane { z-index: 450 !important; pointer-events: none !important; }
        .leaflet-marker-icon.janta-tower-icon {
          overflow: visible !important;
          cursor: grab !important;
          opacity: 1 !important;
          visibility: visible !important;
        }
        .leaflet-marker-icon.janta-tower-icon .janta-tower-hit,
        .leaflet-marker-icon.janta-tower-icon .janta-tower-spin,
        .leaflet-marker-icon.janta-tower-icon .janta-tower-body {
          opacity: 1 !important;
          visibility: visible !important;
        }
        .leaflet-marker-icon.janta-tower-icon:hover {
          cursor: grab !important;
        }
        .leaflet-marker-icon.janta-tower-icon:active,
        .leaflet-dragging .leaflet-marker-icon.janta-tower-icon {
          cursor: grabbing !important;
        }
        .leaflet-marker-icon.janta-site-pin {
          cursor: grab !important;
        }
        .leaflet-marker-icon.janta-site-pin:active,
        .leaflet-dragging .leaflet-marker-icon.janta-site-pin {
          cursor: grabbing !important;
        }
        .leaflet-top.leaflet-left { margin-top: 52px; }
        .leaflet-control-attribution { display: none !important; }
      `}</style>
    </div>
  );
}

export { createEmptySiteMap, normalizeSiteMap };
