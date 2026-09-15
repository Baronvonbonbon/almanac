import { describe, expect, it } from "vitest";
import { categoriesText, rangeText } from "./SelectionView";
import { spaced } from "./ShareFlow";

describe("the words on the sharing screens", () => {
  it("dates a range with its year, and with both years when it crosses one", () => {
    expect(rangeText("2026-03-16", "2026-09-15")).toBe("Mar 16 – Sep 15, 2026");
    expect(rangeText("2025-09-16", "2026-09-15")).toBe("Sep 16, 2025 – Sep 15, 2026");
  });

  it("names what was shared", () => {
    expect(categoriesText(["periods", "symptoms"])).toBe("Periods and cycle lengths · Symptoms");
  });

  it("shows the six digits as the provider app does, leading zeros and all", () => {
    expect(spaced("042917")).toBe("042 917");
  });
});
