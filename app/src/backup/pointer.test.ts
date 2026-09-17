import { randomBytes } from "@parity/product-sdk-crypto";
import { describe, expect, it } from "vitest";
import { hex } from "../lib/bytes";
import { STATEMENT_BYTES, TOPICS } from "../share";
import { backupKeys } from "./code";
import { BACKUP_CHANNEL, newestPointer, openPointer, POINTER_BYTES, pointerStatement, sealPointer } from "./pointer";

const NOW = Date.UTC(2026, 8, 17, 9, 30);
const DAY = 24 * 60 * 60_000;
const keys = backupKeys(new Uint8Array(16).fill(3));
const other = backupKeys(new Uint8Array(16).fill(4));

describe("a backup pointer", () => {
  it("round-trips the content hash and the time", () => {
    const hash = randomBytes(32);
    const read = openPointer(keys.key, sealPointer(keys.key, { hash, at: NOW }));
    expect(read).not.toBeNull();
    expect(hex(read!.hash)).toBe(hex(hash));
    expect(read!.at).toBe(NOW);
  });

  it("opens with the backup code's key and no other", () => {
    const sealed = sealPointer(keys.key, { hash: randomBytes(32), at: NOW });
    expect(openPointer(other.key, sealed)).toBeNull();
  });

  it("refuses anything that isn't one, rather than throwing", () => {
    expect(openPointer(keys.key, randomBytes(POINTER_BYTES))).toBeNull();
    expect(openPointer(keys.key, randomBytes(POINTER_BYTES - 1))).toBeNull();
    expect(openPointer(keys.key, new Uint8Array(0))).toBeNull();
  });

  it("keeps whole seconds, so a pointer is the same size whenever it is made", () => {
    const a = sealPointer(keys.key, { hash: randomBytes(32), at: NOW });
    const b = sealPointer(keys.key, { hash: randomBytes(32), at: NOW + 400 * DAY });
    expect(a.length).toBe(POINTER_BYTES);
    expect(b.length).toBe(POINTER_BYTES);
    expect(openPointer(keys.key, b)!.at).toBe(NOW + 400 * DAY);
  });
});

describe("the pointer statement", () => {
  it("is the same shape as any other almanac statement: 512 bytes on four topics", () => {
    const { data, topics } = pointerStatement(keys.key, keys.topic, { hash: randomBytes(32), at: NOW });
    expect(data.length).toBe(STATEMENT_BYTES);
    expect(topics).toHaveLength(TOPICS);
    expect(topics.map(hex)).toContain(hex(keys.topic));
  });

  it("hides which slot is the real one from anyone without the code", () => {
    const { data } = pointerStatement(keys.key, keys.topic, { hash: randomBytes(32), at: NOW });
    // Every slot is tried; exactly one opens, and only with the right key.
    expect(newestPointer(keys.key, [data])).not.toBeNull();
    expect(newestPointer(other.key, [data])).toBeNull();
  });

  it("takes the newest of whatever was heard, in any order", () => {
    const old = randomBytes(32);
    const fresh = randomBytes(32);
    const a = pointerStatement(keys.key, keys.topic, { hash: old, at: NOW - 6 * DAY }).data;
    const b = pointerStatement(keys.key, keys.topic, { hash: fresh, at: NOW }).data;
    for (const heard of [[a, b], [b, a]]) {
      expect(hex(newestPointer(keys.key, heard)!.hash)).toBe(hex(fresh));
    }
  });

  it("ignores statements it cannot read, rather than giving up on the rest", () => {
    const good = pointerStatement(keys.key, keys.topic, { hash: randomBytes(32), at: NOW }).data;
    const noise = randomBytes(STATEMENT_BYTES);
    const newer = randomBytes(STATEMENT_BYTES);
    newer[0] = 99; // a statement from a newer almanac
    expect(newestPointer(keys.key, [noise, newer, good])).not.toBeNull();
  });

  it("has a channel of its own, so it never replaces the sharing statement", async () => {
    const { SHARING_CHANNEL } = await import("../share");
    expect(hex(BACKUP_CHANNEL)).not.toBe(hex(SHARING_CHANNEL));
  });
});
