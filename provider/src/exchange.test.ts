import { describe, expect, it } from "vitest";
import { hex } from "@app/lib/bytes";
import { saveDay } from "@app/data";
import { memoryHost, MemoryBlobs, MemoryStatements } from "@app/platform";
import { encodeSelection, newShare, readPairingCode, REQUEST_BYTES, sealShare, ShareError, slots, STATEMENT_BYTES, toFrames, type Selection } from "@app/share";
import { answer, listenForRequests } from "@app/sharing/answering";
import { sendSharing } from "@app/sharing/outbox";
import { addShare, readShares, setOnlineOk, shareRecord, stopShare } from "@app/sharing/records";
import type { ShareRequest } from "@app/sharing/useShareRequests";
import { demoMe } from "@app/share/testing";
import { Vault, type KdfParams } from "@app/vault";
import { listenForAnswers, type Heard } from "./answers";
import { ask, requestsStatement, TooManyWaiting } from "./asking";
import { nameProblem } from "./me";
import { addPatient, keptPatients, readPatients, setAsking } from "./patients";
import { CodeCollector, newPairing, openSelection, readVisit } from "./visit";

const FAST: KdfParams = { N: 2 ** 10, r: 8, p: 1 };
const NOW = Date.UTC(2026, 8, 15, 9, 30);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const flush = () => new Promise((r) => setTimeout(r, 0));
const SELECTION: Selection = {
  v: 1,
  from: "2026-03-15",
  to: "2026-09-15",
  made: "2026-09-15",
  categories: ["periods", "symptoms"],
  days: { "2026-09-01": { flow: "heavy", symptoms: ["cramps"] } },
  cycles: [{ start: "2026-09-01" }],
};

type Side = { host: ReturnType<typeof memoryHost>; vault: Vault };

/** almanac and the provider app, each with a vault, meeting in one statement store. */
async function both(): Promise<{ store: MemoryStatements; blobs: MemoryBlobs; almanac: Side; provider: Side }> {
  const store = new MemoryStatements(() => NOW);
  // One Bulletin between them, as there is one in the world.
  const blobs = new MemoryBlobs();
  const almanacHost = memoryHost("almanac", undefined, store.port("almanac"), blobs);
  const providerHost = memoryHost("provider", undefined, store.port("provider"), blobs);
  return {
    store,
    blobs,
    almanac: { host: almanacHost, vault: await Vault.create(almanacHost, FAST) },
    provider: { host: providerHost, vault: await Vault.create(providerHost, FAST) },
  };
}

/** At the visit: the provider app shows its code, almanac scans it and makes the share, and shows it as codes. */
async function visit(almanac: Side, name = "Dr Okafor") {
  const pairing = newPairing(demoMe(name));
  const scanned = readPairingCode(pairing.code);
  const share = newShare(NOW + 7 * DAY, await encodeSelection(SELECTION));
  const codes = toFrames(sealShare(share, scanned, NOW + 15 * MINUTE));
  await addShare(almanac.vault, shareRecord(share, scanned, { categories: ["periods", "symptoms"], from: SELECTION.from, to: SELECTION.to }, NOW, NOW + 15 * MINUTE));
  return { pairing, codes, id: hex(share.id) };
}

function readAll(codes: string[]): Uint8Array {
  const collector = new CodeCollector();
  let result: ReturnType<CodeCollector["add"]> | undefined;
  for (const code of codes) result = collector.add(code);
  if (!result || !("bytes" in result)) throw new Error("not all codes read");
  return result.bytes;
}

async function waitingIn(almanac: Side, now: number): Promise<ShareRequest[]> {
  let seen: ShareRequest[] = [];
  const stop = listenForRequests(almanac.host, await readShares(almanac.vault), (w) => (seen = w), () => now);
  await flush();
  stop();
  return seen;
}

async function heardBy(provider: Side, now: number): Promise<Heard[]> {
  const heard: Heard[] = [];
  const stop = listenForAnswers(provider.host, await readPatients(provider.vault), (h) => heard.push(h), () => now);
  await flush();
  stop();
  return heard;
}

describe("the provider app, with almanac", () => {
  it("at the visit: reads the codes in any order, opens the share for the first opening, and keeps it sealed", async () => {
    const { almanac, provider } = await both();
    const v = await visit(almanac);
    const collector = new CodeCollector();
    const order = [...v.codes].reverse();
    expect(collector.add(order[0])).toEqual({ read: 1, of: v.codes.length });
    expect(collector.add(order[0])).toEqual({ read: 1, of: v.codes.length });
    let result: ReturnType<CodeCollector["add"]> | undefined;
    for (const code of order.slice(1)) result = collector.add(code);
    expect(result && "bytes" in result).toBe(true);

    const { patient, opening } = readVisit(readAll(v.codes), v.pairing, "  J.S., 15 Sep ", NOW);
    expect(patient).toMatchObject({ id: v.id, label: "J.S., 15 Sep", read: NOW, ends: NOW + 7 * DAY });
    expect(opening.until).toBe(NOW + 15 * MINUTE);
    expect(await openSelection(patient, opening)).toEqual(SELECTION);

    await addPatient(provider.vault, patient);
    const kept = JSON.stringify(await readPatients(provider.vault));
    expect(kept).not.toContain("cramps");
    expect(kept).not.toContain(hex(opening.shareKey));
  });

  it("refuses codes that aren't a share's, and a share made for another provider's code", async () => {
    const { almanac } = await both();
    const v = await visit(almanac);
    expect(() => new CodeCollector().add(v.pairing.code)).toThrow(ShareError);
    // Another share's code in the middle of the loop doesn't spoil it.
    const other = await visit(almanac, "Riverside Midwives");
    const collector = new CodeCollector();
    for (const code of v.codes.slice(0, -1)) collector.add(code);
    collector.add(other.codes[0]);
    expect("bytes" in collector.add(v.codes.at(-1)!)).toBe(true);
    // Read with a code the patient didn't scan: not for this provider.
    let problem: string | undefined;
    try {
      readVisit(readAll(v.codes), newPairing(demoMe("Dr Okafor")), "", NOW);
    } catch (e) {
      problem = (e as ShareError).problem;
    }
    expect(problem).toBe("not-for-you");
    // Nor once it has ended.
    expect(() => readVisit(readAll(v.codes), v.pairing, "", NOW + 7 * DAY)).toThrow(ShareError);
  });

  it("asks again; almanac allows it; the provider app opens the share for as long as the patient chose", async () => {
    const { almanac, provider } = await both();
    const v = await visit(almanac);
    const { patient } = readVisit(readAll(v.codes), v.pairing, "", NOW);
    await addPatient(provider.vault, patient);

    await ask(provider.host, provider.vault, patient.id, NOW + HOUR);
    const waiting = await waitingIn(almanac, NOW + 2 * HOUR);
    expect(waiting).toMatchObject([{ id: v.id, name: "Dr Okafor", asked: NOW + HOUR }]);
    expect(await answer(almanac.host, almanac.vault, waiting[0], "quarter", NOW + 2 * HOUR)).toBe(NOW + 2 * HOUR + 15 * MINUTE);

    const heard = await heardBy(provider, NOW + 2 * HOUR);
    expect(heard).toMatchObject([{ kind: "allowed", id: v.id, opening: { until: NOW + 2 * HOUR + 15 * MINUTE } }]);
    const allowed = heard[0] as Extract<Heard, { kind: "allowed" }>;
    expect(await openSelection(patient, allowed.opening)).toEqual(SELECTION);

    // Once heard, the request is answered: the same approval opens nothing again, and nor does one whose time is up.
    await setAsking(provider.vault, patient.id, undefined);
    expect(await heardBy(provider, NOW + 2 * HOUR)).toEqual([]);
    await ask(provider.host, provider.vault, patient.id, NOW + 3 * HOUR);
    expect(await heardBy(provider, NOW + 3 * HOUR)).toEqual([]);
  });

  it("a later opening shows what was logged since the visit, not the copy frozen there", async () => {
    const { almanac, provider, blobs } = await both();
    const v = await visit(almanac);
    const { patient } = readVisit(readAll(v.codes), v.pairing, "", NOW);
    await addPatient(provider.vault, patient);
    await setOnlineOk(almanac.vault, NOW);
    await saveDay(almanac.vault, { date: "2026-09-10", flow: "light", updatedAt: 1 });

    await ask(provider.host, provider.vault, patient.id, NOW + HOUR);
    await answer(almanac.host, almanac.vault, (await waitingIn(almanac, NOW + 2 * HOUR))[0], "quarter", NOW + 2 * HOUR);
    const allowed = (await heardBy(provider, NOW + 2 * HOUR))[0] as Extract<Heard, { kind: "allowed" }>;
    expect(allowed.cid).toBeDefined();

    const payload = (await blobs.get(allowed.cid!))!;
    expect((await openSelection(patient, { ...allowed.opening, payload })).days).toMatchObject({ "2026-09-10": { flow: "light" } });
    // And the key it carries opens that blob alone: the copy from the visit does not open with it.
    await expect(openSelection(patient, allowed.opening)).rejects.toThrow();
  });

  it("hears Stop sharing, after which almanac allows nothing more", async () => {
    const { almanac, provider } = await both();
    const v = await visit(almanac);
    await addPatient(provider.vault, readVisit(readAll(v.codes), v.pairing, "", NOW).patient);
    await stopShare(almanac.vault, v.id, NOW + HOUR);
    await sendSharing(almanac.host, almanac.vault, NOW + HOUR);
    expect(await heardBy(provider, NOW + HOUR)).toEqual([{ kind: "stopped", id: v.id }]);
    await ask(provider.host, provider.vault, v.id, NOW + 2 * HOUR);
    expect(await waitingIn(almanac, NOW + 2 * HOUR)).toEqual([]);
  });

  it("waits on four patients at most, in one statement of the usual size", async () => {
    const { almanac, provider } = await both();
    const ids: string[] = [];
    for (const name of ["Dr A", "Dr B", "Dr C", "Dr D", "Dr E"]) {
      const v = await visit(almanac, name);
      await addPatient(provider.vault, readVisit(readAll(v.codes), v.pairing, name, NOW).patient);
      ids.push(v.id);
    }
    for (const [i, id] of ids.slice(0, 4).entries()) await ask(provider.host, provider.vault, id, NOW + i * MINUTE);
    await expect(ask(provider.host, provider.vault, ids[4], NOW + HOUR)).rejects.toBeInstanceOf(TooManyWaiting);
    // Asking one of the four again replaces its request.
    await ask(provider.host, provider.vault, ids[0], NOW + HOUR);
    const { data, topics } = requestsStatement(await readPatients(provider.vault), NOW + HOUR);
    expect(data).toHaveLength(STATEMENT_BYTES);
    expect(topics).toHaveLength(4);
    expect(slots(data, REQUEST_BYTES)).toHaveLength(5);
    expect((await waitingIn(almanac, NOW + HOUR)).map((w) => w.id).sort()).toEqual(ids.slice(0, 4).sort());
  });

  it("keeps a patient only until their share ends", async () => {
    const { almanac, provider } = await both();
    const v = await visit(almanac);
    await addPatient(provider.vault, readVisit(readAll(v.codes), v.pairing, "", NOW).patient);
    expect(await keptPatients(provider.vault, NOW + 7 * DAY - 1)).toHaveLength(1);
    expect(await keptPatients(provider.vault, NOW + 7 * DAY)).toEqual([]);
    expect(await readPatients(provider.vault)).toEqual([]);
  });

  it("in the tryout, with no statement store, can't ask again — and says why", async () => {
    const host = memoryHost("tryout");
    const vault = await Vault.create(host, FAST);
    await expect(ask(host, vault, "00", NOW)).rejects.toThrow("statement store");
  });

  it("takes a name almanac can show", () => {
    expect(nameProblem("  Dr Okafor, Riverside Clinic ")).toBeNull();
    expect(nameProblem("   ")).toBe("empty");
    expect(nameProblem("x".repeat(41))).toBe("long");
    expect(nameProblem("Dr ‮Okafor")).toBe("unshowable");
  });
});
