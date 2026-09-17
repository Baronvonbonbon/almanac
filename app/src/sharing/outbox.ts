import { fromHex, hex } from "../lib/bytes";
import type { Host } from "../platform";
import { almanacPair, APPROVAL_SLOTS, ENTRY_BYTES, NO_CID, packSlots, sealApproval, sealStop, SHARING_CHANNEL, topicsFor } from "../share";
import type { Vault } from "../vault";
import { shareKeys } from "./keys";
import { isLive, readShares, type ShareRecord } from "./records";

/**
 * almanac's one sharing statement (docs/DESIGN.md §9): an approval for each opening a provider app
 * asked for that is still open, and a stop for each share stopped before its end date — three at most,
 * always 512 bytes, on the topics of the providers they are for, so each provider app hears only its
 * own. It is sent again, whole, whenever one changes, and stays due until it has gone: a stop made
 * with no connection reaches the provider app the next time almanac opens.
 */

/** As long as the store allows (P9), and longer than any share lasts, so a stop outlives its share. */
const LIFETIME_MS = 90 * 86_400_000;
const DUE = "sharing-due";

interface Entry {
  topic: Uint8Array;
  sealed: Uint8Array;
  approval: boolean;
  at: number;
}

function entries(records: ShareRecord[], now: number): Entry[] {
  const out: Entry[] = [];
  for (const r of records) {
    const keys = shareKeys(r);
    const pair = almanacPair(keys.sender, keys.providerKey);
    if (isLive(r, now)) {
      for (const o of r.openings)
        if (o.key && o.until > now) {
          // An opening with an upload of its own carries that blob's key and CID; one without opens
          // the payload from the visit, under the share's own key (DESIGN §9).
          const openWith = o.payloadKey ? fromHex(o.payloadKey) : keys.shareKey!;
          const cid = o.cid ? fromHex(o.cid) : NO_CID;
          out.push({ topic: pair.answerTopic, sealed: sealApproval(pair, keys.sender, keys.id, fromHex(o.key), o.until, openWith, cid), approval: true, at: o.at });
        }
    } else if (r.stopped !== undefined && r.ends > now) {
      out.push({ topic: pair.answerTopic, sealed: sealStop(pair, keys.id, r.stopped), approval: false, at: r.stopped });
    }
  }
  // Approvals first — a provider app is waiting on those — then stops; the newest of each first.
  return out.sort((a, b) => Number(b.approval) - Number(a.approval) || b.at - a.at).slice(0, APPROVAL_SLOTS);
}

/** The statement's data and topics, as they stand at `now`. */
export function sharingStatement(records: ShareRecord[], now: number): { data: Uint8Array; topics: Uint8Array[] } {
  const chosen = entries(records, now);
  const topics = new Map(chosen.map((e) => [hex(e.topic), e.topic]));
  return { data: packSlots(chosen.map((e) => e.sealed), ENTRY_BYTES), topics: topicsFor([...topics.values()]) };
}

/**
 * Sends the sharing statement as it stands. `false` where there is no statement store to send it to
 * — the web tryout. A failure to send throws. Either way it stays due.
 */
export async function sendSharing(host: Host, vault: Vault, now = Date.now()): Promise<boolean> {
  await vault.updateJSON<boolean>(DUE, () => true);
  if (!host.statements) return false;
  const { data, topics } = sharingStatement(await readShares(vault), now);
  await host.statements.publish({ channel: SHARING_CHANNEL, topics, data, expires: now + LIFETIME_MS });
  await vault.updateJSON<boolean>(DUE, () => false);
  return true;
}

/** Sends it if a change has not gone yet. */
export async function sendIfDue(host: Host, vault: Vault, now = Date.now()): Promise<boolean> {
  if (!host.statements || (await vault.readJSON<boolean>(DUE)) !== true) return false;
  return sendSharing(host, vault, now);
}
