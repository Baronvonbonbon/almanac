/**
 * Every word almanac shows. Plain language only — src/guards.test.ts fails on anything from the
 * banned list in docs/DESIGN.md §3.
 */
export const en = {
  appName: "almanac",
  preview: "Preview",
  tryout: {
    title: "You're trying almanac.",
    body: "Nothing you enter here is saved. To track your cycle privately, open almanac in the Polkadot app.",
  },
  app: {
    starting: "Getting things ready…",
    locked: "almanac is locked.",
    failed: "Something went wrong: {message}",
  },
  common: {
    today: "Today",
    earlierMonth: "Earlier month",
    laterMonth: "Later month",
  },
  looks: {
    hearth: { name: "Hearth", about: "Warm and familiar" },
    moonpaper: { name: "Moonpaper", about: "Calm, like a printed almanac" },
    pebble: { name: "Pebble", about: "Bright, with bigger buttons" },
  },
  onboarding: {
    welcome: "Welcome to almanac",
    progress: "Step {step} of {total}",
    back: "Back",
    next: "Continue",
    notSure: "Not sure",
    finish: "Start using almanac",
    finishing: "Setting up…",
    look: {
      title: "Choose how almanac looks",
      body: "You can change this any time in Settings. The cycles shown are examples.",
      chosen: "Chosen",
    },
    lastPeriod: {
      title: "When did your last period start?",
      body: "Tap the first day. A rough guess is fine.",
    },
    cycle: {
      title: "How long is your cycle usually?",
      body: "From the first day of one period to the first day of the next. Most are between 21 and 35 days.",
      days: "days",
      shorter: "One day shorter",
      longer: "One day longer",
    },
    help: {
      title: "What would you like almanac to help with?",
      body: "You can change these any time in Settings.",
      periods: "Periods",
      periodsNote: "Always on",
      fertility: "Fertile window (estimate)",
      fertilityNote: "The days pregnancy is most likely. An estimate, not a form of birth control.",
      ttc: "Trying to conceive",
      ttcNote: "Adds ovulation tests, temperature and more to your log.",
    },
  },
  prediction: {
    learning: "Still learning your rhythm",
    day: "Day {day}",
    dayWord: "Day",
    ofAbout: "of about {length}",
    likely: "Period likely between {earliest} and {latest}",
    late: "Your period may be {days} days late",
    fertile: "Fertile window (estimate)",
    none: "When your period starts, log it and almanac will start learning your rhythm.",
  },
  home: {
    logToday: "Log today",
    soon: "Logging a day comes in the next build.",
  },
} as const;
