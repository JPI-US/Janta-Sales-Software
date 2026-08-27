import { useEffect, useRef, useState } from "react";
import SiteMapPreview from "./SiteMapPreview.jsx";
import { SITE_MAP_BAKE_HEIGHT, SITE_MAP_BAKE_WIDTH } from "./siteMapBake.js";
import { siteMapHasLayout } from "./siteMapModel.js";

const fontSans = "'Inter', system-ui, -apple-system, sans-serif";

/**
 * Site map block framed exactly like the proposal / PDF:
 * - Fixed logical viewport (720×350) matching bakeSiteMapToDataUrl
 * - CSS-scaled to container width so zoom/pan framing matches the PDF
 */
export default function SiteMapProposalFrame({
  siteMap,
  address = "",
  titleColor = "#2F3B4C",
  borderColor = "#DDE2E8",
  mutedColor = "#6F8096",
  padding = 12,
  titleFontSize = 18,
  captionFontSize = 11,
  /** When set, show the baked PNG (PDF path) instead of the live map. */
  bakedImageDataUrl = null,
  /** Hide live map while PDF is exporting and bake is not ready yet. */
  pdfExporting = false,
}) {
  const shellRef = useRef(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = shellRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width || 0;
      if (w <= 0) return;
      setScale(w / SITE_MAP_BAKE_WIDTH);
    });
    ro.observe(el);
    const w = el.getBoundingClientRect().width;
    if (w > 0) setScale(w / SITE_MAP_BAKE_WIDTH);
    return () => ro.disconnect();
  }, []);

  if (!siteMapHasLayout(siteMap) && !bakedImageDataUrl) return null;

  const mapShell = (
    <div
      ref={shellRef}
      style={{
        width: "100%",
        aspectRatio: `${SITE_MAP_BAKE_WIDTH} / ${SITE_MAP_BAKE_HEIGHT}`,
        position: "relative",
        borderRadius: 8,
        overflow: "hidden",
        border: `1px solid ${borderColor}`,
        background: "#1a1a1a",
      }}
    >
      {bakedImageDataUrl ? (
        <img
          src={bakedImageDataUrl}
          alt="Site map with proposed solar towers"
          width={SITE_MAP_BAKE_WIDTH}
          height={SITE_MAP_BAKE_HEIGHT}
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      ) : pdfExporting ? null : (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: SITE_MAP_BAKE_WIDTH,
            height: SITE_MAP_BAKE_HEIGHT,
            transform: `translate(-50%, -50%) scale(${scale})`,
            transformOrigin: "center center",
            pointerEvents: "none",
          }}
        >
          <SiteMapPreview siteMap={siteMap} height={SITE_MAP_BAKE_HEIGHT} fixedWidth={SITE_MAP_BAKE_WIDTH} />
        </div>
      )}
    </div>
  );

  return (
    <div
      style={{
        background: "#FFFFFF",
        borderRadius: 10,
        padding,
        border: `1px solid ${borderColor}`,
        breakInside: "avoid",
        pageBreakInside: "avoid",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 6,
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: titleFontSize,
            fontWeight: 700,
            color: titleColor,
            fontFamily: fontSans,
            flexShrink: 0,
          }}
        >
          Site Map
        </h3>
        {address ? (
          <p
            style={{
              margin: 0,
              color: mutedColor,
              fontSize: captionFontSize,
              fontFamily: fontSans,
              lineHeight: 1.45,
              textAlign: "right",
              flex: 1,
              minWidth: 0,
            }}
          >
            {address}
          </p>
        ) : null}
      </div>
      {mapShell}
    </div>
  );
}
