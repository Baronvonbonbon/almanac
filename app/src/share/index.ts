/**
 * Provider shares (docs/DESIGN.md §9): the formats almanac and the provider app exchange, and the keys
 * behind them. Pure — no host, no vault, no screen — so the provider app can use the same code. It
 * moves to a workspace package of its own once `provider/` exists.
 */
export { ShareError, type ShareProblem } from "./errors";
export { FRAME_BYTES, FRAME_PREFIX, joinFrames, readFrame, toFrames, type Frame } from "./frames";
export { almanacPair, checkDigits, keyPairFrom, newKeyPair, providerPair, type KeyPair, type PairKeys } from "./keys";
export {
  ENTRY_BYTES,
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
export { NAME_BYTES, PAIRING_PREFIX, pairingCode, readPairingCode, type Pairing } from "./pairing";
export { MAX_PAYLOAD, newShare, openStored, readShare, sealShare, SHARE_BUCKETS, type NewShare, type ReceivedShare, type ShareHeader } from "./share";
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
