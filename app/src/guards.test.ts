import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { allMessages } from "./i18n";

// docs/DESIGN.md §3 — words almanac never shows.
const BANNED: RegExp[] = [
  /\bwallets?\b/i,
  /\bsign(s|ed|ing)?\b/i,
  /\btransactions?\b/i,
  /\b(block)?chains?\b/i,
  /\bcrypto/i,
  /\btokens?\b/i,
  /\bgas\b/i,
  /\bseeds?\b/i,
  /\bmnemonic/i,
  /\bprivate keys?\b/i,
  /\brecovery phrase/i,
  /\brevok/i,
  /\bpermission grant/i,
  /\bencryption keys?\b/i,
  /\bKDF\b/,
  /\bcipher/i,
  /\bsafe days?\b/i,
  /\b(women|ladies|girls)\b/i,
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const path = join(dir, f);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(f) ? [path] : [];
  });
}

describe("guards", () => {
  it("shows no word from the banned list", () => {
    const hits = allMessages().flatMap((m) => BANNED.filter((re) => re.test(m)).map((re) => `${re} in "${m}"`));
    expect(hits).toEqual([]);
  });

  it("never asks for the user's global Polkadot username", () => {
    // It is readable by every Product and identical across all of them (docs/THREAT-MODEL.md). The
    // SDK bundles the function itself, so this reads almanac's source rather than dist/.
    const needle = ["get", "User", "Id"].join("");
    const self = resolve(import.meta.dirname, "guards.test.ts");
    const hits = sourceFiles(resolve(import.meta.dirname))
      .filter((f) => f !== self)
      .filter((f) => readFileSync(f, "utf8").includes(needle));
    expect(hits).toEqual([]);
  });
});
