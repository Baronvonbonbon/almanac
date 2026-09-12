import { getThemeProvider } from "@parity/product-sdk-host";
import type { Check } from "../types";
import { errText } from "../util";

export const theme: Check = {
  id: "P12a",
  title: "Does almanac learn whether the Polkadot app is light or dark?",
  decides: "Whether almanac follows the app's theme, or falls back to the phone's setting.",
  needsHost: true,
  steps: ["Run once, then switch the Polkadot app's theme and run again."],
  async run() {
    const provider = await getThemeProvider();
    if (!provider) return { status: "fail", summary: "No theme provider." };
    const seen: unknown[] = [];
    const sub = provider.subscribeTheme((t) => seen.push(t));
    // A subscription with no initial value leaves nothing to render against, so waiting is the test.
    await new Promise((r) => setTimeout(r, 2_500));
    sub.unsubscribe();
    const system = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    return seen.length
      ? { status: "pass", summary: `Theme: ${JSON.stringify(seen.at(-1))} (phone says ${system}).`, data: { seen, system } }
      : { status: "fail", summary: `No theme delivered in 2.5 s (phone says ${system}).`, data: { system } };
  },
};

export const camera: Check = {
  id: "P12b",
  title: "Can almanac use the camera to scan a QR code?",
  decides: "Pairing for live shares: scan a QR code, or type a short code instead.",
  steps: ["Allow the camera if asked. Nothing is recorded; the camera closes immediately."],
  async run() {
    const qr = await qrSupport();
    if (!navigator.mediaDevices?.getUserMedia) return { status: "fail", summary: `No camera API. QR detection: ${qr}.` };
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      stream.getTracks().forEach((t) => t.stop());
      return { status: "pass", summary: `The camera opened. QR detection: ${qr}.`, data: { qr } };
    } catch (e) {
      return { status: "fail", summary: `The camera was refused: ${errText(e)}. QR detection: ${qr}.`, data: { qr } };
    }
  },
};

async function qrSupport(): Promise<string> {
  const Detector = (window as unknown as { BarcodeDetector?: { getSupportedFormats(): Promise<string[]> } }).BarcodeDetector;
  if (!Detector) return "not built in (would need a small library)";
  try {
    return (await Detector.getSupportedFormats()).includes("qr_code") ? "built in" : "built in, but not for QR";
  } catch (e) {
    return `unknown — ${errText(e)}`;
  }
}
