import type { Check } from "../types";

export const deviceBackup: Check = {
  id: "P5",
  title: "Do phone backups (iCloud, Google) copy almanac's saved data?",
  decides: "Threat model R6 — whether saved data can leave the phone inside a device backup.",
  steps: [
    "Run P1 on this phone so it has a marker, and note the marker.",
    "Back up the phone (iCloud or Google).",
    "Restore that backup onto a second phone, open the Polkadot app, then this probe.",
    "Run P1 there. If it finds the same marker, device backups copy almanac's storage.",
  ],
  confirm: ["The same marker came across", "It did not"],
};
