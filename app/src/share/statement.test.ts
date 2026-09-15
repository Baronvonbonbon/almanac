import { describe, expect, it } from "vitest";
import { hex } from "../lib/bytes";
import { ShareError, type ShareProblem } from "./errors";
import { almanacPair, newKeyPair, providerPair } from "./keys";
import { ENTRY_BYTES, openEntry, REQUEST_BYTES, sealApproval, sealStop } from "./messages";
import { newShare } from "./share";
import { APPROVAL_SLOTS, packSlots, REQUEST_SLOTS, slots, STATEMENT_BYTES, TOPICS, topicsFor } from "./statement";

function problem(fn: () => unknown): ShareProblem | null {
  try {
    fn();
  } catch (e) {
    if (e instanceof ShareError) return e.problem;
    throw e;
  }
  return null;
}

/** One share, and both sides of its pair key. */
function paired() {
  const provider = newKeyPair();
  const share = newShare(0, new Uint8Array(0));
  return { share, almanac: almanacPair(share.sender, provider.publicKey), app: providerPair(provider, share.sender.publicKey) };
}

const approve = (p: ReturnType<typeof paired>) => sealApproval(p.almanac, p.share.sender, p.share.id, newKeyPair().publicKey, 0, p.share.shareKey);

describe("the statements", () => {
  it("almanac's sharing statement is 512 bytes, with room for four, and each provider app finds only its own", () => {
    const [a, b, c] = [paired(), paired(), paired()];
    const data = packSlots([approve(a), sealStop(b.almanac, b.share.id, 0), approve(b)], ENTRY_BYTES);
    expect(data.length).toBe(STATEMENT_BYTES);
    expect(APPROVAL_SLOTS).toBe(4);
    const found = (p: ReturnType<typeof paired>) =>
      slots(data, ENTRY_BYTES)
        .map((s) => openEntry(p.app, s)?.kind)
        .filter(Boolean)
        .sort();
    expect(found(a)).toEqual(["approval"]);
    expect(found(b)).toEqual(["approval", "stop"]);
    expect(found(c)).toEqual([]);
  });

  it("show nothing of how many entries they hold: the rest is random, and the order changes", () => {
    const one = [approve(paired())];
    expect(hex(packSlots(one, ENTRY_BYTES))).not.toBe(hex(packSlots(one, ENTRY_BYTES)));
    expect(problem(() => packSlots(Array(APPROVAL_SLOTS + 1).fill(one[0]), ENTRY_BYTES))).toBe("too-large");
  });

  it("a provider app's requests statement has room for five", () => {
    expect(REQUEST_SLOTS).toBe(5);
    expect(slots(packSlots([], REQUEST_BYTES), REQUEST_BYTES)).toHaveLength(5);
  });

  it("always go out on four topics, so the topics do not count the providers either", () => {
    const real = new Uint8Array(32).fill(7);
    const topics = topicsFor([real]);
    expect(topics).toHaveLength(TOPICS);
    expect(topics.map(hex)).toContain(hex(real));
    expect(new Set(topics.map(hex)).size).toBe(TOPICS);
    expect(problem(() => topicsFor(Array(TOPICS + 1).fill(real)))).toBe("too-large");
  });

  it("refuse data that isn't almanac's, or comes from a newer almanac", () => {
    expect(problem(() => slots(new Uint8Array(100), ENTRY_BYTES))).toBe("format");
    const data = packSlots([], ENTRY_BYTES);
    data[0] = 2;
    expect(problem(() => slots(data, ENTRY_BYTES))).toBe("newer");
  });
});
