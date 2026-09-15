import { equal } from "@app/share/wire";
import { hex } from "@app/lib/bytes";
import type { Host } from "@app/platform";
import { ENTRY_BYTES, openEntry, slots, unmaskShareKey, type Approval, type Stop } from "@app/share";
import { patientKeys, type Patient } from "./patients";
import type { Opening } from "./visit";

/**
 * What the provider app hears from almanac (docs/DESIGN.md §9): an approval for the request it is
 * waiting on — which opens the share for as long as the patient chose — or a stop, after which the
 * share is deleted from this device. It listens on the answer topic of each patient it keeps, for as
 * long as it is open, and hears answers already waiting as it opens.
 */

export type Heard = { kind: "allowed"; id: string; opening: Opening } | { kind: "stopped"; id: string };

/** The topics to listen on, and a reader for what arrives: what in almanac's statement is for these patients. */
export function answerReader(patients: Patient[], now: () => number): { topics: Uint8Array[]; read(data: Uint8Array): Heard[] } {
  const kept = patients.map((patient) => ({ patient, keys: patientKeys(patient) }));
  return {
    topics: kept.map((k) => k.keys.pair.answerTopic),
    read(data) {
      let parts: Uint8Array[];
      try {
        parts = slots(data, ENTRY_BYTES);
      } catch {
        return [];
      }
      const heard: Heard[] = [];
      for (const { patient, keys } of kept)
        for (const part of parts) {
          let entry: Approval | Stop | null = null;
          try {
            entry = openEntry(keys.pair, part);
          } catch {
            // From a newer almanac, or damaged: nothing to act on.
          }
          if (!entry || hex(entry.share) !== patient.id) continue;
          if (entry.kind === "stop") heard.push({ kind: "stopped", id: patient.id });
          // Only the request still waiting: an approval for an earlier one, or one whose time is up, opens nothing.
          else if (keys.asking && equal(entry.openingKey, keys.asking.publicKey) && entry.until > now())
            heard.push({ kind: "allowed", id: patient.id, opening: { shareKey: unmaskShareKey(entry, keys.asking, keys.sender), until: entry.until } });
        }
      return heard;
    },
  };
}

/** Listens for almanac's answers to these patients' shares; `onHeard` hears each. */
export function listenForAnswers(host: Host, patients: Patient[], onHeard: (heard: Heard) => void, now: () => number = Date.now): () => void {
  if (!host.statements) return () => {};
  const { topics, read } = answerReader(patients, now);
  if (!topics.length) return () => {};
  return host.statements.listen(topics, (data) => {
    for (const heard of read(data)) onHeard(heard);
  });
}
