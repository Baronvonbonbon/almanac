import { utf8 } from "@app/lib/bytes";
import { NAME_BYTES, pairingCode } from "@app/share";
import type { Vault } from "@app/vault";

/** The provider, as patients see them: the name that goes into every pairing code. */
export interface Me {
  name: string;
}

const ME = "me";

export const readMe = (vault: Vault): Promise<Me | null> => vault.readJSON<Me>(ME);
export const writeMe = (vault: Vault, me: Me): Promise<void> => vault.writeJSON(ME, { name: me.name.trim() });

export type NameProblem = "empty" | "long" | "unshowable";

/** Why a name can't go into a pairing code, if it can't: almanac shows it to the patient as it is. */
export function nameProblem(name: string): NameProblem | null {
  const trimmed = name.trim();
  if (!trimmed) return "empty";
  if (utf8(trimmed).length > NAME_BYTES) return "long";
  try {
    pairingCode({ providerKey: new Uint8Array(32), firstOpeningKey: new Uint8Array(32), name: trimmed });
  } catch {
    return "unshowable";
  }
  return null;
}
