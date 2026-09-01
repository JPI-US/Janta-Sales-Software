import { flushSync } from "react-dom";
import { getAppTheme } from "./appTheme.js";

const REDUCED_MOTION =
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

function setTransitionOrigin(x, y) {
  const root = document.documentElement;
  const endRadius =
    Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)) + 24;
  root.style.setProperty("--theme-transition-x", `${x}px`);
  root.style.setProperty("--theme-transition-y", `${y}px`);
  root.style.setProperty("--theme-transition-r", `${endRadius}px`);
}

function runViewTransition(applyChange) {
  if (typeof document.startViewTransition !== "function") return false;
  document.startViewTransition(() => {
    flushSync(applyChange);
  });
  return true;
}

function runOverlayTransition({ x, y, toDark }, applyChange) {
  const bg = getAppTheme(toDark).bg;
  const endRadius =
    Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)) + 24;

  const overlay = document.createElement("div");
  overlay.setAttribute("aria-hidden", "true");
  overlay.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:2147483646",
    "pointer-events:none",
    `background:${bg}`,
    `clip-path:circle(0px at ${x}px ${y}px)`,
    "opacity:0",
    "transition:clip-path 1.05s cubic-bezier(0.25,0.1,0.25,1),opacity 1.05s cubic-bezier(0.25,0.1,0.25,1)",
    "will-change:clip-path,opacity",
  ].join(";");
  document.body.appendChild(overlay);

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    flushSync(applyChange);
    overlay.remove();
  };

  overlay.addEventListener("transitionend", finish, { once: true });
  window.setTimeout(finish, 1200);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      overlay.style.clipPath = `circle(${endRadius}px at ${x}px ${y}px)`;
      overlay.style.opacity = "1";
    });
  });
}

/**
 * Circular day/night reveal from click point, softened with a cross-fade.
 */
export function runThemeTransition(origin, applyChange) {
  const { x, y, toDark } = origin;

  if (REDUCED_MOTION) {
    flushSync(applyChange);
    return;
  }

  setTransitionOrigin(x, y);

  if (runViewTransition(applyChange)) return;

  runOverlayTransition({ x, y, toDark }, applyChange);
}

export function themeTransitionClickOrigin(event) {
  if (event?.clientX != null && event?.clientY != null) {
    return { x: event.clientX, y: event.clientY };
  }
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}
