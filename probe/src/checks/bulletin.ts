import { xchachaEncryptPacked } from "@parity/product-sdk-crypto";
import { getApp, requestBulletinAllowance } from "../app";
import type { Check } from "../types";
import { errText, kib, randomBytes, since, withTimeout } from "../util";

export const uploadLadder: Check = {
  id: "P6",
  title: "How large can an encrypted backup upload be?",
  decides: "Backup padding sizes (16 KiB → 1 MiB planned).",
  needsHost: true,
  steps: ["Approve the storage request on your phone if one appears. This uses test storage only."],
  async run({ journal, log }) {
    if (!(await getApp()).cloudStorage) return { status: "skip", summary: "Cloud storage is not available in this app build." };
    const allowance = await requestBulletinAllowance(log);
    const app = await getApp(); // rebuilt after the allowance
    const cs = app.cloudStorage!;
    const signer = app.wallet.getSelectedAccount()?.address ?? null;

    const results: Record<string, string> = {};
    let largest = 0;
    for (const size of [1, 16, 64, 256, 1024].map((k) => k * 1024)) {
      // Encrypted random bytes under a key that is thrown away: shaped like a real backup, and nothing
      // readable ever goes up. XChaCha adds 24 bytes of nonce and 16 of tag.
      const blob = xchachaEncryptPacked(randomBytes(size - 40), randomBytes(32));
      const t0 = performance.now();
      try {
        const r = await withTimeout(cs.upload(blob), 180_000, "upload");
        if (!r.ok) throw new Error(errText(r.error));
        results[kib(size)] = `ok in ${since(t0)} ms — ${r.value}`;
        await journal.addUpload({ cid: r.value, bytes: blob.length, at: Date.now(), build: __BUILD_ID__ });
        largest = size;
      } catch (e) {
        results[kib(size)] = `failed after ${since(t0)} ms — ${errText(e)}`;
        log(`${kib(size)}: ${results[kib(size)]}`);
        break;
      }
      log(`${kib(size)}: ${results[kib(size)]}`);
    }
    return {
      status: largest ? "pass" : "fail",
      summary: largest ? `Uploaded up to ${kib(largest)}.` : "Not even 1 KiB uploaded.",
      data: { allowance, signer, results },
    };
  },
};

export const retention: Check = {
  id: "P7",
  title: "How long does Bulletin keep an upload?",
  decides: "How often almanac backs up, and what the backup status says.",
  needsHost: true,
  steps: ["Run P6 once to leave uploads behind.", "Run this every few days for at least three weeks."],
  input: { label: "Another CID to check (optional)", placeholder: "bafy…" },
  async run({ journal, input }) {
    const cs = (await getApp()).cloudStorage;
    if (!cs) return { status: "skip", summary: "Cloud storage is not available in this app build." };
    const targets = [...journal.uploads()];
    if (input.trim()) targets.push({ cid: input.trim(), bytes: 0, at: 0, build: "typed in" });
    if (!targets.length) return { status: "skip", summary: "Nothing uploaded yet — run P6 first." };

    const rows: Record<string, string> = {};
    let alive = 0;
    let oldestAlive = 0;
    let youngestGone = Infinity;
    for (const t of targets) {
      const age = t.at ? (Date.now() - t.at) / 86_400_000 : NaN;
      const ageText = Number.isNaN(age) ? "age unknown" : `${age.toFixed(1)} days old`;
      try {
        const r = await withTimeout(cs.fetch(t.cid), 90_000, "fetch");
        if (!r.ok) throw new Error(errText(r.error));
        const verified = (await cs.computeCid(r.value)) === t.cid;
        rows[t.cid] = `${verified ? "available" : "WRONG BYTES"} — ${ageText}`;
        if (verified) {
          alive++;
          if (age > oldestAlive) oldestAlive = age;
        }
      } catch (e) {
        rows[t.cid] = `gone or unreachable — ${ageText} — ${errText(e)}`;
        if (age < youngestGone) youngestGone = age;
      }
    }
    const gone = youngestGone < Infinity ? ` Youngest gone: ${youngestGone.toFixed(1)} days.` : "";
    return {
      status: "info",
      summary: `${alive} of ${targets.length} still available. Oldest still available: ${oldestAlive.toFixed(1)} days.${gone}`,
      data: rows,
    };
  },
};
