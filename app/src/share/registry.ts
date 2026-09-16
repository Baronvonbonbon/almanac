import { fromHex } from "../lib/bytes";

/**
 * The registry almanac believes when a provider says it is a provider (docs/DESIGN.md §9).
 *
 * This is a trust root: a clinic almanac cannot verify against this key gets no share, and whoever
 * holds the secret half decides who may become a patient's provider (THREAT-MODEL R15). It is checked
 * on the phone and nothing is sent anywhere, so it has to travel inside the bundle.
 *
 * It is written here as well as in the repo's `product.mjs`, which is where the published identities
 * are recorded but which the app cannot import: `product.mjs` sits outside the app's root and is not
 * TypeScript, and reaching it would want a bundler alias, a path mapping and `allowJs` for one
 * constant. So the two are kept in step by `registry.test.ts`, which reads that file and fails if
 * they drift — the same way the rest of this repo guards an invariant rather than trusting anyone to
 * remember it.
 *
 * Changing the key stops every attestation the old one signed from verifying, and so stops every
 * clinic pairing until each is vouched for again.
 */
export const REGISTRY_PUBLIC_KEY = "cc82bd9d751561e47cdc790256755e7c1834a5eb751433f88eb754568b4af302";

/** The same key, as the bytes `verifyAttestation` wants. */
export const REGISTRY_KEY = fromHex(REGISTRY_PUBLIC_KEY);
