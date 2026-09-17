import { isInsideContainer } from "@parity/product-sdk-host";
import type { Host } from "./host";
import { polkadotHost } from "./polkadot";

export type { Blobs, Host, StatementPort, Storage } from "./host";
export { memoryHost, MemoryBlobs, MemoryStatements, MemoryStorage, type MemoryHost } from "./memory";

/** The Polkadot app's host, or `null` in a plain browser. Whether a host found here is used: startup.ts. */
export async function detectHost(): Promise<Host | null> {
  if (!(await isInsideContainer())) return null;
  return polkadotHost();
}
