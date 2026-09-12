import { createApp, type App } from "@parity/product-sdk";
import { formatHostError, requestResourceAllocation } from "@parity/product-sdk-host";
import { CLOUD_ENV, PRODUCT_ID } from "../product.mjs";
import { withTimeout } from "./util";

let app: App | null = null;

/** The SDK App, connected and with an account selected — upload() stalls rather than errors without one. */
export async function getApp(): Promise<App> {
  app ??= await build();
  return app;
}

async function build(): Promise<App> {
  const a = await withTimeout(createApp({ name: PRODUCT_ID, cloudStorage: { environment: CLOUD_ENV } }), 60_000, "createApp");
  const { accounts } = await withTimeout(a.wallet.connect(), 90_000, "wallet.connect");
  if (!a.wallet.getSelectedAccount() && accounts[0]) a.wallet.selectAccount(accounts[0].address);
  return a;
}

/**
 * Ask for a Bulletin allowance, then rebuild the App.
 *
 * sonde found both halves: only the "BulletinAllowance" spelling allocates (the type declares
 * "BulletInAllowance", which throws), and the allowance creates a slot account the existing App was
 * built without — so it is rebuilt before the next upload.
 */
export async function requestBulletinAllowance(log: (line: string) => void): Promise<string> {
  const r = await withTimeout(
    requestResourceAllocation([{ tag: "BulletinAllowance", value: undefined } as never]),
    150_000,
    "allowance",
  );
  if (!r.ok) return `refused — ${formatHostError(r.error)}`;
  const outcome = JSON.stringify(r.value);
  log(`allowance: ${outcome}`);
  app = await build();
  return outcome;
}
