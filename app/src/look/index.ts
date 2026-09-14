import { useSyncExternalStore } from "react";
import type { Host } from "../platform";
import { readLook, writeLook } from "../vault";
import { loadFonts, registerFonts } from "./fonts";
import { cssVariables, DEFAULT_LOOK, isLookId, LOOK_IDS, type LookId, type Variant } from "./palettes";

export { cssVariables, DEFAULT_LOOK, isLookId, LOOK_IDS, LOOKS, type LookId, type Variant } from "./palettes";

export interface LookState {
  look: LookId;
  variant: Variant;
}

let state: LookState = { look: DEFAULT_LOOK, variant: "light" };
let host: Host | null = null;
const listeners = new Set<() => void>();

/** Puts the look on the page as custom properties on <html>, which style.css reads. */
function update(next: Partial<LookState>) {
  state = { ...state, ...next };
  const root = document.documentElement;
  for (const [name, value] of Object.entries(cssVariables(state.look, state.variant))) root.style.setProperty(name, value);
  root.style.colorScheme = state.variant;
  root.dataset.look = state.look;
  root.dataset.variant = state.variant;
  for (const listener of listeners) listener();
}

/**
 * Before the first render: the saved look, light or dark, and the look's fonts — so the first screen
 * already appears in it. Waits a moment at most, and falls back to the default look for anything it
 * cannot read.
 */
export async function startLook(h: Host | null): Promise<void> {
  host = h;
  let saved: string | null = null;
  try {
    saved = h ? await readLook(h) : null;
  } catch {
    // Unreadable — damaged, or written by another account on this phone: the default look.
  }
  update({ look: isLookId(saved) ? saved : DEFAULT_LOOK });
  await followVariant(h);
  await loadFonts(state.look);
}

/**
 * The first paint, before the host is known: the default look in the phone's light or dark, for the
 * starting screen. startLook replaces it with the saved look before the first real screen.
 */
export function showStartingLook(): void {
  update({ look: DEFAULT_LOOK, variant: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light" });
  registerFonts(DEFAULT_LOOK);
}

/** Follows the host's light or dark while almanac runs. Resolves on the first value, or after a moment. */
function followVariant(h: Host | null): Promise<void> {
  if (h?.subscribeVariant) {
    let first!: () => void;
    const delivered = new Promise<void>((resolve) => (first = resolve));
    try {
      h.subscribeVariant((variant) => {
        update({ variant });
        first();
      });
      return Promise.race([delivered, new Promise<void>((resolve) => setTimeout(resolve, 800))]);
    } catch {
      // A host that offers a theme but fails to deliver one: the phone's setting, below.
    }
  }
  // Outside the app — the web tryout — the phone's own setting is all there is.
  const media = matchMedia("(prefers-color-scheme: dark)");
  const follow = () => update({ variant: media.matches ? "dark" : "light" });
  media.addEventListener("change", follow);
  follow();
  return Promise.resolve();
}

/** Switches the look at once, and keeps it on this phone. The tryout keeps it only until closed. */
export async function setLook(look: LookId): Promise<void> {
  update({ look });
  void loadFonts(look);
  if (host) await writeLook(host, look);
}

/** Back to the default look after erase, which removed the saved one — without saving it again. */
export function resetLook(): void {
  update({ look: DEFAULT_LOOK });
  void loadFonts(DEFAULT_LOOK);
}

/** Makes every look's fonts available, for previews that show all three at once. */
export function previewFonts(): void {
  for (const id of LOOK_IDS) registerFonts(id);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** The current look and variant; re-renders when either changes. */
export function useLook(): LookState {
  return useSyncExternalStore(subscribe, () => state);
}
