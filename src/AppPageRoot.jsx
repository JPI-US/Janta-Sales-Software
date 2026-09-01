import { useEffect, useState } from "react";
import { fontSans, getPageScale, PAGE_BASE_WIDTH } from "./appTheme.js";

export function useViewportWidth() {
  const [width, setWidth] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 1280));

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return width;
}

export default function AppPageRoot({ bg, children }) {
  const scale = getPageScale(useViewportWidth());

  return (
    <div style={{ background: bg, minHeight: "100vh" }}>
      <div
        style={{
          fontFamily: fontSans,
          background: bg,
          minHeight: "100vh",
          width: PAGE_BASE_WIDTH,
          maxWidth: "calc(100vw - 24px)",
          margin: "0 auto",
          zoom: scale,
        }}
      >
        {children}
      </div>
    </div>
  );
}
