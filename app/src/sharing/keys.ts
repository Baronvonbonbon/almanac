import { fromHex } from "../lib/bytes";
import { keyPairFrom, type KeyPair } from "../share";
import type { ShareRecord } from "./records";

/**
 * A record's keys, as the share formats take them — apart from records.ts, which is read at every
 * start, so the formats load only with the sharing screens.
 */
export function shareKeys(r: ShareRecord): { id: Uint8Array; sender: KeyPair; providerKey: Uint8Array; shareKey?: Uint8Array } {
  return {
    id: fromHex(r.id),
    sender: keyPairFrom(fromHex(r.secret)),
    providerKey: fromHex(r.provider.key),
    ...(r.shareKey ? { shareKey: fromHex(r.shareKey) } : {}),
  };
}
