import { blake2b } from "@noble/hashes/blake2b";
import { sha256 } from "@noble/hashes/sha2";
import { xchachaEncryptPacked } from "@parity/product-sdk-crypto";
import { fromHex } from "@parity/product-sdk-host";
import { CID } from "multiformats/cid";
import { AccountId, createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws";
import { getApp, requestBulletinAllowance } from "../app";
import type { Check } from "../types";
import { errText, kib, randomBytes, short, since, withTimeout } from "../util";

const BULLETIN_RPCS = ["wss://bulletin-paseo.tservices.es:8443", "wss://bullet.sik.rocks"];

/**
 * Bulletin upload authorization for each account, read straight from the chain (the runtime API pad
 * reads). The SDK does not say which account a Bulletin allowance lands on, so this looks.
 */
async function authorizations(accounts: Record<string, string>): Promise<Record<string, string>> {
  const client = createClient(getWsProvider(BULLETIN_RPCS));
  const out: Record<string, string> = {};
  try {
    const api = client.getUnsafeApi();
    for (const [label, address] of Object.entries(accounts)) {
      try {
        const auth = await withTimeout(api.apis.BulletinTransactionStorageApi.account_authorization(address), 30_000, "authorization");
        out[label] = auth
          ? `authorized — ${JSON.stringify(auth, (_, v) => (typeof v === "bigint" ? v.toString() : v))}`
          : "no authorization";
      } catch (e) {
        out[label] = `unreadable — ${errText(e)}`;
      }
    }
  } finally {
    client.destroy();
  }
  return out;
}

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
    // createApp's cloud storage signs with the wallet's selected account.
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

    // On 2026-09-14 every upload was rejected as Invalid: Payment — Bulletin's answer to an account with
    // no authorization — although the allowance came back Allocated. So: which accounts hold one?
    const checked: Record<string, string> = {};
    if (signer) checked["upload signer"] = signer;
    const statementKey = journal.entries("P9a").at(-1)?.data?.signer;
    if (typeof statementKey === "string" && statementKey.startsWith("0x")) {
      checked["statement signer (P9a)"] = AccountId(42).dec(fromHex(statementKey as `0x${string}`));
    }
    const auth = Object.keys(checked).length ? await authorizations(checked) : {};

    const signerAuth = auth["upload signer"] ?? "not checked";
    return {
      status: largest ? "pass" : "fail",
      summary: largest
        ? `Uploaded up to ${kib(largest)}.`
        : `Not even 1 KiB uploaded. The upload signer (${signer ? short(signer) : "none"}) has ${signerAuth.startsWith("authorized") ? "an authorization" : signerAuth}.`,
      data: { allowance, signer, results, authorization: auth },
    };
  },
};

const IPFS_GATEWAY = "https://devnet-ipfs.api.polkadotcommunity.foundation";

/**
 * Whether `block` hashes to `cid`, under the CID's own hash function. pad stores SHA-256 CIDs
 * (bafkrei…) while the SDK's computeCid only makes BLAKE2b-256 ones (bafk2bza…) — so on 2026-09-14
 * the SDK could never have verified a pad upload. `null` when the hash function is neither.
 */
function hashesTo(cid: string, block: Uint8Array): boolean | null {
  let digest: Uint8Array;
  let code: number;
  try {
    ({ code, digest } = CID.parse(cid).multihash);
  } catch {
    return null;
  }
  const actual = code === 0x12 ? sha256(block) : code === 0xb220 ? blake2b(block, { dkLen: 32 }) : null;
  return actual ? actual.length === digest.length && actual.every((b, i) => b === digest[i]) : null;
}

type Fetched = { ok: boolean; text: string };

const verdict = (cid: string, block: Uint8Array, ms: number): Fetched => {
  const v = hashesTo(cid, block);
  return v === false
    ? { ok: false, text: `WRONG BYTES (${block.length} bytes)` }
    : { ok: true, text: `available, ${block.length} bytes in ${ms} ms${v ? ", verified" : ", not verified"}` };
};

/** Through the app: the SDK's cloud storage, which asks the host (a "preimage lookup"). */
async function viaApp(cid: string): Promise<Fetched> {
  const cs = (await getApp()).cloudStorage;
  if (!cs) return { ok: false, text: "no cloud storage in this app build" };
  const t0 = performance.now();
  try {
    const r = await withTimeout(cs.fetch(cid), 90_000, "fetch");
    if (!r.ok) throw new Error(errText(r.error));
    return verdict(cid, r.value, since(t0));
  } catch (e) {
    return { ok: false, text: `gone or unreachable after ${since(t0)} ms — ${errText(e)}` };
  }
}

/** Through the devnet IPFS gateway, asking for the raw block so any CID can be checked against its hash. */
async function viaGateway(cid: string): Promise<Fetched> {
  const t0 = performance.now();
  try {
    const res = await withTimeout(fetch(`${IPFS_GATEWAY}/ipfs/${cid}?format=raw`), 45_000, "fetch");
    if (!res.ok) return { ok: false, text: `HTTP ${res.status} after ${since(t0)} ms` };
    return verdict(cid, new Uint8Array(await res.arrayBuffer()), since(t0));
  } catch (e) {
    return { ok: false, text: `gone or unreachable after ${since(t0)} ms — ${errText(e)}` };
  }
}

export const retention: Check = {
  id: "P7",
  title: "How long does Bulletin keep an upload?",
  decides: "How often almanac backs up, and what the backup status says.",
  needsHost: true,
  steps: [
    "Run P6 once to leave uploads behind — or paste a CID that is on Bulletin.",
    "Run this every few days for at least three weeks.",
  ],
  input: { label: "Another CID to check (optional)", placeholder: "bafy…" },
  async run({ journal, input }) {
    const targets = [...journal.uploads()];
    if (input.trim()) targets.push({ cid: input.trim(), bytes: 0, at: 0, build: "typed in" });
    if (!targets.length) return { status: "skip", summary: "Nothing uploaded yet — run P6 first, or paste a CID." };

    const rows: Record<string, string> = {};
    let alive = 0;
    let viaAppAlive = 0;
    let oldestAlive = -1; // a pasted CID's age is unknown (NaN), and NaN never wins these comparisons
    let youngestGone = Infinity;
    for (const t of targets) {
      const age = t.at ? (Date.now() - t.at) / 86_400_000 : NaN;
      const ageText = Number.isNaN(age) ? "age unknown" : `${age.toFixed(1)} days old`;
      const [app, gateway] = await Promise.all([viaApp(t.cid), viaGateway(t.cid)]);
      rows[t.cid] = `${ageText} — through the app: ${app.text} · through the IPFS gateway: ${gateway.text}`;
      if (app.ok) viaAppAlive++;
      if (app.ok || gateway.ok) {
        alive++;
        if (age > oldestAlive) oldestAlive = age;
      } else if (age < youngestGone) {
        youngestGone = age;
      }
    }
    const oldest = oldestAlive >= 0 ? ` Oldest still available: ${oldestAlive.toFixed(1)} days.` : "";
    const gone = youngestGone < Infinity ? ` Youngest gone: ${youngestGone.toFixed(1)} days.` : "";
    return {
      status: "info",
      summary: `${alive} of ${targets.length} still available (${viaAppAlive} through the app itself).${oldest}${gone}`,
      data: rows,
    };
  },
};
