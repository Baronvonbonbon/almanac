/**
 * docs/DESIGN.md §3 — words almanac never shows, nor the provider app. Each guards.test.ts fails on
 * any message that uses one.
 */
export const BANNED: RegExp[] = [
  /\bwallets?\b/i,
  /\bsign(s|ed|ing)?\b/i,
  /\btransactions?\b/i,
  /\b(block)?chains?\b/i,
  /\bcrypto/i,
  /\btokens?\b/i,
  /\bgas\b/i,
  /\bseeds?\b/i,
  /\bmnemonic/i,
  /\bprivate keys?\b/i,
  /\brecovery phrase/i,
  /\brevok/i,
  /\bpermission grant/i,
  /\bencryption keys?\b/i,
  /\bKDF\b/,
  /\bcipher/i,
  /\bsafe days?\b/i,
  /\b(women|ladies|girls)\b/i,
];
