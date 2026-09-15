import { fromHex } from "@app/lib/bytes";
import { keyPairFrom, providerPair, type KeyPair, type PairKeys } from "@app/share";
import type { Vault } from "@app/vault";

/**
 * The patients whose shares this device keeps (docs/DESIGN.md §9): for each, until the share's end
 * date, the share as read at the visit — still sealed — the pairing's keys, and a note the provider
 * typed, all in the vault behind the PIN. Never what a share holds, opened: that stays in memory while
 * the patient allows it. A request's opening key waits here too, until it is answered or the share
 * ends, since the patient answers whenever they next open almanac.
 */
export interface Patient {
  id: string;
  label: string;
  read: number;
  ends: number;
  /** The secret half of this pairing's key pair. */
  pairing: string;
  /** almanac's key for this share. */
  sender: string;
  /** The share as read at the visit: its header and payload, sealed. */
  stored: string;
  /** The request not yet answered: the secret half of its opening key, and when it was made. */
  asking?: { key: string; asked: number };
}

const PATIENTS = "patients";

export const readPatients = async (vault: Vault): Promise<Patient[]> => (await vault.readJSON<Patient[]>(PATIENTS)) ?? [];

export const addPatient = (vault: Vault, patient: Patient): Promise<void> =>
  vault.updateJSON<Patient[]>(PATIENTS, (all) => [...(all ?? []).filter((p) => p.id !== patient.id), patient]);

/** Deletes a patient's share from this device: when they stop sharing, or when the provider says so. */
export const forgetPatient = (vault: Vault, id: string): Promise<void> => vault.updateJSON<Patient[]>(PATIENTS, (all) => (all ?? []).filter((p) => p.id !== id));

/** Keeps a new request's opening key — or, answered, lets it go. */
export const setAsking = (vault: Vault, id: string, asking: Patient["asking"]): Promise<void> =>
  vault.updateJSON<Patient[]>(PATIENTS, (all) =>
    (all ?? []).map((p) => {
      if (p.id !== id) return p;
      const next: Patient = { ...p, ...(asking ? { asking } : {}) };
      if (!asking) delete next.asking;
      return next;
    }),
  );

/** The patients kept, once any whose share has ended are deleted — keys and all. */
export async function keptPatients(vault: Vault, now: number): Promise<Patient[]> {
  const all = await readPatients(vault);
  if (all.every((p) => p.ends > now)) return all;
  await vault.updateJSON<Patient[]>(PATIENTS, (list) => (list ?? []).filter((p) => p.ends > now));
  return all.filter((p) => p.ends > now);
}

/** A patient's name on this device: the provider's note, or when they shared. */
export const nameOf = (p: Patient, unnamed: (read: number) => string): string => p.label || unnamed(p.read);

/** A patient's keys, as the share formats take them. */
export function patientKeys(p: Patient): { id: Uint8Array; sender: Uint8Array; pair: PairKeys; asking?: KeyPair } {
  const sender = fromHex(p.sender);
  return {
    id: fromHex(p.id),
    sender,
    pair: providerPair(keyPairFrom(fromHex(p.pairing)), sender),
    ...(p.asking ? { asking: keyPairFrom(fromHex(p.asking.key)) } : {}),
  };
}
