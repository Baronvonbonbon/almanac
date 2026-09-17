import {
  createProofAuthorized,
  deriveEntropy,
  formatHostError,
  fromHex,
  getHostLocalStorage,
  getPreimageManager,
  getStatementStore,
  getThemeProvider,
  requestPermission,
  requestResourceAllocation,
  toHex,
  type HostStatementStore,
  type HostSubscription,
} from "@parity/product-sdk-host";
import type { Blobs, Host, StatementPort } from "./host";

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
    blobs: blobPort(),
  };
}

type Hex = `0x${string}`;
const hexOf = (bytes: Uint8Array) => toHex(bytes) as Hex;

/** A statement's expiry as product-sdk-statement-store documents it: (unix seconds << 32) | sequence. A later expiry makes a statement newer. */
const expiryAt = (ms: number): bigint => BigInt(Math.floor(ms / 1000)) << 32n;

/** How long to wait before listening again when the host interrupts a subscription. */
const RELISTEN_MS = 5_000;

/** P6c: 1 MiB took 41 s on a phone, so a backup is given time rather than abandoned half-stored. */
const PUT_MS = 180_000;
/** P7: a blob the host already holds comes back in under a second; this is for one it must fetch. */
const GET_MS = 60_000;

type PreimageManager = NonNullable<Awaited<ReturnType<typeof getPreimageManager>>>;

/**
 * Bulletin through the host's own path (docs/DESIGN.md §8).
 *
 * `getPreimageManager().submit()`, not the SDK's `cloudStorage.upload`: P6 found that one signs with
 * the product account, which holds no Bulletin authorization, so every upload is refused
 * `Invalid: Payment`. The allowance lands instead on a slot account only the host can sign with, and
 * this is the call that asks the host to sign (P6b). Both the allowance and the permission are asked
 * once a session, before the first upload; P9 found that asking again does no harm.
 */
function blobPort(): Blobs {
  let ready: Promise<PreimageManager> | null = null;
  const open = (): Promise<PreimageManager> =>
    (ready ??= prepare()).catch((e: unknown) => {
      ready = null;
      throw e;
    });

  async function prepare(): Promise<PreimageManager> {
    // The type declares "BulletInAllowance", which throws; only this spelling allocates (sonde).
    await requestResourceAllocation([{ tag: "BulletinAllowance", value: undefined } as never]);
    const permission = await requestPermission({ tag: "PreimageSubmit", value: undefined });
    if (!permission.ok) throw new Error(`storage permission: ${formatHostError(permission.error)}`);
    if (!permission.value) throw new Error("the Polkadot app did not allow almanac to store a backup");
    const manager = await getPreimageManager();
    if (!manager) throw new Error("this Polkadot app offers almanac no storage for backups");
    return manager;
  }

  return {
    async put(bytes) {
      const manager = await open();
      const key = await withTimeout(manager.submit(bytes), PUT_MS, "storing the backup");
      return fromHex(key as Hex);
    },
    async get(hash) {
      const manager = await open();
      // The host answers a lookup with a subscription that reports nothing until it finds the bytes.
      return new Promise<Uint8Array | null>((resolve) => {
        let done = false;
        let sub: { unsubscribe(): void } | undefined;
        const finish = (v: Uint8Array | null) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          try {
            sub?.unsubscribe();
          } catch {
            /* already gone */
          }
          resolve(v);
        };
        const timer = setTimeout(() => finish(null), GET_MS);
        try {
          sub = manager.lookup(hexOf(hash), (bytes) => bytes && finish(bytes));
        } catch {
          finish(null);
        }
      });
    },
  };
}

/** Host calls can stall rather than reject, so nothing crosses to the host without a deadline. */
function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what}: no answer in ${Math.round(ms / 1000)} s`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

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
