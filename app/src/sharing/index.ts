/**
 * almanac's side of provider shares (docs/DESIGN.md §9): what goes into a share, the shares kept in
 * the vault, how long things last, the sharing statement, and answering the provider apps' requests.
 * The formats themselves are in ../share, which the provider app uses too. The screens are imported
 * from their own files.
 */
export { answer, listenForRequests, requestReader } from "./answering";
export { shareKeys } from "./keys";
export { sendIfDue, sendSharing, sharingStatement } from "./outbox";
export {
  addShare,
  answerRequests,
  isLive,
  keptShares,
  openUntil,
  pruneShares,
  readShares,
  shareRecord,
  stopShare,
  type ShareChoice,
  type ShareRecord,
} from "./records";
export { defaultChoice, offeredCategories, selectForShare } from "./select";
export { DEFAULT_SHARE_DAYS, endOfDay, OPENINGS, openingUntil, RANGES, SHARE_DAYS, shareEnds, type Opening, type ShareDays } from "./times";
export type { ShareRequest } from "./useShareRequests";
