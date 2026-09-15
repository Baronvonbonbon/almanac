/**
 * almanac's side of provider shares (docs/DESIGN.md §9): what goes into a share, the shares kept in
 * the vault, and how long things last. The formats themselves are in ../share, which the provider app
 * uses too. The screens are imported from their own files.
 */
export {
  addShare,
  isLive,
  keptShares,
  openUntil,
  pruneShares,
  readShares,
  recordOpening,
  shareRecord,
  stopShare,
  type ShareChoice,
  type ShareRecord,
} from "./records";
export { shareKeys } from "./keys";
export { defaultChoice, offeredCategories, selectForShare } from "./select";
export { DEFAULT_SHARE_DAYS, endOfDay, OPENINGS, openingUntil, RANGES, SHARE_DAYS, shareEnds, type Opening, type ShareDays } from "./times";
