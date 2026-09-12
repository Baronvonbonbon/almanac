import { scryptAsync } from "@noble/hashes/scrypt.js";
import { blake2b256, xchachaDecryptPacked, xchachaEncryptPacked } from "@parity/product-sdk-crypto";
import type { Check } from "../types";
import { errText, randomBytes, since } from "../util";

export const perf: Check = {
  id: "P11",
  title: "How fast are locking and encryption on this phone?",
  decides: "How strong the PIN protection can be while unlocking still feels instant (target ≈ 300 ms).",
  steps: ["Keep almanac in front while this runs — it takes a few seconds."],
  async run({ log }) {
    const rows: Record<string, string> = {};
    let n16 = NaN;
    for (const logN of [14, 15, 16, 17]) {
      const t0 = performance.now();
      try {
        await scryptAsync("123456", "almanac-probe-salt", { N: 2 ** logN, r: 8, p: 1, dkLen: 32 });
        const ms = since(t0);
        rows[`scrypt N=2^${logN}, r=8`] = `${ms} ms`;
        if (logN === 16) n16 = ms;
      } catch (e) {
        rows[`scrypt N=2^${logN}, r=8`] = `failed — ${errText(e)}`;
      }
      log(`scrypt 2^${logN}: ${rows[`scrypt N=2^${logN}, r=8`]}`);
    }
    const mib = randomBytes(1 << 20);
    const key = randomBytes(32);
    let t0 = performance.now();
    const sealed = xchachaEncryptPacked(mib, key);
    rows["XChaCha20-Poly1305 encrypt, 1 MiB"] = `${since(t0)} ms`;
    t0 = performance.now();
    xchachaDecryptPacked(sealed, key);
    rows["XChaCha20-Poly1305 decrypt, 1 MiB"] = `${since(t0)} ms`;
    t0 = performance.now();
    blake2b256(mib);
    rows["BLAKE2b-256, 1 MiB"] = `${since(t0)} ms`;
    return {
      status: "info",
      summary: Number.isNaN(n16) ? "scrypt N=2^16 did not complete." : `scrypt N=2^16 took ${n16} ms.`,
      data: rows,
    };
  },
};
