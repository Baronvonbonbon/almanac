/**
 * Every word almanac shows. Plain language only — src/guards.test.ts fails on anything from the
 * banned list in docs/DESIGN.md §3.
 */
export const en = {
  appName: "almanac",
  tryout: {
    title: "You're trying almanac.",
    body: "Nothing you enter here is saved. To track your cycle privately, open almanac in the Polkadot app.",
  },
  foundations: {
    checking: "Getting things ready…",
    ready: "Your private storage is working on this phone.",
    locked: "almanac is locked.",
    failed: "Something went wrong: {message}",
    early: "This is an early build. The full app arrives in the next phase.",
    identity: "Running as {name}.",
  },
  prediction: {
    learning: "Still learning your rhythm",
    day: "Day {day}",
    likely: "Period likely between {earliest} and {latest}",
    late: "Your period may be {days} days late",
    fertile: "Fertile window (estimate)",
  },
} as const;
