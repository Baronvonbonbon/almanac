import { describe, expect, it } from "vitest";
import { DEFAULT_SHARE_DAYS, endOfDay, OPENINGS, openingUntil, SHARE_DAYS, shareEnds } from "./times";

// On the phone's own clock: "the rest of the day" ends at its midnight.
const NOW = new Date(2026, 8, 15, 14, 10).getTime();
const MINUTE = 60_000;

describe("how long things last in a share", () => {
  it("a share lasts a week unless the patient picks otherwise, and never more than 90 days", () => {
    expect(DEFAULT_SHARE_DAYS).toBe(7);
    expect(Math.max(...SHARE_DAYS)).toBe(90);
    expect(shareEnds(NOW, 7) - NOW).toBe(7 * 24 * 60 * MINUTE);
  });

  it("an opening lasts 15 minutes, an hour, or until midnight", () => {
    const ends = shareEnds(NOW, 7);
    expect(openingUntil("quarter", NOW, ends)).toBe(NOW + 15 * MINUTE);
    expect(openingUntil("hour", NOW, ends)).toBe(NOW + 60 * MINUTE);
    expect(openingUntil("day", NOW, ends)).toBe(new Date(2026, 8, 16).getTime());
    expect(endOfDay(new Date(2026, 8, 15, 23, 55).getTime())).toBe(new Date(2026, 8, 16).getTime());
  });

  it("an opening never outlasts the share", () => {
    const ends = NOW + 5 * MINUTE;
    for (const opening of OPENINGS) expect(openingUntil(opening, NOW, ends)).toBe(ends);
  });
});
