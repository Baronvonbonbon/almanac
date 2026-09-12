import { isInsideContainer } from "@parity/product-sdk-host";
import type { Host } from "./host";
import { polkadotHost } from "./polkadot";

export type { Host, Storage } from "./host";
export { memoryHost, MemoryStorage, type MemoryHost } from "./memory";

/** The Polkadot app's host, or `null` in a plain browser — the web gateway's tryout mode. */
export async function detectHost(): Promise<Host | null> {
  if (!(await isInsideContainer())) return null;
  return polkadotHost();
}
