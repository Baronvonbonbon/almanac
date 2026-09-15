/**
 * almanac's side of provider shares (docs/DESIGN.md §9): what goes into a share, and the shares kept
 * in the vault. The formats themselves are in ../share, which the provider app uses too.
 */
export {
  addShare,
  isLive,
  pruneShares,
  readShares,
  recordOpening,
  shareKeys,
  shareRecord,
  stopShare,
  type ShareChoice,
  type ShareRecord,
} from "./records";
export { defaultChoice, offeredCategories, selectForShare } from "./select";
