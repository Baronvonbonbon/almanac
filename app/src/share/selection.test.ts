import { describe, expect, it } from "vitest";
import { utf8 } from "../lib/bytes";
import { ShareError, type ShareProblem } from "./errors";
import { decodeSelection, encodeSelection, type Selection } from "./selection";
import { MAX_PAYLOAD } from "./share";

async function problem(fn: () => Promise<unknown>): Promise<ShareProblem | null> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof ShareError) return e.problem;
    throw e;
  }
  return null;
}

/** A year of days logged every day, with a period of five days every 28. */
function year(): Selection {
  const days: Selection["days"] = {};
  for (let d = 0; d < 365; d++) {
    const date = new Date(Date.UTC(2025, 8, 15 + d)).toISOString().slice(0, 10);
    days[date] = { ...(d % 28 < 5 ? { flow: "medium" as const } : {}), symptoms: d % 3 ? ["cramps", "bloating"] : ["headache"] };
  }
  return { v: 1, from: "2025-09-15", to: "2026-09-14", made: "2026-09-14", categories: ["periods", "symptoms"], days };
}

describe("a selection", () => {
  it("packs small enough that a year of daily logs fits the smallest shares", async () => {
    const s = year();
    const packed = await encodeSelection(s);
    expect(JSON.stringify(s).length).toBeGreaterThan(MAX_PAYLOAD);
    expect(packed.length).toBeLessThan(2048);
    expect(await decodeSelection(packed)).toEqual(s);
  });

  it("refuses what isn't a selection, one from a newer almanac, and one that unpacks larger than any share", async () => {
    expect(await problem(() => decodeSelection(utf8("not packed at all")))).toBe("damaged");
    expect(await problem(async () => decodeSelection(await encodeSelection({ v: 2 } as unknown as Selection)))).toBe("newer");
    expect(await problem(async () => decodeSelection(await encodeSelection({ ...year(), categories: ["everything"] } as unknown as Selection)))).toBe("damaged");
    const bomb = await encodeSelection({ ...year(), days: {}, note: "x".repeat(2 * 1024 * 1024) } as unknown as Selection);
    expect(bomb.length).toBeLessThan(MAX_PAYLOAD);
    expect(await problem(() => decodeSelection(bomb))).toBe("too-large");
  });
});
