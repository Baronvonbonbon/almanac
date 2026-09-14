import { describe, expect, it } from "vitest";
import { text } from "../lib/bytes";
import { newCode, parseCode } from "./code";
import { BackupError, backupText, BUCKETS, openBackup, readBackupText, sealBackup } from "./format";

const entropy = () => {
  const r = parseCode(newCode());
  if (!("entropy" in r)) throw new Error(r.problem);
  return r.entropy;
};

const problemOf = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    return e instanceof BackupError ? e.kind : String(e);
  }
  return "none";
};

describe("backups", () => {
  it("open with the backup code, and with no other", () => {
    const code = entropy();
    const sealed = sealBackup(code, { note: "cramps" });
    expect(openBackup(code, sealed)).toEqual({ note: "cramps" });
    expect(problemOf(() => openBackup(entropy(), sealed))).toBe("wrong-code");
  });

  it("are always one of four sizes, and show nothing of what they hold", () => {
    const code = entropy();
    const small = sealBackup(code, { note: "cramps" });
    expect(small.length).toBe(BUCKETS[0]);
    expect(text(small)).not.toContain("cramps");
    expect(sealBackup(code, { note: "x".repeat(20_000) }).length).toBe(BUCKETS[1]);
    expect(problemOf(() => sealBackup(code, { note: "x".repeat(1_100_000) }))).toBe("too-large");
  });

  it("use a fresh key each time", () => {
    const code = entropy();
    const [a, b] = [sealBackup(code, {}), sealBackup(code, {})];
    expect(a.subarray(6, 78)).not.toEqual(b.subarray(6, 78));
    expect(openBackup(code, b)).toEqual({});
  });

  it("survive being pasted into a note: line breaks, spaces and words around them", () => {
    const code = entropy();
    const copied = backupText(sealBackup(code, { flow: "light" }), "almanac backup · Sep 14, 2026");
    const pasted = `To me\n\n${copied.replace(/almanac1:(\S+)/, (_, body: string) => `almanac1:${body.match(/.{1,70}/g)!.join("\n  ")}`)}\nSent from my phone`;
    expect(openBackup(code, readBackupText(pasted))).toEqual({ flow: "light" });
  });

  it("say clearly when text holds no backup, a damaged one, or one from a newer almanac", () => {
    const code = entropy();
    const sealed = sealBackup(code, {});
    expect(problemOf(() => readBackupText("see you tomorrow"))).toBe("format");
    const damaged = sealed.slice();
    damaged[200] ^= 1;
    expect(problemOf(() => openBackup(code, damaged))).toBe("format");
    const newer = sealed.slice();
    newer[4] = 2;
    expect(problemOf(() => openBackup(code, newer))).toBe("newer");
    expect(problemOf(() => openBackup(code, sealed.subarray(0, 50)))).toBe("format");
  });
});
