// The one place the published identity is written down, shared by app/ and probe/.
//
// PRODUCT_ID must equal the DotNS label. The host derives product accounts and the local-storage
// namespace from it, and allowances are looked up per product. If the two drift apart, every host
// call exercises an identity that never published anything and reports a confident "no"
// (broadside/docs/DEPLOY.md, sonde/product.mjs).
//
// The probe deliberately runs under the prototype label rather than a throwaway one: storage,
// product accounts and allowances are all keyed by it, so its answers describe the identity the app
// itself uses.

// Not "almanac01": pad requires Personhood Lite for a base of 6–8 letters with two trailing digits,
// and refused it for a NoStatus signer on 2026-09-11. A base of 9+ letters is open to any account.
export const PRODUCT_ID = "almanacapp";
export const DOT_NAME = `${PRODUCT_ID}.dot`;

// Must equal the --env passed to pad. The SDK defaults cloud storage to "paseo", which a devnet host
// build does not carry — createApp then throws "Chain … is not supported by the current host".
export const CLOUD_ENV = "devnet";
