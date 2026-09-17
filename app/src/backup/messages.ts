import { t } from "../i18n";
import type { CodeProblem } from "./code";
import type { BackupProblem } from "./format";

/** What went wrong with a typed backup code, in words. */
export const codeProblemText = (problem: CodeProblem): string =>
  problem === "character" ? t("restore.codeCharacter") : problem === "length" ? t("restore.codeLength") : t("restore.codeCheck");

/** What went wrong opening a backup, in words. */
export const backupProblemText = (problem: BackupProblem): string => {
  switch (problem) {
    case "wrong-code":
      return t("restore.wrongCode");
    case "newer":
      return t("restore.newer");
    case "no-storage":
      return t("restore.noStorage");
    case "refused":
      return t("restore.refused");
    case "not-found":
      return t("restore.notFound");
    default:
      return t("restore.format");
  }
};
