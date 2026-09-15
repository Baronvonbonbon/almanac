/**
 * Reading QR codes with the camera. The phone's own reader where it has one (`BarcodeDetector`, which
 * the Polkadot app has on Android — P12); otherwise `qr`'s reader, loaded only then, so a phone that
 * never needs it never downloads it (62 KiB, counted in the code budget's whole but not its start).
 * Nothing leaves the phone: each frame is read where it was taken, and then dropped.
 */

export type ScanProblem = "noCamera" | "denied" | "unavailable";

export class ScanError extends Error {
  constructor(readonly problem: ScanProblem) {
    super(problem);
    this.name = "ScanError";
  }
}

/** Every code found in the current frame. */
type Read = (video: HTMLVideoElement) => Promise<string[]>;

// Not in TypeScript's DOM types yet.
interface NativeDetector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
interface NativeDetectorClass {
  new (options: { formats: string[] }): NativeDetector;
  getSupportedFormats(): Promise<string[]>;
}

/** How often the camera is looked at. */
const EVERY_MS = 120;

async function reader(): Promise<Read> {
  const Native = (globalThis as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector;
  if (Native && (await Native.getSupportedFormats().catch((): string[] => [])).includes("qr_code")) {
    const detector = new Native({ formats: ["qr_code"] });
    return async (video) => (await detector.detect(video)).map((code) => code.rawValue);
  }
  const { default: decodeQR } = await import("qr/decode.js");
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new ScanError("unavailable");
  return async (video) => {
    const { videoWidth: width, videoHeight: height } = video;
    if (!width || !height) return [];
    if (canvas.width !== width || canvas.height !== height) Object.assign(canvas, { width, height });
    context.drawImage(video, 0, 0, width, height);
    try {
      return [decodeQR(context.getImageData(0, 0, width, height))];
    } catch {
      return []; // no code in this frame
    }
  };
}

/**
 * Starts the camera in `video` and calls `onCode` with each code it reads — each new one, not the same
 * one again and again — until `signal` aborts, which also turns the camera off.
 */
export async function startScanner(video: HTMLVideoElement, onCode: (text: string) => void, signal: AbortSignal): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) throw new ScanError("noCamera");
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } }, audio: false });
  } catch (e) {
    const name = e instanceof DOMException ? e.name : "";
    throw new ScanError(name === "NotAllowedError" || name === "SecurityError" ? "denied" : name === "NotFoundError" ? "noCamera" : "unavailable");
  }
  const stop = () => stream.getTracks().forEach((track) => track.stop());
  if (signal.aborted) return stop();
  signal.addEventListener("abort", stop, { once: true });

  video.srcObject = stream;
  try {
    await video.play();
  } catch {
    if (!signal.aborted) throw new ScanError("unavailable");
  }
  const read = await reader();
  let last = "";
  const look = async () => {
    if (signal.aborted) return;
    for (const text of await read(video).catch(() => [])) {
      if (text !== last) {
        last = text;
        onCode(text);
      }
    }
    setTimeout(look, EVERY_MS);
  };
  void look();
}
