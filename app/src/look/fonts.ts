import atkinson from "@fontsource-variable/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-wght-normal.woff2?url";
import bricolage from "@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2?url";
import dmSans from "@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2?url";
import fraunces from "@fontsource-variable/fraunces/files/fraunces-latin-soft-normal.woff2?url";
import instrumentSans from "@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2?url";
import instrumentSerifItalic from "@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2?url";
import instrumentSerif from "@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2?url";
import type { LookId } from "./palettes";

/**
 * The bundled fonts (docs/DESIGN.md §4), Latin only and never from a font server: a request to one
 * would tell it who opens almanac. Fraunces carries its weight and softness axes, the rest their
 * weight axis only — about 242 KiB for all three looks. Each file downloads the first time a look
 * that uses it is shown.
 */
const FACES: Record<LookId, { family: string; url: string; weight: string; style?: "italic" }[]> = {
  hearth: [
    { family: "Fraunces", url: fraunces, weight: "100 900" },
    { family: "DM Sans", url: dmSans, weight: "100 1000" },
  ],
  moonpaper: [
    { family: "Instrument Serif", url: instrumentSerif, weight: "400" },
    { family: "Instrument Serif", url: instrumentSerifItalic, weight: "400", style: "italic" },
    { family: "Instrument Sans", url: instrumentSans, weight: "400 700" },
  ],
  pebble: [
    { family: "Bricolage Grotesque", url: bricolage, weight: "200 800" },
    { family: "Atkinson Hyperlegible Next", url: atkinson, weight: "200 800" },
  ],
};

const registered = new Map<LookId, FontFace[]>();

/** Makes a look's fonts available to the page. Nothing downloads until text uses them. */
export function registerFonts(look: LookId): FontFace[] {
  let faces = registered.get(look);
  if (!faces) {
    faces = FACES[look].map(
      (f) => new FontFace(f.family, `url("${f.url}") format("woff2")`, { weight: f.weight, style: f.style ?? "normal", display: "swap" }),
    );
    for (const face of faces) document.fonts.add(face);
    registered.set(look, faces);
  }
  return faces;
}

/**
 * Loads a look's fonts, waiting at most `ms`. Past that, text shows in the fallback font and switches
 * when they arrive — a slow file never holds the app back.
 */
export async function loadFonts(look: LookId, ms = 1500): Promise<void> {
  const faces = registerFonts(look);
  await Promise.race([Promise.allSettled(faces.map((f) => f.load())), new Promise((resolve) => setTimeout(resolve, ms))]);
}
