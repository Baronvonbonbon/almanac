import { hex } from "../lib/bytes";
import type { Host } from "../platform";
import { almanacPair, openRequest, REQUEST_BYTES, slots, type Request } from "../share";
import type { Vault } from "../vault";
import { shareKeys } from "./keys";
import { sendSharing } from "./outbox";
import { answerRequests, isLive, readShares, type ShareRecord } from "./records";
import { openingUntil, type Opening } from "./times";
import type { ShareRequest } from "./useShareRequests";

export { sendIfDue } from "./outbox";

/**
 * The provider app asks; the patient answers (docs/DESIGN.md §9). almanac listens on the request topic
 * of each share it can still allow, for as long as it is open — and hears requests already waiting as
 * it opens, since a subscription delivers what the store holds (P9).
 */

interface Found {
  record: ShareRecord;
  request: Request;
}

/** The topics to listen on, and a reader for what arrives: the requests in it for these shares, not yet answered. */
export function requestReader(records: ShareRecord[], now: number): { topics: Uint8Array[]; read(data: Uint8Array): Found[] } {
  const live = records
    .filter((r) => isLive(r, now))
    .map((record) => {
      const keys = shareKeys(record);
      return { record, pair: almanacPair(keys.sender, keys.providerKey) };
    });
  return {
    topics: live.map((l) => l.pair.requestTopic),
    read(data) {
      let parts: Uint8Array[];
      try {
        parts = slots(data, REQUEST_BYTES);
      } catch {
        return [];
      }
      const found: Found[] = [];
      for (const { record, pair } of live)
        for (const part of parts) {
          let request: Request | null = null;
          try {
            request = openRequest(pair, part);
          } catch {
            // From a newer provider app, or damaged: nothing almanac can answer.
          }
          if (request && hex(request.share) === record.id && !record.answered?.includes(hex(request.openingKey))) found.push({ record, request });
        }
      return found;
    },
  };
}

/** One waiting request per share: the newest ask, answering any older ones with it. The newest share first. */
function waiting(heard: Map<string, Found>): ShareRequest[] {
  const byShare = new Map<string, ShareRequest>();
  for (const [key, { record, request }] of heard) {
    const w = byShare.get(record.id);
    if (!w) byShare.set(record.id, { id: record.id, name: record.provider.name, asked: request.asked, key, keys: [key] });
    else {
      w.keys.push(key);
      if (request.asked > w.asked) Object.assign(w, { asked: request.asked, key });
    }
  }
  return [...byShare.values()].sort((a, b) => b.asked - a.asked);
}

/** Listens for requests to these shares; `onWaiting` hears what is waiting each time that changes. */
export function listenForRequests(host: Host, records: ShareRecord[], onWaiting: (waiting: ShareRequest[]) => void, now: () => number = Date.now): () => void {
  if (!host.statements) return () => {};
  const { topics, read } = requestReader(records, now());
  if (!topics.length) return () => {};
  const heard = new Map<string, Found>();
  return host.statements.listen(topics, (data) => {
    const found = read(data);
    if (!found.length) return;
    for (const f of found) heard.set(hex(f.request.openingKey), f);
    onWaiting(waiting(heard));
  });
}

/**
 * Answers a request: allowed for as long as the patient chose, and the approval goes out in the
 * sharing statement — or, for "Not now", nothing goes out. Returns when the opening ends, or `null`.
 * The answer is kept before it is sent, so one that fails to go is sent when almanac next opens.
 */
export async function answer(host: Host, vault: Vault, request: ShareRequest, opening: Opening | null, now = Date.now()): Promise<number | null> {
  const record = (await readShares(vault)).find((r) => r.id === request.id);
  if (!record || !isLive(record, now)) return null;
  if (!opening) {
    await answerRequests(vault, record.id, request.keys);
    return null;
  }
  const until = openingUntil(opening, now, record.ends);
  await answerRequests(vault, record.id, request.keys, { at: now, until, key: request.key });
  await sendSharing(host, vault, now);
  return until;
}
