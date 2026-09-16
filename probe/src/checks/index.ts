import type { Check } from "../types";
import { gateway } from "./gateway";
import { preimageLadder, preimageSubmit, retention, uploadLadder } from "./bulletin";
import { camera, theme } from "./device";
import { entropy } from "./entropy";
import { EXPORT_CHECKS } from "./export";
import { deviceBackup } from "./manual";
import { scheduled } from "./notify";
import { perf } from "./perf";
import { signer } from "./signer";
import { listen, send, statementLimits } from "./statements";
import { capacity, survival } from "./storage";

// In the order they are best run: P8 reads what P6 and P9a recorded.
export const CHECKS: Check[] = [
  survival,
  capacity,
  entropy,
  scheduled,
  ...EXPORT_CHECKS,
  deviceBackup,
  uploadLadder,
  preimageSubmit,
  // After P6b: it reads the paying account P6b recorded, to measure what each upload costs.
  preimageLadder,
  retention,
  statementLimits,
  send,
  listen,
  signer,
  gateway,
  perf,
  theme,
  camera,
];
