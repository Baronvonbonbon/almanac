import { getNotificationManager } from "@parity/product-sdk-host";
import type { Check } from "../types";
import { day, errText, withTimeout } from "../util";

const DELAY_MS = 2 * 60_000;

export const scheduled: Check = {
  id: "P3",
  title: "Does a reminder arrive while almanac is closed?",
  decides: "Whether almanac can offer reminders in the first version.",
  needsHost: true,
  steps: [
    "Tap Run. A test reminder is set for two minutes from now.",
    "Close the Polkadot app completely — swipe it away.",
    "When the reminder arrives (or after five minutes), reopen this probe and answer below.",
  ],
  confirm: ["The reminder arrived", "Nothing arrived"],
  async run({ journal }) {
    const manager = await getNotificationManager();
    if (!manager) return { status: "fail", summary: "The host offers no notifications." };
    const fireAt = Date.now() + DELAY_MS;
    try {
      // Discreet on purpose, like almanac's own reminders will be: lock screens are public.
      const id = await withTimeout(
        manager.push({ text: "almanac probe — test reminder. Safe to dismiss.", scheduledAt: BigInt(fireAt) }),
        60_000,
        "push",
      );
      await journal.addScheduled({ id: String(id), at: Date.now(), fireAt });
      return {
        status: "info",
        summary: `Scheduled for ${day(fireAt)} UTC. Close the Polkadot app now.`,
        data: { id: String(id), fireAt },
      };
    } catch (e) {
      const cause = e instanceof Error && e.cause ? ` (${errText(e.cause)})` : "";
      return { status: "fail", summary: `The host refused: ${errText(e)}${cause}` };
    }
  },
};
