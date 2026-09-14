/**
 * How much of the bottom of almanac's frame is off the screen, as --hidden-bottom on <html>.
 *
 * The dev-dot.li web host puts almanac in a frame it sizes to 100vh — on a phone, the height with the
 * browser's toolbars hidden — inside a page that cannot scroll. So the frame's bottom sits under the
 * toolbar, and whatever is pinned there (Continue, the tabs) cannot be reached (2026-09-14). Pinned
 * things and the ends of pages make room for --hidden-bottom.
 *
 * An IntersectionObserver with no root measures against the top-level screen, even from a frame on
 * another origin — so an invisible strip along the frame's bottom says how much of it is on screen.
 * Wherever the frame is fully visible, or almanac is not in a frame at all, it stays 0 and nothing
 * moves.
 */

/** Taller than any browser toolbar; anything hidden beyond this still reads as this much. */
const STRIP_PX = 240;

export function watchHiddenBottom(): void {
  if (window.top === window.self || typeof IntersectionObserver === "undefined") return;
  const strip = document.createElement("div");
  strip.setAttribute("aria-hidden", "true");
  Object.assign(strip.style, { position: "fixed", left: "0", bottom: "0", width: "1px", height: `${STRIP_PX}px`, opacity: "0", pointerEvents: "none" });
  document.body.append(strip);
  // A threshold every 2 px, so each change in what is visible is reported.
  const threshold = Array.from({ length: STRIP_PX / 2 + 1 }, (_, i) => i / (STRIP_PX / 2));
  new IntersectionObserver(
    ([entry]) => {
      const hidden = Math.max(0, Math.round(entry.boundingClientRect.height - entry.intersectionRect.height));
      document.documentElement.style.setProperty("--hidden-bottom", `${hidden}px`);
    },
    { threshold },
  ).observe(strip);
}
