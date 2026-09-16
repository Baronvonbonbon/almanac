/**
 * - `format`: not a provider's code, a share, or a statement of almanac's at all
 * - `newer`: made by a newer almanac or provider app
 * - `not-for-you`: does not open with these keys — meant for someone else, or changed on the way
 * - `damaged`: opened, but what is inside does not hold together
 * - `too-large`: more than a share, a code or a statement can hold
 * - `untrusted`: read, and says who it is from, but the registry did not vouch for it (DESIGN §9)
 * - `expired`: vouched for once, and that has run out
 *
 * The last two are about trust rather than shape: a code can be perfectly formed and still come from
 * a provider almanac will not make a share for.
 */
export type ShareProblem = "format" | "newer" | "not-for-you" | "damaged" | "too-large" | "untrusted" | "expired";

export class ShareError extends Error {
  constructor(
    readonly problem: ShareProblem,
    message: string,
  ) {
    super(message);
    this.name = "ShareError";
  }
}
