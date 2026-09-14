import { describe, expect, it } from "vitest";
import { cssVariables, LOOK_IDS, LOOKS, type Palette, type Variant } from "./palettes";

/** WCAG 2.2 relative luminance and contrast ratio. */
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Text needs 4.5:1 (WCAG 1.4.3); period and fertile-window marks are graphics, which need 3:1 against
// what surrounds them (1.4.11). Every pair is checked on both grounds a screen uses.
const PAIRS: [keyof Palette, keyof Palette, number][] = [
  ["ink", "bg", 4.5],
  ["ink", "surface", 4.5],
  ["inkSoft", "bg", 4.5],
  ["inkSoft", "surface", 4.5],
  ["onAccent", "accent", 4.5],
  ["accent", "bg", 4.5],
  ["accent", "surface", 4.5],
  ["period", "bg", 3],
  ["period", "surface", 3],
  ["fertile", "bg", 3],
  ["fertile", "surface", 3],
];

const VARIANTS: Variant[] = ["light", "dark"];

describe("looks", () => {
  it("meet WCAG AA contrast in all six palettes", () => {
    const failures = LOOK_IDS.flatMap((id) =>
      VARIANTS.flatMap((variant) => {
        const p = LOOKS[id].palettes[variant];
        return PAIRS.filter(([a, b, min]) => contrast(p[a], p[b]) < min).map(
          ([a, b, min]) => `${id}/${variant}: ${a} on ${b} is ${contrast(p[a], p[b]).toFixed(2)}, needs ${min}`,
        );
      }),
    );
    expect(failures).toEqual([]);
  });

  it("set the same properties whichever look and variant is chosen", () => {
    const expected = Object.keys(cssVariables("hearth", "light")).sort();
    for (const id of LOOK_IDS) for (const variant of VARIANTS) expect(Object.keys(cssVariables(id, variant)).sort()).toEqual(expected);
  });

  it("use six-digit colours only, so the contrast check reads them correctly", () => {
    for (const id of LOOK_IDS) for (const variant of VARIANTS) for (const colour of Object.values(LOOKS[id].palettes[variant])) expect(colour).toMatch(/^#[0-9A-F]{6}$/);
  });
});
