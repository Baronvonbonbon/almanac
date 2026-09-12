import type { Check } from "../types";
import { errText } from "../util";

const NAME = "almanac-probe.alm";

// A sample file only. Nothing personal is ever in it.
const sample = () =>
  JSON.stringify({ probe: "almanac", at: new Date().toISOString(), note: "Sample file. Contains no personal data." });

const worked: [string, string] = ["It worked", "Nothing happened"];

export const download: Check = {
  id: "P4a",
  title: "Can almanac save a file to the phone?",
  decides: "Whether the encrypted export file can be a plain download.",
  confirm: worked,
  async run() {
    const url = URL.createObjectURL(new Blob([sample()], { type: "application/octet-stream" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: NAME });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return { status: "info", summary: `Asked to save ${NAME}. Did a file appear?` };
  },
};

export const shareFile: Check = {
  id: "P4b",
  title: "Can almanac hand a file to the share sheet?",
  decides: "Whether the export file can go to Files, email or a messaging app.",
  confirm: worked,
  async run() {
    const file = new File([sample()], NAME, { type: "application/octet-stream" });
    if (!navigator.canShare?.({ files: [file] })) return { status: "fail", summary: "Sharing files is not supported here." };
    try {
      await navigator.share({ files: [file], title: "almanac probe" });
      return { status: "pass", summary: "The share sheet opened and returned." };
    } catch (e) {
      return { status: "fail", summary: `The share sheet refused or was cancelled: ${errText(e)}` };
    }
  },
};

export const shareText: Check = {
  id: "P4c",
  title: "Can almanac share text?",
  decides: "A fallback for timed links and the printable report.",
  confirm: worked,
  async run() {
    if (!navigator.share) return { status: "fail", summary: "Web Share is not available here." };
    try {
      await navigator.share({ title: "almanac probe", text: `almanac probe — ${new Date().toISOString()}` });
      return { status: "pass", summary: "The share sheet opened and returned." };
    } catch (e) {
      return { status: "fail", summary: `The share sheet refused or was cancelled: ${errText(e)}` };
    }
  },
};

export const clipboard: Check = {
  id: "P4d",
  title: "Can almanac copy to the clipboard?",
  decides: "Copying the backup code and timed links.",
  confirm: ["Pasting shows the text", "Nothing to paste"],
  async run() {
    try {
      await navigator.clipboard.writeText(`almanac probe — ${new Date().toISOString()}`);
      return { status: "info", summary: "Copied. Paste somewhere to check." };
    } catch (e) {
      return { status: "fail", summary: `Copy refused: ${errText(e)}` };
    }
  },
};

export const print: Check = {
  id: "P4e",
  title: "Can almanac open the print dialog?",
  decides: "Whether the printable report can print directly, or goes through the share sheet.",
  confirm: ["A print dialog opened", "Nothing happened"],
  async run() {
    window.print();
    return { status: "info", summary: "Asked for the print dialog." };
  },
};

export const pickFile: Check = {
  id: "P4f",
  title: "Can almanac open a file you choose?",
  decides: "Restoring from an export file.",
  steps: ["Tap Run, then choose any file. Only its name and size are read."],
  async run() {
    const input = Object.assign(document.createElement("input"), { type: "file" });
    const picked = new Promise<File | null>((resolve) => {
      input.addEventListener("change", () => resolve(input.files?.[0] ?? null), { once: true });
      input.addEventListener("cancel", () => resolve(null), { once: true });
      setTimeout(() => resolve(null), 120_000);
    });
    input.click();
    const file = await picked;
    if (!file) return { status: "fail", summary: "No file came back (cancelled, blocked or timed out)." };
    const bytes = (await file.arrayBuffer()).byteLength;
    return { status: "pass", summary: `Read ${bytes} bytes from a chosen file.`, data: { bytes, type: file.type || "unknown" } };
  },
};

export const EXPORT_CHECKS = [download, shareFile, shareText, clipboard, print, pickFile];
