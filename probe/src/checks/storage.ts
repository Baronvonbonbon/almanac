import { blake2b256 } from "@parity/product-sdk-crypto";
import { getHostLocalStorage } from "@parity/product-sdk-host";
import type { Check } from "../types";
import { day, errText, hex, kib, randomBytes, since, withTimeout } from "../util";

interface Install {
  id: string;
  firstSeen: number;
  runs: { at: number; build: string }[];
}

const INSTALL = "probe/install";
const CAPACITY = "probe/capacity";

export const survival: Check = {
  id: "P1",
  title: "Does saved data survive a restart, an update, a reinstall?",
  decides: "Whether reinstalling the Polkadot app means losing everything that was not backed up.",
  needsHost: true,
  steps: [
    "Run this once.",
    "Close the Polkadot app completely, reopen this probe, run again.",
    "After a Polkadot app update, run again.",
    "Export the report (bottom of the page), reinstall the Polkadot app, run again.",
  ],
  async run() {
    const store = await getHostLocalStorage();
    if (!store) return { status: "skip", summary: "Host storage is not available." };
    let prev: Install | null = null;
    try {
      prev = (await store.readJSON(INSTALL)) as Install | null;
    } catch {
      // A missing key can surface as a parse error of "" rather than null.
    }
    const marker: Install = prev?.id ? prev : { id: hex(randomBytes(4)), firstSeen: Date.now(), runs: [] };
    marker.runs.push({ at: Date.now(), build: __BUILD_ID__ });
    await store.writeJSON(INSTALL, marker);
    return prev?.id
      ? {
          status: "pass",
          summary: `Survived. Marker ${marker.id}, first saved ${day(marker.firstSeen)}, seen on ${marker.runs.length} runs.`,
          data: { marker },
        }
      : {
          status: "info",
          summary: `No earlier marker — created ${marker.id}. If this phone ran the probe before, that data did not survive.`,
          data: { marker },
        };
  },
};

export const capacity: Check = {
  id: "P1b",
  title: "How much fits in one saved record?",
  decides: "How almanac splits its data into records (one per month is the plan).",
  needsHost: true,
  async run({ log }) {
    const store = await getHostLocalStorage();
    if (!store) return { status: "skip", summary: "Host storage is not available." };
    const results: Record<string, string> = {};
    let largest = 0;
    try {
      for (const size of [64, 256, 1024, 4096].map((k) => k * 1024)) {
        const bytes = randomBytes(size);
        const want = hex(blake2b256(bytes));
        const t0 = performance.now();
        try {
          await withTimeout(store.writeBytes(CAPACITY, bytes), 30_000, "write");
          const back = await withTimeout(store.readBytes(CAPACITY), 30_000, "read");
          const same = back?.length === size && hex(blake2b256(back)) === want;
          results[kib(size)] = same ? `ok in ${since(t0)} ms` : `read back ${back?.length ?? "nothing"} bytes — mismatch`;
          log(`${kib(size)}: ${results[kib(size)]}`);
          if (!same) break;
          largest = size;
        } catch (e) {
          results[kib(size)] = `failed — ${errText(e)}`;
          break;
        }
      }
    } finally {
      await store.clear(CAPACITY).catch(() => {});
    }
    return largest
      ? { status: "pass", summary: `Stored and read back up to ${kib(largest)} in one record.`, data: results }
      : { status: "fail", summary: "Could not store even 64 KiB in one record.", data: results };
  },
};
