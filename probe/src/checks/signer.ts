import { getAccountsProvider } from "@parity/product-sdk-host";
import { deriveProductAccountPublicKey } from "@parity/product-sdk-keys";
import { DOT_NAME, PRODUCT_ID } from "../../product.mjs";
import { getApp } from "../app";
import type { Check } from "../types";
import { errText, hex, short, ss58PublicKey } from "../util";

const INDICES = [0, 1, 2];

export const signer: Check = {
  id: "P8",
  title: "Can almanac's accounts be linked to your main account?",
  decides:
    "Threat model R1 — whether an observer who knows your main account can see that you use almanac, and when.",
  needsHost: true,
  steps: ["Run P6 and P9a first, so the accounts that signed an upload and a statement are known."],
  async run({ journal, log }) {
    const app = await getApp();
    const accounts = app.wallet.getAccounts();
    const selected = app.wallet.getSelectedAccount()?.address ?? null;
    const walletProduct = app.wallet.getProductAccount()?.address ?? null;

    const hostKeys: Record<number, string> = {};
    const provider = await getAccountsProvider();
    if (provider) {
      for (const i of INDICES) {
        hostKeys[i] = await provider.getProductAccount(DOT_NAME, i).match(
          (a) => hex(a.publicKey),
          (e) => `error — ${errText(e)}`,
        );
      }
    }

    const roleOfKey = (pub: string): string => {
      const i = INDICES.find((n) => hostKeys[n] === pub.replace(/^0x/, ""));
      return i !== undefined ? `product account #${i}` : "another account (the host's allowance account?)";
    };
    const role = (address: string | null): string => {
      if (!address) return "unknown";
      try {
        return roleOfKey(hex(ss58PublicKey(address)));
      } catch {
        return "unreadable address";
      }
    };

    // Only an account that is not one of almanac's own can stand in for "your main account".
    const mainAccounts = accounts.filter((a) => !role(a.address).startsWith("product account"));

    // Recompute each product account from a main account's PUBLIC key alone. A match means anyone who
    // knows the main account can do the same.
    const matches: string[] = [];
    for (const a of mainAccounts) {
      let pub: Uint8Array;
      try {
        pub = ss58PublicKey(a.address);
      } catch (e) {
        log(`${short(a.address)}: ${errText(e)}`);
        continue;
      }
      for (const pid of [PRODUCT_ID, DOT_NAME]) {
        for (const i of INDICES) {
          try {
            if (hex(deriveProductAccountPublicKey(pub, pid, i)) === hostKeys[i]) matches.push(`${short(a.address)} + "${pid}" #${i}`);
          } catch (e) {
            log(`derive ${pid} #${i}: ${errText(e)}`);
          }
        }
      }
    }

    const uploadSigner = (journal.entries("P6").at(-1)?.data?.signer as string | undefined) ?? null;
    const statementSigner = (journal.entries("P9a").at(-1)?.data?.signer as string | undefined) ?? null;

    const data = {
      accounts: accounts.map((a) => ({ address: a.address, source: a.source, role: role(a.address) })),
      selected: { address: selected, role: role(selected) },
      walletProductAccount: walletProduct,
      hostProductKeys: hostKeys,
      derivedFromPublicKey: matches,
      uploadSigner: { address: uploadSigner, role: role(uploadSigner) },
      statementSigner: { key: statementSigner, role: statementSigner ? roleOfKey(statementSigner) : "unknown" },
    };
    const signers = `Uploads were signed by ${data.uploadSigner.role}; statements by ${data.statementSigner.role}.`;
    if (matches.length) {
      return {
        status: "fail",
        summary: `Yes — almanac's accounts can be computed from your main account's public key (${matches[0]}). ${signers}`,
        data,
      };
    }
    if (!Object.keys(hostKeys).length) {
      return { status: "info", summary: "The host did not return product accounts, so linkability could not be tested.", data };
    }
    if (!mainAccounts.length) {
      // 2026-09-14: the Android app showed almanac only product account #0, and this reported a pass.
      return {
        status: "info",
        summary: `Inconclusive — the app shows almanac only its own accounts, so there was no main account to test against. ${signers}`,
        data,
      };
    }
    return {
      status: "pass",
      summary: `No product account could be computed from a main account's public key. ${signers}`,
      data,
    };
  },
};
