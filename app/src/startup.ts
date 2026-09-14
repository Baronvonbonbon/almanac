import type { Host } from "./platform";
import { deviceKey, Vault } from "./vault";

/** How long a host gets to show it can be used before the tryout opens instead. */
export const HOST_WAIT_MS = 10_000;

/**
 * The host almanac runs on, or `null` for the tryout, which saves nothing. A host found by
 * `detectHost` is used only if, within the wait, its storage answers and it can derive almanac's key:
 * in a page that frames almanac with no host behind it, the SDK still hands out storage, whose reads
 * never return; the dev-dot.li web host answers but fails every `deriveEntropy` with "Not connected"
 * (2026-09-14). Once a vault exists the host is kept — a tryout over someone's data would look as if
 * it had gone — and a failure to open it is reported. A host that fails to start is reported too.
 */
export function chooseHost(found: Promise<Host | null>, wait = HOST_WAIT_MS): Promise<Host | null> {
  return within(usable(found), wait, null);
}

async function usable(found: Promise<Host | null>): Promise<Host | null> {
  const host = await found;
  if (!host) return null;
  if (await Vault.exists(host)) return host;
  const derives = await deviceKey(host).then(
    () => true,
    () => false,
  );
  return derives ? host : null;
}

/** What `promise` settles to, or `timedOut` if it hasn't settled within `ms`. */
function within<T, U>(promise: Promise<T>, ms: number, timedOut: U): Promise<T | U> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<U>((resolve) => (timer = setTimeout(() => resolve(timedOut), ms)));
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}
