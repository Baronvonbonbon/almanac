import instrumentSans from "@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2?url";
import instrumentSerifItalic from "@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2?url";
import instrumentSerif from "@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2?url";
import { cssVariables, type Variant } from "@app/look/palettes";
import type { Host } from "@app/platform";

/**
 * The provider app's one look (decided 2026-09-15): almanac's Moonpaper, light or dark as the host's
 * theme says. A work tool, with nothing to set up. Its fonts are bundled, never fetched from a font
 * server, and only Moonpaper's.
 */
const FACES = [
  { family: "Instrument Serif", url: instrumentSerif, weight: "400", style: "normal" },
  { family: "Instrument Serif", url: instrumentSerifItalic, weight: "400", style: "italic" },
  { family: "Instrument Sans", url: instrumentSans, weight: "400 700", style: "normal" },
];
let faces: FontFace[] | null = null;

function apply(variant: Variant) {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(cssVariables("moonpaper", variant))) root.style.setProperty(name, value);
  root.style.colorScheme = variant;
  root.dataset.look = "moonpaper";
  root.dataset.variant = variant;
}

function registerFaces(): FontFace[] {
  faces ??= FACES.map((f) => {
    const face = new FontFace(f.family, `url("${f.url}") format("woff2")`, { weight: f.weight, style: f.style, display: "swap" });
    document.fonts.add(face);
    return face;
  });
  return faces;
}

/** The first paint, before the host is known: the phone's light or dark. */
export function showStartingLook(): void {
  apply(matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  registerFaces();
}

/** Before the first real screen: the host's light or dark, followed from then on, and the fonts — waiting a moment at most. */
export async function startLook(host: Host | null): Promise<void> {
  let delivered: Promise<void> = Promise.resolve();
  if (host?.subscribeVariant) {
    delivered = new Promise<void>((resolve) => {
      try {
        host.subscribeVariant!((variant) => {
          apply(variant);
          resolve();
        });
      } catch {
        resolve();
      }
    });
  } else {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const follow = () => apply(media.matches ? "dark" : "light");
    media.addEventListener("change", follow);
    follow();
  }
  const moment = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  await Promise.race([delivered, moment(800)]);
  await Promise.race([Promise.allSettled(registerFaces().map((f) => f.load())), moment(1500)]);
}
