// The one place the published identities are written down, shared by app/, probe/ and provider/.
//
// PRODUCT_ID must equal the DotNS label. The host derives product accounts and the local-storage
// namespace from it, and allowances are looked up per product. If the two drift apart, every host
// call exercises an identity that never published anything and reports a confident "no"
// (broadside/docs/DEPLOY.md, sonde/product.mjs).
//
// Each of the three has a name of its own. A name serves one bundle at a time, so while the app and
// the probe shared one, publishing either replaced the other — which kept P10 (the probe in a phone
// browser) blocked whenever the app was live. *Changed 2026-09-16.*
//
// What that costs, written down because it is easy to forget: the probe now measures **its own**
// identity. Storage, product accounts and Bulletin allowances are all keyed by PRODUCT_ID, so a
// finding about specific accounts or quotas — P6b's slot account, P6 and P8's authorizations — is a
// claim about `almanacprobe`, not about `almanacapp`. Platform behaviour still generalises; anything
// account-specific must be re-run under the app's own label to be a claim about the app.

// Not "almanac01": pad requires Personhood Lite for a base of 6–8 letters with two trailing digits,
// and refused it for a NoStatus signer on 2026-09-11. A base of 9+ letters is open to any account.
export const PRODUCT_ID = "almanacapp";
export const DOT_NAME = `${PRODUCT_ID}.dot`;

// The provider app (docs/DESIGN.md §9) is a Product of its own, so its storage, product accounts and
// statement allowance are apart from almanac's. Decided 2026-09-15; registered to the deploy key,
// confirmed by `node tools/whois.mjs almanacappprovider` on 2026-09-16 — as is almanacapp itself, so
// neither first deploy registers anything any more.
export const PROVIDER_ID = "almanacappprovider";
export const PROVIDER_DOT_NAME = `${PROVIDER_ID}.dot`;

// The device probe (probe/), so the app and the probe can both be live at once. Unregistered as of
// 2026-09-16 — `whois` says "owner none", available to all at 10 PAS — so its first deploy DOES
// register it, permanently. A base of 9+ letters is open to any account, which "almanacprobe" is.
export const PROBE_ID = "almanacprobe";
export const PROBE_DOT_NAME = `${PROBE_ID}.dot`;

// Must equal the --env passed to pad. The SDK defaults cloud storage to "paseo", which a devnet host
// build does not carry — createApp then throws "Chain … is not supported by the current host".
export const CLOUD_ENV = "devnet";

// The registry that vouches for providers (docs/DESIGN.md §9, provider registration). almanac checks
// a clinic's attestation against this key and makes no share for a clinic it cannot verify, so this
// is what almanac trusts when it decides who may become a patient's provider — and it is checked on
// the phone, with nothing sent anywhere.
//
// The secret half lives at ~/.config/almanac/registry-key, made by tools/registry-key.mjs, and never
// belongs in a bundle or on a phone. Changing this key stops every attestation signed by the old one
// from verifying, which stops every clinic pairing until each is vouched for again.
//
// **A demo registry.** A real one would be held by whoever is entitled to say that a clinic is a
// clinic — a medical board or an accreditation body — rather than by whoever wrote the app
// (THREAT-MODEL R15). Made 2026-09-16.
export const REGISTRY_PUBLIC_KEY = "cc82bd9d751561e47cdc790256755e7c1834a5eb751433f88eb754568b4af302";
