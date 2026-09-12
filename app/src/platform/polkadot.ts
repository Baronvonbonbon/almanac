import { deriveEntropy, formatHostError, getHostLocalStorage } from "@parity/product-sdk-host";
import type { Host } from "./host";

/** The Polkadot app's host, or `null` when its local storage is not available. */
export async function polkadotHost(): Promise<Host | null> {
  const store = await getHostLocalStorage();
  if (!store) return null;
  return {
    kind: "polkadot",
    storage: {
      // Nothing almanac writes is empty, so an empty read is treated as absent too.
      read: async (key) => {
        const value = await store.readBytes(key);
        return value?.length ? value : undefined;
      },
      write: (key, value) => store.writeBytes(key, value),
      remove: (key) => store.clear(key),
    },
    async deriveEntropy(input) {
      const r = await deriveEntropy(input);
      if (!r.ok) throw new Error(`deriveEntropy: ${formatHostError(r.error)}`);
      return r.value;
    },
  };
}
