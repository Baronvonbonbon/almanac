import { blake2b } from "@noble/hashes/blake2b";
import { sha256 } from "@noble/hashes/sha2";
import { xchachaEncryptPacked } from "@parity/product-sdk-crypto";
import { formatHostError, fromHex, getPreimageManager, requestPermission } from "@parity/product-sdk-host";
import { CID } from "multiformats/cid";
import { create as createDigest } from "multiformats/hashes/digest";
import { AccountId, createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws";
import { getApp, requestBulletinAllowance } from "../app";
import type { Check } from "../types";
import { errText, hex, kib, randomBytes, short, since, withTimeout } from "../util";

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

/** Where an upload landed, and whose quota paid for it. */
interface Payment {
  block: number;
  signer: string | null;
  /** The signer's authorization, read after the upload was charged to it. */
  quota: string | null;
}

/**
 * The account that signed extrinsic `index` in `block`.
 *
 * Only the address is wanted, so this reads the envelope rather than decoding the call: a compact
 * length, then the version byte (the high bit marks a signed extrinsic), then a MultiAddress whose
 * `0x00` variant is a 32-byte account id.
 */
function signerOf(extrinsic: string): string | null {
  const bytes = fromHex(extrinsic as `0x${string}`);
  const mode = bytes[0] & 0b11;
  const offset = mode === 0 ? 1 : mode === 1 ? 2 : mode === 2 ? 4 : 1 + (bytes[0] >> 2) + 4;
  if (!(bytes[offset] & 0x80) || bytes[offset + 1] !== 0) return null; // unsigned, or not an account id
  return AccountId(42).dec(bytes.slice(offset + 2, offset + 34));
}

/**
 * Wait for the upload to appear on chain, then name the account whose quota paid.
 *
 * `submit()` returns as soon as the host holds the bytes, and a lookup can be answered from the
 * host's own copy — so both succeed before the chain has seen anything. The first version of this
 * check compared authorizations straight afterwards, saw nothing move, and reported that no account
 * had paid; the transaction was in a block moments later, charged to a slot account whose counters
 * had not moved yet when it looked (2026-09-16). So this asks the chain where the upload is, and
 * only then reads the payer.
 */
async function whoPaid(contentHash: `0x${string}`, ms: number): Promise<Payment | null> {
  const client = createClient(getWsProvider(BULLETIN_RPCS));
  const deadline = Date.now() + ms;
  try {
    const api = client.getUnsafeApi();
    while (Date.now() < deadline) {
      const at = (await withTimeout(
        api.query.TransactionStorage.TransactionByContentHash.getValue(contentHash),
        30_000,
        "stored",
      )) as [number, number] | undefined;
      if (at) {
        const [block, index] = at;
        const hash = await client._request<string, [number]>("chain_getBlockHash", [block]);
        const body = await client._request<{ block: { extrinsics: string[] } }, [string]>("chain_getBlock", [hash]);
        const raw = body?.block?.extrinsics?.[index];
        const signer = raw ? signerOf(raw) : null;
        let quota: string | null = null;
        if (signer) {
          // The runtime API is untyped here, and the chain mixes the two: transaction counts come
          // back as numbers, byte counts as bigints. Everything goes through Number().
          const auth = (await withTimeout(
            api.apis.BulletinTransactionStorageApi.account_authorization(signer),
            30_000,
            "authorization",
          )) as { extent: Record<string, bigint | number>; expiration: bigint | number } | undefined;
          quota = auth
            ? `${Number(auth.extent.transactions)} of ${Number(auth.extent.transactions_allowance)} transactions and ${Number(auth.extent.bytes)} of ${Number(auth.extent.bytes_allowance)} bytes used, expiring at block ${Number(auth.expiration)}`
            : "no authorization";
        }
        return { block, signer, quota };
      }
      await new Promise((r) => setTimeout(r, 6_000)); // one Bulletin block
    }
    return null;
  } finally {
    client.destroy();
  }
}

/** The host answers a lookup with a subscription that reports null until it finds the bytes. */
function lookupPreimage(
  manager: NonNullable<Awaited<ReturnType<typeof getPreimageManager>>>,
  key: `0x${string}`,
  ms: number,
): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    let done = false;
    let sub: { unsubscribe(): void } | undefined;
    const finish = (v: Uint8Array | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        sub?.unsubscribe();
      } catch {
        /* already gone */
      }
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), ms);
    try {
      sub = manager.lookup(key, (bytes) => bytes && finish(bytes));
    } catch {
      finish(null);
    }
  });
}

/** Small on purpose: this asks whether the path works at all, not how much it carries. */
const PREIMAGE_BYTES = 256;

export const preimageSubmit: Check = {
  id: "P6b",
  title: "Can the host put a small file on Bulletin for us?",
  decides: "Whether backups (Phase 4) and shares (Phase 5) have any upload path, and which account pays for it.",
  needsHost: true,
  steps: [
    "Approve the storage request on your phone if one appears. This stores 256 bytes of test data.",
    "It can be slow — the same call took 64 seconds on Polkadot Desktop. Give it three minutes.",
  ],
  async run({ journal, log }) {
    // P6 showed that the SDK's cloud storage signs with the product account, which holds no
    // authorization, so every upload is refused as Invalid: Payment. The allowance itself lands on a
    // slot account only the host can sign with — and `getPreimageManager().submit()` is the one call
    // that asks the host to sign. So: ask for the allowance, then try the host's own upload path.
    const allowance = await requestBulletinAllowance(log);

    const permission = await withTimeout(
      requestPermission({ tag: "PreimageSubmit", value: undefined }),
      120_000,
      "permission",
    );
    const permissionText = permission.ok
      ? permission.value
        ? "granted"
        : "denied"
      : `unreadable — ${formatHostError(permission.error)}`;
    log(`PreimageSubmit: ${permissionText}`);

    const manager = await getPreimageManager();
    if (!manager) return { status: "skip", summary: "The host offers no preimage manager to this product." };

    // Encrypted random bytes under a key that is thrown away, the same shape P6 uploads: nothing
    // readable leaves the phone. XChaCha adds 24 bytes of nonce and 16 of tag.
    const payload = xchachaEncryptPacked(randomBytes(PREIMAGE_BYTES - 40), randomBytes(32));

    const t0 = performance.now();
    let key: `0x${string}`;
    try {
      key = (await withTimeout(manager.submit(payload), 180_000, "submit")) as `0x${string}`;
    } catch (e) {
      return {
        status: "fail",
        summary: `The host would not store ${PREIMAGE_BYTES} bytes — ${errText(e)}`,
        data: { allowance, permission: permissionText, error: errText(e) },
      };
    }
    const ms = since(t0);
    log(`submitted in ${ms} ms — ${key}`);

    // The key should be the content hash. If it is BLAKE2b-256 of what we sent, the CID is the kind
    // P7 already knows how to follow, so this upload joins the retention test.
    const digest = fromHex(key);
    const isBlake2b = digest.length === 32 && hex(digest) === hex(blake2b(payload, { dkLen: 32 }));
    const cid = isBlake2b ? CID.createV1(0x55, createDigest(0xb220, digest)).toString() : null;
    if (cid) await journal.addUpload({ cid, bytes: payload.length, at: Date.now(), build: __BUILD_ID__ });

    const back = await lookupPreimage(manager, key, 60_000);
    const identical = back?.length === payload.length && back.every((b, i) => b === payload[i]);
    const readBack = back
      ? identical
        ? `identical ${back.length} bytes back`
        : `different bytes back (${back.length} of ${payload.length})`
      : "not found within 60 s";
    log(`read back: ${readBack}`);

    // Who paid. The host never says which account it signs with, so this waits for the upload to
    // reach a block and reads the signer off the transaction that carried it.
    const paid = await whoPaid(key, 120_000).catch((e) => {
      log(`payer: unreadable — ${errText(e)}`);
      return null;
    });
    if (paid) log(`paid by ${paid.signer ? short(paid.signer) : "an unsigned transaction"} in block ${paid.block}`);

    const paidBy = !paid
      ? "It had not reached a block within two minutes, so the paying account is still unknown."
      : paid.signer
        ? `Paid in block ${paid.block} by ${short(paid.signer)} — ${paid.quota}.`
        : `Stored in block ${paid.block} by an unsigned transaction, so no account paid.`;

    return {
      status: identical ? "pass" : "info",
      summary: `Stored ${PREIMAGE_BYTES} bytes in ${ms} ms, ${readBack}. ${paidBy}`,
      data: {
        allowance,
        permission: permissionText,
        key,
        cid,
        blake2b: isBlake2b,
        ms,
        readBack,
        block: paid?.block ?? null,
        payer: paid?.signer ?? null,
        payerQuota: paid?.quota ?? null,
      },
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
    "Run P6 or P6b once to leave uploads behind — or paste a CID that is on Bulletin.",
    "Run this every few days for at least three weeks.",
  ],
  input: { label: "Another CID to check (optional)", placeholder: "bafy…" },
  async run({ journal, input }) {
    const targets = [...journal.uploads()];
    if (input.trim()) targets.push({ cid: input.trim(), bytes: 0, at: 0, build: "typed in" });
    if (!targets.length) return { status: "skip", summary: "Nothing uploaded yet — run P6 or P6b first, or paste a CID." };

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
