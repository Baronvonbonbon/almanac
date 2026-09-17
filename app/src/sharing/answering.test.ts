import { describe, expect, it } from "vitest";
import { saveDay } from "../data";
import { fromHex, hex, text, utf8 } from "../lib/bytes";
import { memoryHost, MemoryBlobs, MemoryStatements, type StatementPort } from "../platform";
import {
  decodeSelection,
  ENTRY_BYTES,
  newKeyPair,
  newShare,
  openEntry,
  openStored,
  packSlots,
  pairingCode,
  readPairingCode,
  readShare,
  REQUEST_BYTES,
  REQUESTS_CHANNEL,
  sealRequest,
  sealShare,
  SHARING_CHANNEL,
  slots,
  STATEMENT_BYTES,
  topicsFor,
  unmaskShareKey,
  type Approval,
  type KeyPair,
  type ReceivedShare,
} from "../share";
import { demoPairing } from "../share/testing";
import { Vault, type KdfParams } from "../vault";
import { answer, listenForRequests } from "./answering";
import { sendIfDue, sendSharing, sharingStatement } from "./outbox";
import { addShare, readShares, setOnlineOk, shareRecord, stopShare, type ShareChoice } from "./records";
import type { ShareRequest } from "./useShareRequests";

const FAST: KdfParams = { N: 2 ** 10, r: 8, p: 1 };
const NOW = Date.UTC(2026, 8, 15, 9, 30);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const CHOICE: ShareChoice = { categories: ["periods"], from: "2026-03-15", to: "2026-09-15" };
const flush = () => new Promise((r) => setTimeout(r, 0));

type Almanac = { store: MemoryStatements; host: ReturnType<typeof memoryHost>; vault: Vault };
interface Provider {
  port: StatementPort;
  received: ReceivedShare;
  id: string;
}

/** almanac, with a statement store it shares with the provider apps. */
async function almanac(store = new MemoryStatements(() => NOW), port: StatementPort = store.port("almanac")): Promise<Almanac> {
  const host = memoryHost("almanac", undefined, port);
  return { store, host, vault: await Vault.create(host, FAST) };
}

/** almanac with somewhere to put a blob, and — unless `agreed` is false — the patient's word for it. */
async function online(agreed = true): Promise<Almanac & { blobs: MemoryBlobs }> {
  const store = new MemoryStatements(() => NOW);
  const blobs = new MemoryBlobs();
  const host = memoryHost("almanac", undefined, store.port("almanac"), blobs);
  const vault = await Vault.create(host, FAST);
  if (agreed) await setOnlineOk(vault, NOW);
  await saveDay(vault, { date: "2026-09-01", flow: "heavy", updatedAt: 1 });
  return { store, host, vault, blobs };
}

/** A visit: almanac shares with a provider app, which keeps what it read from the codes. */
async function visit(a: Almanac, name: string): Promise<Provider> {
  const provider = newKeyPair();
  const pairing = readPairingCode(pairingCode(demoPairing({ providerKey: provider.publicKey, firstOpeningKey: newKeyPair().publicKey, name })));
  const share = newShare(NOW + 7 * DAY, utf8(`shared with ${name}`));
  const bytes = sealShare(share, pairing, NOW + 15 * MINUTE);
  await addShare(a.vault, shareRecord(share, pairing, CHOICE, NOW, NOW + 15 * MINUTE));
  return { port: a.store.port(name), received: readShare(bytes, provider), id: hex(share.id) };
}

/** The provider app asks to open its share again, a new key for each ask; its requests statement is replaced whole. */
async function ask(p: Provider, asked: number[]): Promise<KeyPair[]> {
  const openings = asked.map(() => newKeyPair());
  const sealed = openings.map((o, i) => sealRequest(p.received.pair, p.received.header.id, o.publicKey, asked[i]));
  await p.port.publish({ channel: REQUESTS_CHANNEL, topics: topicsFor([p.received.pair.requestTopic]), data: packSlots(sealed, REQUEST_BYTES), expires: NOW + DAY });
  return openings;
}

/** What almanac finds waiting as it opens. */
async function waitingIn(a: Almanac): Promise<ShareRequest[]> {
  let seen: ShareRequest[] = [];
  const stop = listenForRequests(a.host, await readShares(a.vault), (w) => (seen = w), () => NOW);
  await flush();
  stop();
  return seen;
}

/** What a provider app hears on its answer topic: the entries in almanac's statement sealed for it. */
async function hears(p: Provider) {
  const statements: Uint8Array[] = [];
  const stop = p.port.listen([p.received.pair.answerTopic], (data) => statements.push(data));
  await flush();
  stop();
  return statements.flatMap((data) => slots(data, ENTRY_BYTES).flatMap((slot) => openEntry(p.received.pair, slot) ?? []));
}

describe("a provider app asks, the patient answers", () => {
  it("a request waits for the patient, and Allow opens the share for as long as they chose", async () => {
    const a = await almanac();
    const p = await visit(a, "Dr Okafor");
    const [opening] = await ask(p, [NOW - 3 * HOUR]);
    const waiting = await waitingIn(a);
    expect(waiting).toEqual([{ id: p.id, name: "Dr Okafor", asked: NOW - 3 * HOUR, key: hex(opening.publicKey), keys: [hex(opening.publicKey)] }]);

    expect(await answer(a.host, a.vault, waiting[0], "hour", NOW)).toBe(NOW + HOUR);
    const heard = await hears(p);
    expect(heard).toMatchObject([{ kind: "approval", until: NOW + HOUR }]);
    const shareKey = unmaskShareKey(heard[0] as Approval, opening, p.received.header.senderKey);
    expect(text(openStored(p.received.stored, shareKey).payload)).toBe("shared with Dr Okafor");

    // In the sharing history, and not asked about again.
    expect((await readShares(a.vault))[0].openings.at(-1)).toEqual({ at: NOW, until: NOW + HOUR, key: hex(opening.publicKey) });
    expect(await waitingIn(a)).toEqual([]);
  });

  it("an approval opens nothing for anyone else: not another provider, not another opening", async () => {
    const a = await almanac();
    const okafor = await visit(a, "Dr Okafor");
    const riverside = await visit(a, "Riverside Midwives");
    await ask(okafor, [NOW - HOUR]);
    await answer(a.host, a.vault, (await waitingIn(a))[0], "quarter", NOW);
    // The other provider app hears nothing on its topic, and could open nothing in the statement if it did.
    expect(await hears(riverside)).toEqual([]);
    const statement = a.store.heldBy("almanac", SHARING_CHANNEL)!;
    expect(slots(statement.data, ENTRY_BYTES).map((slot) => openEntry(riverside.received.pair, slot))).toEqual([null, null, null]);
    // The approval takes the key the provider app asked with, and no other: another is refused, and even
    // passed off as the one asked with, it unmasks nothing that opens the share.
    const [approval] = (await hears(okafor)) as Approval[];
    const stranger = newKeyPair();
    expect(() => unmaskShareKey(approval, stranger, okafor.received.header.senderKey)).toThrow("another opening");
    const wrong = unmaskShareKey({ ...approval, openingKey: stranger.publicKey }, stranger, okafor.received.header.senderKey);
    expect(() => openStored(okafor.received.stored, wrong)).toThrow();
  });

  it("Not now sends nothing, and that request isn't asked about again — a new one is", async () => {
    const a = await almanac();
    const p = await visit(a, "Dr Okafor");
    await ask(p, [NOW - HOUR]);
    expect(await answer(a.host, a.vault, (await waitingIn(a))[0], null, NOW)).toBeNull();
    expect(a.store.heldBy("almanac", SHARING_CHANNEL)).toBeUndefined();
    expect(await waitingIn(a)).toEqual([]);
    const [again] = await ask(p, [NOW]);
    expect((await waitingIn(a)).map((r) => r.key)).toEqual([hex(again.publicKey)]);
  });

  it("several asks for one share wait as one, and one answer settles them all", async () => {
    const a = await almanac();
    const p = await visit(a, "Dr Okafor");
    const [older, newer] = await ask(p, [NOW - DAY, NOW - HOUR]);
    const waiting = await waitingIn(a);
    expect(waiting).toHaveLength(1);
    expect(waiting[0]).toMatchObject({ asked: NOW - HOUR, key: hex(newer.publicKey) });
    expect([...waiting[0].keys].sort()).toEqual([hex(older.publicKey), hex(newer.publicKey)].sort());
    await answer(a.host, a.vault, waiting[0], "quarter", NOW);
    expect(await waitingIn(a)).toEqual([]);
    expect(((await hears(p))[0] as Approval).openingKey).toEqual(newer.publicKey);
  });

  it("Stop sharing tells the provider app, and no opening can be allowed after it", async () => {
    const a = await almanac();
    const p = await visit(a, "Dr Okafor");
    await ask(p, [NOW - HOUR]);
    await answer(a.host, a.vault, (await waitingIn(a))[0], "day", NOW);
    await stopShare(a.vault, p.id, NOW + MINUTE);
    expect(await sendSharing(a.host, a.vault, NOW + MINUTE)).toBe(true);
    // The stop replaces the approval: the key that opened it is gone.
    expect(await hears(p)).toEqual([{ kind: "stop", share: p.received.header.id, at: NOW + MINUTE }]);
    await ask(p, [NOW + 2 * MINUTE]);
    expect(await waitingIn(a)).toEqual([]);
  });

  it("the statement is always 512 bytes on four topics, three entries at most — approvals first", async () => {
    const a = await almanac();
    const providers: Provider[] = [];
    for (const name of ["Dr A", "Dr B", "Dr C", "Dr D", "Dr E"]) providers.push(await visit(a, name));
    for (const [i, p] of providers.slice(0, 4).entries()) {
      await ask(p, [NOW]);
      await answer(a.host, a.vault, (await waitingIn(a)).find((r) => r.id === p.id)!, "hour", NOW + i * MINUTE);
    }
    await stopShare(a.vault, providers[4].id, NOW + 10 * MINUTE);

    const entriesFor = (data: Uint8Array) => providers.map((p) => slots(data, ENTRY_BYTES).flatMap((slot) => openEntry(p.received.pair, slot) ?? []).map((e) => e.kind));
    const full = sharingStatement(await readShares(a.vault), NOW + 10 * MINUTE);
    expect(full.data).toHaveLength(STATEMENT_BYTES);
    // Three real topics, filled out to four with random ones, so the count says nothing.
    expect(full.topics).toHaveLength(4);
    const carried = new Set(full.topics.map(hex));
    for (const p of providers.slice(1, 4)) expect(carried.has(hex(p.received.pair.answerTopic))).toBe(true);
    // Three open approvals fill it, where four did before an approval carried a CID: the oldest
    // opening is squeezed out, and the stop still waits — neither share can be opened meanwhile.
    expect(entriesFor(full.data)).toEqual([[], ["approval"], ["approval"], ["approval"], []]);
    const later = sharingStatement(await readShares(a.vault), NOW + 2 * HOUR);
    expect(later.data).toHaveLength(STATEMENT_BYTES);
    expect(later.topics).toHaveLength(4);
    expect(entriesFor(later.data)).toEqual([[], [], [], [], ["stop"]]);
  });

  it("a change that couldn't go out goes the next time almanac opens", async () => {
    const store = new MemoryStatements(() => NOW);
    const port = store.port("almanac");
    let online = false;
    const a = await almanac(store, { listen: port.listen, publish: (s) => (online ? port.publish(s) : Promise.reject(new Error("offline"))) });
    const p = await visit(a, "Dr Okafor");
    await stopShare(a.vault, p.id, NOW);
    await expect(sendSharing(a.host, a.vault, NOW)).rejects.toThrow("offline");
    online = true;
    expect(await sendIfDue(a.host, a.vault, NOW + HOUR)).toBe(true);
    expect(await hears(p)).toMatchObject([{ kind: "stop" }]);
    expect(await sendIfDue(a.host, a.vault, NOW + HOUR)).toBe(false);
  });

  it("with the patient's word for it, a later opening carries a blob of its own, under a key of its own", async () => {
    const a = await online();
    const p = await visit(a, "Dr Okafor");
    const [opening] = await ask(p, [NOW - HOUR]);
    expect(await answer(a.host, a.vault, (await waitingIn(a))[0], "hour", NOW)).toBe(NOW + HOUR);

    // One upload, padded to a bucket, so its size says nothing about how much was logged.
    expect(a.blobs.sizes()).toEqual([2048]);
    const kept = (await readShares(a.vault))[0];
    const last = kept.openings.at(-1)!;
    // A key of its own, never the share's: this is what makes stopping withhold the next one (§9).
    expect(last.payloadKey).toBeDefined();
    expect(last.payloadKey).not.toBe(kept.shareKey);

    // The provider opens the blob the approval names, and reads what was logged since the visit.
    const [approval] = (await hears(p)) as Approval[];
    expect(hex(approval.cid)).toBe(last.cid);
    const key = unmaskShareKey(approval, opening, p.received.header.senderKey);
    const blob = (await a.blobs.get(approval.cid))!;
    expect((await decodeSelection(openStored(blob, key).payload)).days).toMatchObject({ "2026-09-01": { flow: "heavy" } });
  });

  it("a key from one opening opens that upload and no other", async () => {
    const a = await online();
    const p = await visit(a, "Dr Okafor");
    await ask(p, [NOW - HOUR]);
    await answer(a.host, a.vault, (await waitingIn(a))[0], "hour", NOW);
    await ask(p, [NOW + MINUTE]);
    await answer(a.host, a.vault, (await waitingIn(a))[0], "hour", NOW + MINUTE);

    const uploads = (await readShares(a.vault))[0].openings.filter((o) => o.cid);
    expect(uploads).toHaveLength(2);
    const [one, two] = uploads;
    expect(one.payloadKey).not.toBe(two.payloadKey);
    // The earlier opening's key does not open the later upload: stopping before it withholds it.
    const later = (await a.blobs.get(fromHex(two.cid!)))!;
    expect(() => openStored(later, fromHex(one.payloadKey!))).toThrow();
  });

  it("nothing goes online until the patient has agreed: the approval opens the copy from the visit", async () => {
    const a = await online(false);
    const p = await visit(a, "Dr Okafor");
    const [opening] = await ask(p, [NOW - HOUR]);
    await answer(a.host, a.vault, (await waitingIn(a))[0], "hour", NOW);

    expect(a.blobs.sizes()).toEqual([]);
    expect((await readShares(a.vault))[0].openings.at(-1)).toEqual({ at: NOW, until: NOW + HOUR, key: hex(opening.publicKey) });
    // NO_CID and the share's own key: exactly what a share carried by codes has always done.
    const [approval] = (await hears(p)) as Approval[];
    expect(approval.cid.every((b) => b === 0)).toBe(true);
    expect(text(openStored(p.received.stored, unmaskShareKey(approval, opening, p.received.header.senderKey)).payload)).toBe("shared with Dr Okafor");
  });

  it("the web tryout has no statement store: nothing is sent, and nothing is heard", async () => {
    const host = memoryHost("tryout");
    const vault = await Vault.create(host, FAST);
    expect(await sendSharing(host, vault, NOW)).toBe(false);
    expect(await sendIfDue(host, vault, NOW)).toBe(false);
    let heard = false;
    listenForRequests(host, await readShares(vault), () => (heard = true))();
    expect(heard).toBe(false);
  });
});
