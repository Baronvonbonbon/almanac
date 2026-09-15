import {
  createProofAuthorized,
  deriveEntropy,
  formatHostError,
  fromHex,
  getHostLocalStorage,
  getStatementStore,
  getThemeProvider,
  requestResourceAllocation,
  toHex,
  type HostStatementStore,
  type HostSubscription,
} from "@parity/product-sdk-host";
import type { Host, StatementPort } from "./host";

/** The Polkadot app's host, or `null` when its local storage is not available. */
export async function polkadotHost(): Promise<Host | null> {
  const store = await getHostLocalStorage();
  if (!store) return null;
  const themes = await getThemeProvider();
  return {
    subscribeVariant: themes
      ? (callback) => {
          const sub = themes.subscribeTheme((theme) => callback(theme.variant === "Dark" ? "dark" : "light"));
          return () => sub.unsubscribe();
        }
      : undefined,
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
    statements: statementPort(),
  };
}

type Hex = `0x${string}`;
const hexOf = (bytes: Uint8Array) => toHex(bytes) as Hex;

/** A statement's expiry as product-sdk-statement-store documents it: (unix seconds << 32) | sequence. A later expiry makes a statement newer. */
const expiryAt = (ms: number): bigint => BigInt(Math.floor(ms / 1000)) << 32n;

/** How long to wait before listening again when the host interrupts a subscription. */
const RELISTEN_MS = 5_000;

/**
 * The host's statement store, opened when first used — most sessions never touch it. The host signs
 * each statement with the product's allowance account (P8). The allowance is asked for once a session,
 * before the first statement: P9 found it is needed, and that asking again does no harm.
 */
function statementPort(): StatementPort {
  let store: Promise<HostStatementStore> | null = null;
  let allowed = false;
  const open = (): Promise<HostStatementStore> =>
    (store ??= getStatementStore().then((s) => {
      if (!s) throw new Error("the statement store isn't available");
      return s;
    })).catch((e: unknown) => {
      store = null;
      throw e;
    });

  return {
    async publish({ channel, topics, data, expires }) {
      const s = await open();
      if (!allowed) {
        const r = await requestResourceAllocation([{ tag: "StatementStoreAllowance" }]);
        // Not final either way: the submit below says whether there is room.
        allowed = r.ok && r.value.every((outcome) => outcome === "Allocated");
      }
      const statement = { topics: topics.map(hexOf), channel: hexOf(channel), expiry: expiryAt(expires), data: hexOf(data) };
      const proof = await createProofAuthorized(statement);
      if (!proof.ok) throw new Error(formatHostError(proof.error));
      await s.submit({ ...statement, proof: proof.value });
    },
    listen(topics, heard) {
      let stopped = false;
      let sub: HostSubscription | null = null;
      const start = () =>
        open().then(
          (s) => {
            if (stopped) return;
            sub = s.subscribe({ matchAny: topics.map(hexOf) }, (page) => {
              for (const statement of page.statements) if (statement.data) heard(fromHex(statement.data));
            });
            sub.onInterrupt(() => {
              sub = null;
              if (!stopped) setTimeout(() => void start(), RELISTEN_MS);
            });
          },
          // No statement store: there is nothing to hear.
          () => {},
        );
      if (topics.length) void start();
      return () => {
        stopped = true;
        sub?.unsubscribe();
      };
    },
  };
}
