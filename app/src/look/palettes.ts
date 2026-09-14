/**
 * The three looks (docs/DESIGN.md §4). Colours live here rather than in CSS, so one list feeds the
 * page, the look picker's previews and the contrast test.
 */

export const LOOK_IDS = ["hearth", "moonpaper", "pebble"] as const;
export type LookId = (typeof LOOK_IDS)[number];
export const DEFAULT_LOOK: LookId = "hearth";

/** Light or dark — inside the Polkadot app, the host's theme decides (P12). */
export type Variant = "light" | "dark";

export const isLookId = (value: unknown): value is LookId => (LOOK_IDS as readonly unknown[]).includes(value);

export interface Palette {
  bg: string;
  surface: string;
  ink: string;
  inkSoft: string;
  accent: string;
  onAccent: string;
  period: string;
  blush: string;
  fertile: string;
  line: string;
}

export interface Look {
  palettes: Record<Variant, Palette>;
  /** CSS font stacks. The first family in each is bundled (./fonts.ts); the rest are fallbacks. */
  display: string;
  body: string;
  displayVariation: string;
  displayWeight: number;
  radius: string;
  cellRadius: string;
}

const SANS_FALLBACK = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const SERIF_FALLBACK = 'Georgia, "Times New Roman", serif';

export const LOOKS: Record<LookId, Look> = {
  hearth: {
    palettes: {
      light: { bg: "#FBF6F0", surface: "#FFFBF7", ink: "#3B2F2A", inkSoft: "#6E5E55", accent: "#A9533A", onAccent: "#FFFFFF", period: "#C96F5A", blush: "#F2D9CF", fertile: "#7A8B6C", line: "#EADFD2" },
      dark: { bg: "#1F1A17", surface: "#29221E", ink: "#F3EAE2", inkSoft: "#BFAFA4", accent: "#E08C6D", onAccent: "#1F1A17", period: "#D9826C", blush: "#4A3029", fertile: "#9DB08D", line: "#3A312C" },
    },
    display: `"Fraunces", ${SERIF_FALLBACK}`,
    body: `"DM Sans", ${SANS_FALLBACK}`,
    displayVariation: '"SOFT" 100',
    displayWeight: 600,
    radius: "18px",
    cellRadius: "10px",
  },
  moonpaper: {
    palettes: {
      light: { bg: "#EFEBF1", surface: "#F9F7FA", ink: "#2B2745", inkSoft: "#5F5A78", accent: "#B0456A", onAccent: "#FFFFFF", period: "#C4566F", blush: "#EAD2DC", fertile: "#4F7891", line: "#D9D3DF" },
      dark: { bg: "#1B1930", surface: "#24213F", ink: "#EDE8F3", inkSoft: "#B2ABC8", accent: "#F08EA8", onAccent: "#1B1930", period: "#E8839C", blush: "#472D48", fertile: "#8FB6CC", line: "#36325A" },
    },
    display: `"Instrument Serif", ${SERIF_FALLBACK}`,
    body: `"Instrument Sans", ${SANS_FALLBACK}`,
    displayVariation: "normal",
    displayWeight: 400,
    radius: "10px",
    cellRadius: "50%",
  },
  pebble: {
    palettes: {
      light: { bg: "#FCEBE1", surface: "#FFF8F4", ink: "#3A2230", inkSoft: "#775766", accent: "#8E2F5A", onAccent: "#FFFFFF", period: "#CF5479", blush: "#F6CFD2", fertile: "#5E8F70", line: "#EFCFC3" },
      dark: { bg: "#231920", surface: "#33242D", ink: "#FBEDE9", inkSoft: "#D0B4BD", accent: "#F29BBE", onAccent: "#231920", period: "#EB7E9C", blush: "#5A3342", fertile: "#93C3A2", line: "#48333E" },
    },
    display: `"Bricolage Grotesque", ${SANS_FALLBACK}`,
    body: `"Atkinson Hyperlegible Next", ${SANS_FALLBACK}`,
    displayVariation: "normal",
    displayWeight: 750,
    radius: "24px",
    cellRadius: "14px",
  },
};

/** The CSS custom properties a look sets on the page, for one variant. */
export function cssVariables(id: LookId, variant: Variant): Record<string, string> {
  const look = LOOKS[id];
  const p = look.palettes[variant];
  return {
    "--bg": p.bg,
    "--surface": p.surface,
    "--ink": p.ink,
    "--ink-soft": p.inkSoft,
    "--accent": p.accent,
    "--on-accent": p.onAccent,
    "--period": p.period,
    "--blush": p.blush,
    "--fertile": p.fertile,
    "--line": p.line,
    "--display": look.display,
    "--display-variation": look.displayVariation,
    "--display-weight": String(look.displayWeight),
    "--body": look.body,
    "--radius": look.radius,
    "--cell-radius": look.cellRadius,
  };
}
