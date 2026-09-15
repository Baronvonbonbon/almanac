/**
 * - `format`: not a provider's code, a share, or a statement of almanac's at all
 * - `newer`: made by a newer almanac or provider app
 * - `not-for-you`: does not open with these keys — meant for someone else, or changed on the way
 * - `damaged`: opened, but what is inside does not hold together
 * - `too-large`: more than a share, a code or a statement can hold
 */
export type ShareProblem = "format" | "newer" | "not-for-you" | "damaged" | "too-large";

export class ShareError extends Error {
  constructor(
    readonly problem: ShareProblem,
    message: string,
  ) {
    super(message);
    this.name = "ShareError";
  }
}
