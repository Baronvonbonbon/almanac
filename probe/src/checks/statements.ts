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

const DAY = 24 * 3600;

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

/** Everything a subscription delivers on `topic` within `ms` — including, if the store sends them, statements that already exist. */
async function snapshot(store: HostStatementStore, topic: Hex, ms: number) {
  const watcher = watch(store, topic);
  await new Promise((r) => setTimeout(r, ms));
  watcher.stop();
  return watcher.seen;
}

const listed = (seen: { data?: string }[]) => (seen.length ? seen.map((s) => s.data ?? "?").join(", ") : "nothing delivered");

// The first version of this check (2026-09-13) ran a TTL ladder first. It showed 90 days is accepted,
// but its 30- and 90-day statements filled the account, and everything after them was refused as
// AccountFull: a full account takes a new statement only if it outlives the shortest one it holds.
// So this version writes only statements that outlive anything earlier runs left, and learns the
// capacity by watching what gets pushed out.
export const statementLimits: Check = {
  id: "P9a",
  title: "Can a statement be replaced, and what happens when an account is full?",
  decides: "Whether stopping a share can work by replacing a statement, and how much one account can hold.",
  needsHost: true,
  steps: [
    "Approve any request on your phone.",
    "This leaves one small test statement that lives about 90 days, replacing the probe's earlier ones as room is needed.",
  ],
  async run({ journal, log }) {
    const store = await openStore(log);
    if (!store) return { status: "skip", summary: "The host offers no statement store to this product." };
    const previous = journal
      .entries("P9a")
      .map((e) => e.data?.topic)
      .filter((t): t is Hex => typeof t === "string" && t.startsWith("0x"))
      .at(-1);
    const topic = toHex(randomBytes(32)) as Hex; // fresh per run, so earlier runs cannot be mistaken for this one
    const results: Record<string, string> = {};
    let signer: string | null = null;

    // 1. What earlier runs left on this account — if a subscription delivers statements that already exist.
    const before = previous ? await snapshot(store, previous, 6_000) : [];
    if (previous) results["earlier statements, before"] = listed(before);

    // 2. A, then B, on one channel. Both outlive anything an earlier run left, so neither is refused
    //    for being shorter-lived; B's sequence number is higher.
    const expiry = (seq: number) => (BigInt(Math.floor(Date.now() / 1000) + 90 * DAY + 3600) << 32n) | BigInt(seq);
    for (const [value, seq] of [["A", 1], ["B", 2]] as const) {
      try {
        signer = await publish(store, {
          topics: [topic],
          channel: channel("lww/v2"),
          expiry: expiry(seq),
          data: toHex(utf8(`lww ${value}`)) as Hex,
        });
        results[`write ${value}`] = "accepted";
      } catch (e) {
        results[`write ${value}`] = `refused — ${errText(e)}`;
      }
      log(`write ${value}: ${results[`write ${value}`]}`);
    }

    // 3. A fresh subscription after both writes: only B should be left.
    const now = await snapshot(store, topic, 8_000);
    const values = now.map((s) => s.data);
    results["this run, read back"] = listed(now);

    // 4. Earlier statements that are gone now were pushed out to make room.
    const after = previous ? await snapshot(store, previous, 6_000) : [];
    if (previous) results["earlier statements, after"] = listed(after);

    const replacement = values.includes("lww B")
      ? values.includes("lww A")
        ? "did not remove A"
        : "worked (only B is left)"
      : "could not be observed";
    const pushedOut = before.length - after.length;
    const room = previous
      ? before.length
        ? ` ${pushedOut} of ${before.length} earlier statements were pushed out to make room; ${after.length + (values.length ? 1 : 0)} were delivered back (what a subscription returns, which may be less than the account holds).`
        : " A subscription delivered none of the earlier statements, so either none are left or subscriptions only deliver new ones."
      : "";
    return {
      status: "info",
      summary: `Replacement ${replacement}.${room}`,
      data: { signer, topic, previousTopic: previous ?? null, results },
    };
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
