/** QR codes: drawing them, showing a share as a loop of them, and reading them with the camera. */
export { qrModules, qrPath, QUIET_ZONE } from "./encode";
export { QrCode } from "./QrCode";
export { LOOP_MS, QrLoop } from "./QrLoop";
export { QrScanner } from "./QrScanner";
export { ScanError, startScanner, type ScanProblem } from "./scanner";
