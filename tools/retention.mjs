#!/usr/bin/env node
// P7 from a desktop: is Bulletin still keeping the test uploads?
//
// While the app holds almanacapp.dot the probe cannot run on the phone, so this carries on the
// retention test through the devnet IPFS gateway — the half of P7 that needs no phone. The other half,
// fetching through the app itself, waits for the probe's next deploy (docs/PROBE-REPORT.md).
//
// Read-only: plain HTTPS GETs, nothing signed. Each block is checked against its CID's own hash —
// SHA-256 for bafkrei…, BLAKE2b-256 for bafk2bza… — so a gateway answering with the wrong bytes reads
// as WRONG BYTES, not as available.
//
// Usage:  npm run retention [-- --json] [-- <cid>@<uploaded, ISO time> …]

import { blake2b } from "@noble/hashes/blake2b.js";
import { sha256 } from "@noble/hashes/sha256.js";

const GATEWAY = "https://devnet-ipfs.api.polkadotcommunity.foundation"; // as the probe's P7 and P10
const TIMEOUT_MS = 45_000;
const DAY = 86_400_000;

/** The uploads P7 follows (docs/PROBE-REPORT.md, "Still to run"). */
const TARGETS = [
  { cid: "bafkreif5zpe5s4ja4kk67benbljh4u5bwynkqfd66prm3p3prkhtuxt2na", at: "2026-09-13T15:11:00Z", what: "18 KB piece of the first probe build, stored by pad (SHA-256)" },
  { cid: "bafk2bzacebowgi5ykjhnh26gioxl4c3nwr5yu5rcw67i6mf3ksn7uhfo3q5ys", at: "2026-09-14T13:56:00Z", what: "79 bytes stored the way the SDK uploads (BLAKE2b-256)" },
];

// A CIDv1 in base32 ("b…"): version, codec, then the multihash — hash code, length, digest.
const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";

function fromBase32(s) {
  const out = [];
  let value = 0;
  let bits = 0;
  for (const c of s) {
    const i = BASE32.indexOf(c);
    if (i < 0) throw new Error(`not base32: "${c}"`);
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
      value &= (1 << bits) - 1;
    }
  }
  return Uint8Array.from(out);
}

function varint(bytes, at) {
  let n = 0;
  for (let shift = 0; ; shift += 7) {
    const b = bytes[at++];
    if (b === undefined) throw new Error("truncated CID");
    n += (b & 0x7f) * 2 ** shift;
    if (b < 0x80) return [n, at];
  }
}

function multihash(cid) {
  if (!cid.startsWith("b")) throw new Error("only base32 CIDs (b…) are read here");
  const bytes = fromBase32(cid.slice(1));
  let at = 0;
  let version, code, length;
  [version, at] = varint(bytes, at);
  if (version !== 1) throw new Error(`CID version ${version}`);
  [, at] = varint(bytes, at); // the codec: raw or dag-pb, either way the hash covers the block
  [code, at] = varint(bytes, at);
  [length, at] = varint(bytes, at);
  return { code, digest: bytes.subarray(at, at + length) };
}

/** true, false, or null when the CID uses a hash this does not know. */
function hashesTo(cid, block) {
  const { code, digest } = multihash(cid);
  const actual = code === 0x12 ? sha256(block) : code === 0xb220 ? blake2b(block, { dkLen: 32 }) : null;
  return actual ? actual.length === digest.length && actual.every((b, i) => b === digest[i]) : null;
}

async function fetchBlock(cid) {
  const t0 = performance.now();
  const ms = () => Math.round(performance.now() - t0);
  try {
    const res = await fetch(`${GATEWAY}/ipfs/${cid}?format=raw`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return { ok: false, text: `HTTP ${res.status} after ${ms()} ms` };
    const block = new Uint8Array(await res.arrayBuffer());
    const verified = hashesTo(cid, block);
    if (verified === false) return { ok: false, text: `WRONG BYTES (${block.length} bytes)` };
    return { ok: true, bytes: block.length, text: `available, ${block.length} bytes in ${ms()} ms${verified ? ", verified" : ", not verified"}` };
  } catch (e) {
    return { ok: false, text: `gone or unreachable after ${ms()} ms — ${e?.name === "TimeoutError" ? "timed out" : (e?.message ?? e)}` };
  }
}

const args = process.argv.slice(2);
const json = args.includes("--json");
const extra = args
  .filter((a) => !a.startsWith("--"))
  .map((a) => {
    const [cid, at] = a.split("@");
    return { cid, at: at ?? null, what: "given on the command line" };
  });
const targets = extra.length ? extra : TARGETS;

const now = Date.now();
const results = [];
for (const t of targets) {
  const uploaded = t.at ? Date.parse(t.at) : NaN;
  const days = (now - uploaded) / DAY;
  results.push({ ...t, checked: new Date(now).toISOString(), days: Number.isNaN(days) ? null : Number(days.toFixed(1)), ...(await fetchBlock(t.cid)) });
}

if (json) {
  for (const r of results) console.log(JSON.stringify(r));
} else {
  console.log(`P7 through the devnet IPFS gateway, ${new Date(now).toISOString().slice(0, 16).replace("T", " ")} UTC\n`);
  for (const r of results) {
    const age = r.days === null ? "age unknown" : `${r.days.toFixed(1)} days old`;
    const day15 = r.at ? new Date(Date.parse(r.at) + 15 * DAY).toISOString().slice(0, 10) : null;
    console.log(`${r.cid}\n  ${r.what}\n  ${age}${day15 ? ` (15 days on ${day15})` : ""} — ${r.text}\n`);
  }
  const alive = results.filter((r) => r.ok);
  const oldest = Math.max(...alive.map((r) => r.days ?? -1));
  const gone = results.filter((r) => !r.ok && r.days !== null).map((r) => r.days);
  console.log(
    `${alive.length} of ${results.length} still available.` +
      (oldest >= 0 ? ` Oldest still available: ${oldest.toFixed(1)} days.` : "") +
      (gone.length ? ` Youngest gone: ${Math.min(...gone).toFixed(1)} days.` : ""),
  );
}
