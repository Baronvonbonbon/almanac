import type { ISODate } from "../cycle";
import { monthRecords, type Settings } from "../data";
import { exampleDays } from "../tryout/examples";
import type { Vault } from "../vault";

/**
 * Whether this vault set up a duress PIN — which the vault itself cannot tell, since which slot is real
 * is recorded nowhere. Kept in the vault that set it, so a decoy reads as having none, and left out of
 * backups (PHONE_ONLY in backup/snapshot.ts): a restored almanac starts without a PIN.
 */
export interface Protection {
  duress: boolean;
}

const PROTECTION = "protection";

export const readProtection = async (vault: Vault): Promise<Protection> => (await vault.readJSON<Protection>(PROTECTION)) ?? { duress: false };

export const saveProtection = (vault: Vault, protection: Protection): Promise<void> => vault.writeJSON(PROTECTION, protection);

/**
 * What the decoy starts with: the same settings as the real one, so it looks set up the same way
 * (docs/THREAT-MODEL.md R3) — and, if asked, example months near the usual cycle length, so it doesn't
 * look new.
 */
export function decoyRecords(settings: Settings, options: { fill: boolean; usualCycle: number; today: ISODate; now?: number }): Record<string, unknown> {
  return {
    settings,
    ...(options.fill ? monthRecords(exampleDays([], options.today, options.usualCycle, options.now)) : {}),
  };
}
