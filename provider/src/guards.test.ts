import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BANNED } from "@app/i18n/banned";
import { allMessages } from "./i18n";

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

  it("never asks for the provider's global Polkadot username", () => {
    const needle = ["get", "User", "Id"].join("");
    const self = resolve(import.meta.dirname, "guards.test.ts");
    const hits = sourceFiles(resolve(import.meta.dirname))
      .filter((f) => f !== self)
      .filter((f) => readFileSync(f, "utf8").includes(needle));
    expect(hits).toEqual([]);
  });
});
