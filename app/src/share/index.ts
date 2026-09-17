/**
 * Provider shares (docs/DESIGN.md §9): the formats almanac and the provider app exchange, and the keys
 * behind them. Pure — no host, no vault, no screen — so the provider app (provider/) imports this
 * very code, as "@app/share", and the two can never disagree about a format.
 */
export {
  ATTESTATION_BYTES,
  attest,
  newSigningKeyPair,
  readAttestation,
  signPairing,
  TIER,
  verifyAttestation,
  verifyPairing,
  type Attestation,
  type Tier,
} from "./attest";
export { ShareError, type ShareProblem } from "./errors";
export { REGISTRY_KEY, REGISTRY_PUBLIC_KEY } from "./registry";
export { FRAME_BYTES, FRAME_PREFIX, joinFrames, readFrame, toFrames, type Frame } from "./frames";
export { almanacPair, checkDigits, keyPairFrom, newKeyPair, pairDigits, providerPair, type KeyPair, type PairKeys } from "./keys";
export {
  ENTRY_BYTES,
  NO_CID,
  openEntry,
  openRequest,
  REQUEST_BYTES,
  sealApproval,
  sealRequest,
  sealStop,
  unmaskShareKey,
  type Approval,
  type Request,
  type Stop,
} from "./messages";
export { checkName, NAME_BYTES, PAIRING_PREFIX, pairingCode, readPairingCode, verifyProvider, type Pairing } from "./pairing";
export {
  MAX_BLOB_PAYLOAD,
  MAX_PAYLOAD,
  newShare,
  openStored,
  readShare,
  sealPayload,
  sealShare,
  SHARE_BUCKETS,
  type NewShare,
  type ReceivedShare,
  type ShareHeader,
} from "./share";
export {
  CATEGORIES,
  decodeSelection,
  DEFAULT_CATEGORIES,
  encodeSelection,
  type Category,
  type SharedDay,
  type Selection,
} from "./selection";
export {
  APPROVAL_SLOTS,
  packSlots,
  REQUEST_SLOTS,
  REQUESTS_CHANNEL,
  SHARING_CHANNEL,
  slots,
  STATEMENT_BYTES,
  TOPICS,
  topicsFor,
} from "./statement";
