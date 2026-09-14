import type { ISODate } from "../cycle";
import { DEFAULT_SETTINGS, saveDay, saveSettings, type Settings } from "../data";
import type { Host } from "../platform";
import { Vault, type KdfParams } from "../vault";

/** What onboarding asked. `null` is "Not sure". */
export interface Answers {
  lastPeriod: ISODate | null;
  typicalCycle: number | null;
  fertility: boolean;
  ttc: boolean;
}

/**
 * Onboarding's last step: the vault is created here, and the answers go into it. Nothing but the
 * look (which belongs to the phone) is stored before this, so leaving halfway leaves no trace.
 */
export async function finishOnboarding(host: Host, answers: Answers, options: { kdf?: KdfParams; now?: number } = {}): Promise<Vault> {
  const vault = await Vault.create(host, options.kdf);
  const settings: Settings = {
    ...structuredClone(DEFAULT_SETTINGS),
    modes: { ...DEFAULT_SETTINGS.modes, fertility: answers.fertility, ttc: answers.ttc },
  };
  if (answers.typicalCycle !== null) settings.typicalCycle = answers.typicalCycle;
  await saveSettings(vault, settings);
  if (answers.lastPeriod) await saveDay(vault, { date: answers.lastPeriod, periodStart: true, updatedAt: options.now ?? Date.now() });
  return vault;
}
