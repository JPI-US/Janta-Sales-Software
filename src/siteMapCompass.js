import L from "leaflet";

/** Static north-arrow HTML used by editor, preview, and PDF bake.
 * Always screen-fixed north-up — never inherits map/tower CSS transforms.
 */
export function compassMarkup() {
  return `
    <div class="janta-compass" aria-label="North" title="North (map always faces north)" style="
      width:52px;height:52px;border-radius:50%;
      background:rgba(255,255,255,0.92);
      border:2px solid #2F3B4C;
      box-shadow:0 2px 8px rgba(0,0,0,0.35);
      display:flex;align-items:center;justify-content:center;
      position:relative;font-family:system-ui,sans-serif;user-select:none;
      transform:none !important;
    ">
      <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true" style="transform:none !important;">
        <polygon points="18,4 22,18 18,15 14,18" fill="#C93C37"/>
        <polygon points="18,32 22,18 18,21 14,18" fill="#2F3B4C"/>
        <circle cx="18" cy="18" r="2.2" fill="#2F3B4C"/>
      </svg>
      <span style="
        position:absolute;top:3px;left:50%;transform:translateX(-50%);
        font-size:9px;font-weight:800;color:#C93C37;letter-spacing:0.04em;
      ">N</span>
    </div>
  `;
}

export function addCompassControl(map, position = "topright") {
  const Compass = L.Control.extend({
    options: { position },
    onAdd() {
      const div = L.DomUtil.create("div", "janta-compass-control");
      div.style.transform = "none";
      div.innerHTML = compassMarkup();
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      return div;
    },
  });
  const control = new Compass();
  control.addTo(map);
  return control;
}

function lockButtonMarkup(locked) {
  const label = locked ? "Unlock map" : "Lock map to site";
  const iconColor = locked ? "#C9933E" : "#6F8096";
  const icon = locked
    ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/>
        <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
      </svg>`
    : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/>
        <path d="M8 11V8a4 4 0 0 1 7.5-1.9" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
      </svg>`;
  return `
    <button type="button" class="janta-lock-btn" title="${label}" aria-label="${label}" aria-pressed="${locked ? "true" : "false"}" style="
      width:36px;height:36px;border-radius:8px;border:1px solid #DDE2E8;
      background:#FFFFFF;color:${iconColor};
      box-shadow:0 2px 8px rgba(0,0,0,0.28);display:flex;align-items:center;justify-content:center;
      cursor:pointer;padding:0;
    ">${icon}</button>
  `;
}

/**
 * Map-corner lock/unlock control. Call `control.setLocked()` to refresh the icon.
 */
export function addLockControl(map, { getLocked, onToggle, position = "topleft" } = {}) {
  const Lock = L.Control.extend({
    options: { position },
    onAdd() {
      const div = L.DomUtil.create("div", "janta-lock-control");
      const render = () => {
        const locked = typeof getLocked === "function" ? Boolean(getLocked()) : true;
        div.innerHTML = lockButtonMarkup(locked);
        const btn = div.querySelector("button");
        if (btn) {
          L.DomEvent.on(btn, "click", (e) => {
            L.DomEvent.stop(e);
            if (typeof onToggle === "function") onToggle();
          });
        }
      };
      this._render = render;
      render();
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      return div;
    },
    setLocked() {
      if (this._render) this._render();
    },
  });
  const control = new Lock();
  control.addTo(map);
  return control;
}

/** Absolute overlay for bake host (no Leaflet control needed). */
export function appendCompassOverlay(host) {
  const wrap = document.createElement("div");
  wrap.style.cssText = "position:absolute;top:10px;right:10px;z-index:1000;pointer-events:none;";
  wrap.innerHTML = compassMarkup();
  host.style.position = host.style.position || "relative";
  host.appendChild(wrap);
  return wrap;
}
