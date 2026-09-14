import { t } from "../i18n";
import type { CodeProblem } from "./code";
import type { BackupProblem } from "./format";

/** What went wrong with a typed backup code, in words. */
export const codeProblemText = (problem: CodeProblem): string =>
  problem === "character" ? t("restore.codeCharacter") : problem === "length" ? t("restore.codeLength") : t("restore.codeCheck");

/** What went wrong opening a backup, in words. */
export const backupProblemText = (problem: BackupProblem): string =>
  problem === "wrong-code" ? t("restore.wrongCode") : problem === "newer" ? t("restore.newer") : t("restore.format");
