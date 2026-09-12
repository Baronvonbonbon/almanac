import { blake2b256 } from "@parity/product-sdk-crypto";
import {
  createProofAuthorized,
  formatHostError,
  fromHex,
  getStatementStore,
  requestResourceAllocation,
  toHex,
  type HostStatementStore,
} from "@parity/product-sdk-host";
import type { Check } from "../types";
import { errText, randomBytes, utf8, withTimeout } from "../util";

type Statement = Parameters<typeof createProofAuthorized>[0];
type Hex = Statement["topics"][number];

const HOUR = 3600;
const DAY = 24 * HOUR;
const TTLS: [string, number][] = [
  ["1 hour", HOUR],
  ["1 day", DAY],
  ["7 days", 7 * DAY],
  ["30 days", 30 * DAY],
  ["90 days", 90 * DAY],
];

const hash = (s: string): Hex => toHex(blake2b256(utf8(s))) as Hex;

// Channels are fixed across runs on purpose. A statement replaces the same account's earlier one on
// the same channel, so re-running the probe replaces its old statements instead of piling them up
// against the ~1 KiB per-account budget — a 90-day statement would otherwise hold its bytes for 90 days.
const channel = (name: string): Hex => hash(`almanac-probe/${name}`);

/** product-sdk-statement-store documents expiry as (unix seconds << 32) | sequence. */
const expiryIn = (ttlSeconds: number, seq: number): bigint =>
  (BigInt(Math.floor(Date.now() / 1000) + ttlSeconds) << 32n) | BigInt(seq);

async function openStore(log: (line: string) => void): Promise<HostStatementStore | null> {
  const store = await getStatementStore();
  if (!store) return null;
  const r = await withTimeout(requestResourceAllocation([{ tag: "StatementStoreAllowance" }]), 150_000, "allowance");
  log(`allowance: ${r.ok ? JSON.stringify(r.value) : formatHostError(r.error)}`);
  return store;
}

/** Sign through the host's sponsored path and submit. Returns the signer the proof names. */
async function publish(store: HostStatementStore, statement: Statement): Promise<string> {
  const proof = await withTimeout(createProofAuthorized(statement), 120_000, "proof");
  if (!proof.ok) throw new Error(formatHostError(proof.error));
  await withTimeout(store.submit({ ...statement, proof: proof.value }), 60_000, "submit");
  return proof.value.tag === "Sr25519" ? proof.value.value.signer : proof.value.tag;
}

function watch(store: HostStatementStore, topic: Hex) {
  const seen: { channel?: string; data?: string; signer?: string }[] = [];
  const sub = store.subscribe({ matchAll: [topic] }, (page) => {
    for (const s of page.statements) {
      seen.push({
        channel: s.channel,
        data: s.data ? new TextDecoder().decode(fromHex(s.data)).slice(0, 80) : undefined,
        signer: s.proof.tag === "Sr25519" ? s.proof.value.signer : s.proof.tag,
      });
    }
  });
  return { seen, stop: () => sub.unsubscribe() };
}

export const statementLimits: Check = {
  id: "P9a",
  title: "How long can a statement live, can it be replaced, and how much can one account hold?",
  decides:
    "Whether stopping a share can work by replacing a statement, and whether the backup pointer can live long enough.",
  needsHost: true,
  steps: ["Approve any request on your phone. This publishes a few small test statements."],
  async run({ log }) {
    const store = await openStore(log);
    if (!store) return { status: "skip", summary: "The host offers no statement store to this product." };
    const topic = toHex(randomBytes(32)) as Hex; // fresh per run, so earlier runs cannot be mistaken for this one
    const watcher = watch(store, topic);
    const results: Record<string, string> = {};
    let seq = 0;
    let signer: string | null = null;

    try {
      // 1. TTL ladder — small payloads, one channel per TTL so they do not replace each other.
      let longest = "none";
      for (const [label, ttl] of TTLS) {
        try {
          signer = await publish(store, {
            topics: [topic],
            channel: channel(`ttl/${ttl}`),
            expiry: expiryIn(ttl, seq++),
            data: toHex(utf8(`ttl ${label}`)) as Hex,
          });
          results[`TTL ${label}`] = "accepted";
          longest = label;
        } catch (e) {
          results[`TTL ${label}`] = `refused — ${errText(e)}`;
        }
        log(`TTL ${label}: ${results[`TTL ${label}`]}`);
      }

      // 2. Last-write-wins: A then B on one channel. Only B should remain.
      for (const value of ["A", "B"]) {
        try {
          await publish(store, {
            topics: [topic],
            channel: channel("lww"),
            expiry: expiryIn(HOUR, seq++),
            data: toHex(utf8(`lww ${value}`)) as Hex,
          });
          results[`channel write ${value}`] = "accepted";
        } catch (e) {
          results[`channel write ${value}`] = `refused — ${errText(e)}`;
        }
      }

      // 3. Quota — 400-byte statements with a short TTL until the store refuses.
      let accepted = 0;
      for (let i = 0; i < 6; i++) {
        try {
          await publish(store, {
            topics: [topic],
            channel: channel(`quota/${i}`),
            expiry: expiryIn(HOUR, seq++),
            data: toHex(randomBytes(400)) as Hex,
          });
          accepted++;
        } catch (e) {
          results[`quota: statement ${i + 1}`] = `refused — ${errText(e)}`;
          break;
        }
      }
      results["quota: 400-byte statements accepted"] = String(accepted);

      await new Promise((r) => setTimeout(r, 8_000));
      const lww = watcher.seen.filter((s) => s.channel === channel("lww")).map((s) => s.data);
      results["channel: values seen"] = lww.length ? lww.join(", ") : "none delivered";
      results["statements delivered back"] = String(watcher.seen.length);

      const replaced = lww.length > 0 && !lww.includes("lww A");
      return {
        status: "info",
        summary: `Longest TTL accepted: ${longest}. Replacement ${replaced ? "worked (only B seen)" : lww.length ? "did not remove A" : "could not be observed"}. ${accepted} × 400-byte statements fit.`,
        data: { signer, topic, results },
      };
    } finally {
      watcher.stop();
    }
  },
};

const pairTopic = (code: string): Hex => hash(`almanac-probe/pair/${code.trim().toLowerCase()}`);

export const send: Check = {
  id: "P9b",
  title: "Send a message another phone can find (phone A)",
  decides: "Whether shares and the backup pointer can be found from a different phone and account.",
  needsHost: true,
  input: { label: "Shared code", placeholder: "e.g. blue-otter-42 — use the same code on both phones" },
  steps: ["Pick any code, type it on both phones.", "Run this on phone A, then run P9c on phone B."],
  async run({ input, log }) {
    if (!input.trim()) return { status: "skip", summary: "Type a shared code first." };
    const store = await openStore(log);
    if (!store) return { status: "skip", summary: "The host offers no statement store to this product." };
    const signer = await publish(store, {
      topics: [pairTopic(input)],
      channel: channel("pair"),
      expiry: expiryIn(DAY, 0),
      data: toHex(utf8(`hello from ${__BUILD_ID__} at ${new Date().toISOString()}`)) as Hex,
    });
    return { status: "pass", summary: "Sent. Now run P9c on the other phone with the same code.", data: { signer } };
  },
};

export const listen: Check = {
  id: "P9c",
  title: "Find the message from the other phone (phone B)",
  decides: "Whether shares and the backup pointer can be found from a different phone and account.",
  needsHost: true,
  input: { label: "Shared code", placeholder: "the same code you typed on phone A" },
  async run({ input }) {
    if (!input.trim()) return { status: "skip", summary: "Type the shared code first." };
    const store = await getStatementStore();
    if (!store) return { status: "skip", summary: "The host offers no statement store to this product." };
    const watcher = watch(store, pairTopic(input));
    await new Promise((r) => setTimeout(r, 20_000));
    watcher.stop();
    return watcher.seen.length
      ? { status: "pass", summary: `Found ${watcher.seen.length}: “${watcher.seen.at(-1)?.data}”.`, data: { seen: watcher.seen } }
      : { status: "fail", summary: "Nothing arrived in 20 seconds." };
  },
};
