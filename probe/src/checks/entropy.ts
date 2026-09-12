import { deriveEntropy, formatHostError } from "@parity/product-sdk-host";
import type { Check } from "../types";
import { fingerprint, utf8 } from "../util";

const LABEL = utf8("almanac/probe/entropy/v1");

export const entropy: Check = {
  id: "P2",
  title: "Is the device key the same after a reinstall, and on another phone?",
  decides:
    "Whether almanac's device key regenerates by itself, or whether every restore needs the backup code.",
  needsHost: true,
  steps: [
    "Run this and write the fingerprint down.",
    "Run it again after reinstalling the Polkadot app.",
    "Run it on a second phone signed in to the same account.",
  ],
  async run({ journal }) {
    const first = await deriveEntropy(LABEL);
    if (!first.ok) return { status: "fail", summary: `The host refused: ${formatHostError(first.error)}` };
    const fp = fingerprint(first.value);
    const second = await deriveEntropy(LABEL);
    const deterministic = second.ok && fingerprint(second.value) === fp;
    const earlier = journal
      .entries("P2")
      .map((e) => e.data?.fingerprint)
      .filter((f): f is string => typeof f === "string");
    const changed = earlier.find((f) => f !== fp);

    if (!deterministic) return { status: "fail", summary: "Two calls in a row gave different results.", data: { fingerprint: fp } };
    if (changed) {
      return {
        status: "fail",
        summary: `Changed: now ${fp}, earlier ${changed}.`,
        data: { fingerprint: fp, earlier },
      };
    }
    return {
      status: earlier.length ? "pass" : "info",
      summary: earlier.length
        ? `${fp} — the same as all ${earlier.length} earlier runs on this install.`
        : `${fp} — write this down and compare after a reinstall and on another phone.`,
      data: { fingerprint: fp, bytes: first.value.length, earlier },
    };
  },
};
