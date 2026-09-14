import { describe, expect, it } from "vitest";
import { fromHex, hex } from "../lib/bytes";
import { backupKeys, encodeCode, formatCode, newCode, parseCode } from "./code";
import vectors from "./vectors.json";

const parsed = (input: string) => {
  const r = parseCode(input);
  if (!("code" in r)) throw new Error(`not a code: ${r.problem}`);
  return r;
};

const CODE = vectors.codes[0].code;

describe("backup code", () => {
  it("matches vectors computed independently", () => {
    for (const v of vectors.codes) {
      expect(encodeCode(fromHex(v.entropy))).toBe(v.code);
      expect(hex(parsed(v.code).entropy)).toBe(v.entropy);
      const { key, topic } = backupKeys(fromHex(v.entropy));
      expect(hex(key)).toBe(v.key);
      expect(hex(topic)).toBe(v.topic);
    }
  });

  it("shows in seven groups of four, and reads back however it was written", () => {
    expect(formatCode(CODE)).toBe("000G 40R4 0M30 E209 185G R38E 1W9T");
    expect(parsed("000g-40r4-0m30 e209 185g\nr38e 1w9t").code).toBe(CODE);
    // I and L read as 1, O as 0: the letters that are easy to mistake for them are never in a code.
    expect(parsed("OOOG 4OR4 OM3O E2O9 I85G R38E LW9T").code).toBe(CODE);
  });

  it("catches a mistyped character anywhere, a missing one, and one that is never in a code", () => {
    for (let i = 0; i < CODE.length; i++) {
      const wrong = CODE.slice(0, i) + (CODE[i] === "7" ? "8" : "7") + CODE.slice(i + 1);
      expect(parseCode(wrong)).toEqual({ problem: "check" });
    }
    expect(parseCode(CODE.slice(1))).toEqual({ problem: "length" });
    expect(parseCode(`${CODE.slice(1)}U`)).toEqual({ problem: "character" });
    expect(parseCode(`${CODE.slice(1)}!`)).toEqual({ problem: "character" });
  });

  it("is different every time, and always reads back", () => {
    const a = newCode();
    expect(a).not.toBe(newCode());
    expect(parsed(formatCode(a)).code).toBe(a);
  });
});
