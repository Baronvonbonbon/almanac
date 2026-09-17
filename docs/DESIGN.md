# almanac — design

Where this document and a probe result disagree, the probe wins, and the correction is recorded
here with its date. Open items that depend on the probe name their check ID (P1–P12, see
[`PLAN.md`](PLAN.md#phase-0--device-probe-)).

## 1. Principles

1. **Your data lives on your phone.** Anything that leaves it is encrypted first, with keys only you
   hold.
2. **The chain never sees a period.** No cycle data — encrypted or not — is written to a blockchain.
   Polkadot delivers the app and carries encrypted blobs; that is all.
3. **No taps you didn't ask for.** Nothing in the daily flow needs a signature or a wallet prompt.
4. **Plain words.** If a word needs explaining, it is the wrong word.
5. **Fail closed.** When anything goes wrong — a share, a backup, an unlock — the result is less
   access, never more.

## 2. Surfaces

| Surface | What it is |
|---|---|
| **The Polkadot app** (`almanac.dot`) | The full app |
| **Web gateway** (`almanac.dev-dot.li`) | Tryout mode: the same onboarding and app, kept in memory and gone on reload. Home offers example months — five cycles before the first period logged — so the calendar and insights can be seen filled in; they are added only when asked for, and never in the Polkadot app. The gateway cannot keep almanac's data, so this is a constraint, not a choice (below) |
| **Provider app** (`almanacappprovider.dot`) | A separate Product for doctors, midwives and clinics: reads a patient's share at the visit, opens it only while the patient allows, then forgets it (§9). *Changed 2026-09-14: replaces the web viewer for timed links* |

*Changed 2026-09-14.* The gateway now runs products on a host of its own, in a frame, but that host
fails every `deriveEntropy` with *Not connected*, so almanac could not make its key there. The
tryout is therefore a fallback (`app/src/startup.ts`): almanac opens it when no host is found, when
the host never answers, or when it can't derive almanac's key before a vault exists. Once a vault
exists the host is kept whatever happens — a tryout over someone's data would look as if it had gone —
and a failure to open it is reported. While it waits, almanac shows its starting screen at once: a
lit day going round a ring of 28, and words that say what is happening and, after a few seconds,
what happens if it can't connect. It fades in after a moment, so a quick start on a phone shows
nothing. The gateway sizes its frame to `100vh` in a page that can't
scroll, so on a phone the frame's bottom is off the screen; almanac lifts its bottom edge by what is
hidden (`app/src/ui/hiddenBottom.ts`).

Tryout banner, always visible:

> **You're trying almanac.** Nothing you enter here is saved. To track your cycle privately, open
> almanac in the Polkadot app.

## 3. Experience

**Onboarding — four screens at most.** First, how almanac looks: three live previews (§4), with
Hearth already selected so continuing is one tap. The rest of onboarding appears in the chosen look.
Then: When did your last period start? (a date, or *Not sure*). How long is your cycle usually? (a
number, or *Not sure*). What would you like almanac to help with? (periods, fertility window, trying
to conceive — only the first is on). No backup code on day one: it is offered once three days have
been logged, or the first time backups or sharing are turned on, and a gentle reminder stays in the
Privacy screen until it is saved. *Changed 2026-09-14: the look picker is new, making four screens.
The backup code moved from after the first week to after three logged days: while Bulletin backups
are blocked (P6) the copied backup is the only backup, and the devnet has already reset once.*
The last period's start is tapped on a month of days rather than in the phone's own date picker,
which has not been checked inside the Polkadot app. Nothing is stored until the last screen, apart
from the look. Below *Continue*, the first screen offers *Restore from a backup* (§8).

**Home.** One cycle ring and one button.

```
┌──────────────────────────────┐
│            almanac           │
│                              │
│          ╭────────╮          │
│        ╱   Day 12   ╲        │
│       │  of about 29 │       │
│        ╲            ╱        │
│          ╰────────╯          │
│   Period likely in 16–18 days│
│                              │
│   ╭──────────────────────╮   │
│   │      Log today       │   │
│   ╰──────────────────────╯   │
│                              │
│  Today · Calendar · Insights │
└──────────────────────────────┘
```

**Log sheet — three taps at most.** Flow (none, spotting, light, medium, heavy), symptom chips, mood
chips, an optional note. Trying-to-conceive fields (ovulation tests, temperature, cervical fluid,
intimacy) appear only when that mode is on.

**Calendar.** A month view; period days filled, predicted days outlined, the fertile window (when
on) marked with a pattern as well as a colour. Tapping a day shows what was logged, with a way to
log or edit it; there a period start almanac read wrongly can be corrected, or a missed one marked.
Likely periods are shown three cycles ahead, each as long as periods have been — and none while a
period is late.

**Insights.** The last six cycles as bars on one scale (those left out of guesses hatched, and
labelled), how long cycles and periods usually last, and the symptoms logged most often. All worked
out on the phone.

**Modes.** Fertility window (off), trying to conceive (off), pregnancy (off — pauses predictions,
counts weeks, handles loss with care and without prompts). Weeks are counted from the last period's
first day, as midwives and doctors count them, up to 44 weeks. Turning pregnancy off asks nothing.
After more than 90 days without a period — after a pregnancy, or a gap in logging — home says *It's
been a while since your last logged period* instead of counting the days late, and draws no cycle.

**Settings.** Opened from the top bar. The look, which changes live so it can be seen before leaving
the screen; the modes; the usual cycle and period lengths, each with *Not sure*, and a line saying
whether almanac still uses them or now goes by what was logged. Every change is saved as it is
made. Reminders join in Phase 6, and the Privacy screen (Phase 3) is reached from here.

**Privacy screen.** Lock and duress PIN, backups, shares, export, erase — each in one sentence of
plain language.

### Words

| Say | Never say |
|---|---|
| period, cycle, log, day 12 | wallet, sign, transaction, chain, blockchain, crypto, token, gas |
| backup code | seed, mnemonic, private key, recovery phrase |
| share, stop sharing | revoke, access token, permission grant |
| lock, PIN | encryption key, KDF, cipher |
| *likely between Oct 3 and Oct 6* | *your period will start Oct 4* |
| fertile window (estimate) | safe days |
| you | women, ladies, girls |

The right-hand column is a CI check over every message in `app/src/i18n/`, where every string the
app shows lives. *Corrected 2026-09-11 (Phase 1): it was planned against `dist/`, but the SDK's own
code there is full of words like "transaction" and "sign" that almanac never shows.*

## 4. Look — soft, warm, minimal

**Three looks, chosen on the first screen and changeable in Settings.** *Decided 2026-09-14, from the
design canvas ([`design/looks.html`](design/looks.html)): the first was to be one look, Hearth; all
three mock-ups are kept instead.* The looks share every layout, word and flow. They differ only in
colours, fonts, corners and the cycle graphic:

| | Hearth (default) | Moonpaper | Pebble |
|---|---|---|---|
| Feel | Warm and familiar | Calm, a printed almanac | Brighter and friendlier |
| Cycle graphic | A ring that fills through the cycle | A dial of dots, one per day | A path of pebbles, scrolled to today |
| Headings, numbers | Fraunces, at its softest | Instrument Serif | Bricolage Grotesque |
| Text | DM Sans | Instrument Sans | Atkinson Hyperlegible Next, made for low vision |
| Corners | 18 px | 10 px, round calendar days | 24 px, pill buttons |

Colours. Every text pair, in all six palettes, is checked to WCAG AA in Phase 2 before it ships.
`--sage` was renamed `--fertile`, because Moonpaper's is blue.

| Token | Use | Hearth light | Hearth dark | Moonpaper light | Moonpaper dark | Pebble light | Pebble dark |
|---|---|---|---|---|---|---|---|
| `--bg` | Page | `#FBF6F0` | `#1F1A17` | `#EFEBF1` | `#1B1930` | `#FCEBE1` | `#231920` |
| `--surface` | Cards, sheets | `#FFFBF7` | `#29221E` | `#F9F7FA` | `#24213F` | `#FFF8F4` | `#33242D` |
| `--ink` | Text | `#3B2F2A` | `#F3EAE2` | `#2B2745` | `#EDE8F3` | `#3A2230` | `#FBEDE9` |
| `--ink-soft` | Secondary text | `#6E5E55` | `#BFAFA4` | `#5F5A78` | `#B2ABC8` | `#775766` | `#D0B4BD` |
| `--accent` | Buttons, links | `#A9533A` | `#E08C6D` | `#B0456A` | `#F08EA8` | `#8E2F5A` | `#F29BBE` |
| `--on-accent` | Text on buttons | `#FFFFFF` | `#1F1A17` | `#FFFFFF` | `#1B1930` | `#FFFFFF` | `#231920` |
| `--period` | Period days | `#C96F5A` | `#D9826C` | `#C4566F` | `#E8839C` | `#CF5479` | `#EB7E9C` |
| `--blush` | Predicted days, soft fills | `#F2D9CF` | `#4A3029` | `#EAD2DC` | `#472D48` | `#F6CFD2` | `#5A3342` |
| `--fertile` | Fertile-window estimate | `#7A8B6C` | `#9DB08D` | `#4F7891` | `#8FB6CC` | `#5E8F70` | `#93C3A2` |
| `--line` | Hairlines | `#EADFD2` | `#3A312C` | `#D9D3DF` | `#36325A` | `#EFCFC3` | `#48333E` |

- **The look belongs to the phone, not to a vault.** It is sealed under KN (§6), so the lock screen
  shows it before any PIN, and the real and decoy vaults share it: a decoy that opened in a different
  look would give itself away.
- **Type.** All six families are OFL-licensed and **bundled as woff2** — no font CDN, since a CDN
  request reveals who is opening the app. Latin only, from Fontsource: Fraunces with its weight and
  softness axes, the others with their weight axis only — 242 KiB in seven files (the full families
  would be 357 KiB). Fonts have their own 400 KiB budget, apart from the code's — 512 KiB loaded at start,
  640 KiB in all, counting code loaded only when a screen needs it (*raised 2026-09-15, for the QR
  reader*) — and a phone loads only the fonts of the look in use. Loaded only when needed: the QR
  reader (33 KiB, on a phone without its own) and the sharing screens with the share formats (34 KiB,
  when Sharing is opened). *At 2026-09-15: 472 KiB at start, 548 KiB in all. The provider app, under
  the same budget: 446 KiB at start, 478 KiB in all.*
- **Shape.** Generous space, one accent, hairline dividers; radii as in the table.
- **Meaning is never colour alone.** Flow shows as fill level and a label; predictions use an
  outline; the fertile window uses a pattern.
- **Motion.** 150–250 ms ease-out; the ring fills gently. `prefers-reduced-motion` is honoured.
- **Theme.** Follows the host theme subscription (P12), falling back to `prefers-color-scheme` only
  outside the app. *Corrected 2026-09-14 (P12, Android): the host was dark while the phone was set
  to light, so inside the app `prefers-color-scheme` gives the wrong answer — the host's `variant`
  decides.*

## 5. Data

```ts
type ISODate = string; // "2026-09-11"

interface DayEntry {
  date: ISODate;
  flow?: "spotting" | "light" | "medium" | "heavy";
  periodStart?: boolean; // user override; otherwise inferred
  symptoms?: string[]; // cramps, headache, bloating, tender, acne, fatigue, backache, nausea, …
  mood?: string[];
  energy?: 1 | 2 | 3 | 4 | 5;
  fertility?: {
    // trying-to-conceive mode only
    lhTest?: "negative" | "positive";
    temperatureC?: number;
    fluid?: "dry" | "sticky" | "creamy" | "watery" | "eggwhite";
  };
  intimacy?: { protected?: boolean }; // trying-to-conceive mode only; sensitive
  note?: string;
  updatedAt: number;
}

interface Settings {
  schema: 1;
  modes: { fertility: boolean; ttc: boolean; pregnancy: boolean };
  typicalCycle?: number;
  typicalPeriod?: number;
  reminders: { enabled: boolean; wording: "discreet" | "plain" };
}
```

Symptoms and moods are stored as ids (`cramps`, `calm`) and shown in words from `src/i18n/`.
Temperatures are stored in °C and shown in °F where the phone's region uses it. Saving a day
replaces only what the log sheet edits; a period-start override or energy stays as it was, and
trying-to-conceive details are hidden, not erased, while that mode is off.

**Storage layout** (host local storage, already namespaced per product):

| Key | Holds |
|---|---|
| `a/v1/meta` | Format version, scrypt salt and parameters — plaintext, and the same with or without a PIN |
| `a/v1/slots` | Two wrapped keys of identical shape, in random order |
| `a/v1/names` | The list of record names, encrypted under KN — shared by both vaults, so erase can find every record |
| `a/v1/look` | The chosen look (§4), encrypted under KN — readable before unlock, shared by both vaults, removed by erase |
| `a/v1/tries` | Wrong PINs in a row and when the next try is allowed (§6), encrypted under KN — written at the first launch, so its presence says nothing about whether a PIN is set |
| `a/v1/r/0/<id>`, `a/v1/r/1/<id>` | Encrypted, padded records, one set per slot. `<id>` is derived from the record name under KE, so the store does not list months in the clear |

Records are named `settings`, `m/2026-09`, and so on. One record per month means logging a day
rewrites one small record, not the whole history. Records are padded to 1 KiB steps. The record size
limit comes from P1.

- **Every record is mirrored.** Under each record name, both slots hold bytes of the same length, and
  that length never shrinks. Where a vault has no record of its own, the bytes are random. Bytes that
  may be the other vault's are only ever lengthened with random bytes, never replaced, so a record is
  read by trying each 1 KiB prefix until one opens. A copy of the store therefore shows how large each
  record has ever been, but not which slot holds it, or whether both do.
- **Each record carries its own name inside the encryption,** so a record copied onto another key
  fails to open instead of showing the wrong month.

*Corrected 2026-09-11 (Phase 1): the first layout named months in the clear and did not mirror
records, so the store would have shown which slot held data, and when a decoy was in use.*

## 6. Keys and vaults

```
deriveEntropy("almanac/v1/device") ──HKDF──►  KE   device key, never stored
PIN        ──scrypt──►  P′ ;   KP = HKDF(KE ‖ P′)    PIN key — needs the device AND the PIN
duress PIN ──scrypt──►  D′ ;   KD = HKDF(KE ‖ D′)
backup code (128 bits + 12-bit check) ──HKDF──►  KB (backup key),  TB (backup topic)
KE ──HKDF──►  KN    seals the list of record names and the chosen look; also derives each record's storage id

DK  random 32 bytes per vault; encrypts that vault's records (XChaCha20-Poly1305)
    stored wrapped under:  KE (no PIN)  or  KP (PIN on); never leaves the phone
BK  random 32 bytes per backup; seals that backup's snapshot, and travels inside it wrapped under KB
```

- **Two vaults from the first launch**, always. Slot order is random. With no duress PIN set, the
  second slot holds random bytes of exactly the same shape as a real wrapped key and a real vault.
  So the store never reveals whether a decoy exists.
- **Unlocking** tries the entered PIN against both slots; whichever unwraps is the vault that opens.
  Which slot is "real" is recorded nowhere.
- **The PIN** is 6 digits, entered on a keypad. **Wrong guesses** share one counter across both
  slots (`a/v1/tries`), kept across launches: five tries, then waits of 30 seconds, a minute, 5
  minutes, 15 minutes, and an hour each after that. No automatic wipe. Changing the PIN, turning it
  off, setting up a duress PIN and showing the backup code all ask for the current PIN first, and
  those guesses count too. *Forgot your PIN?* on the lock screen explains that nobody can open
  almanac without it and offers *Erase everything and start again*.
- **Auto-lock:** with a PIN set, almanac locks once it has been out of sight for a minute, so
  pasting a backup into Notes does not mean entering the PIN again. *Lock now* is in Privacy.
  *Decided 2026-09-14.*
- **Duress PIN** needs a PIN to be set. By default it opens the decoy vault, which should look
  lived-in: it starts with a copy of the real vault's settings and, unless the user says no, example
  months near their usual cycle length (the tryout's, §2). *Decided 2026-09-14.* **"Also erase the
  real data"** is a separate opt-in: it overwrites the real slot with random bytes, which cannot be
  undone. In some places destroying data under pressure carries legal risk, and the setting says so
  in plain words. Whether a duress PIN is set is recorded only in the vault that set it (a
  `protection` record, left out of backups), so the decoy shows none. **Inside the decoy, turning off
  the PIN or setting up a duress PIN overwrites the real vault** — refusing would give the decoy away
  — and the duress screen says so before it is set up.
- **Erase everything** overwrites both wrapped keys with random bytes first — from then on no record
  can be opened, whatever happens next — and then removes every record.
- **Because KP includes KE,** someone who copies the raw storage off the phone cannot brute-force
  the PIN offline; they would also need the device key, which only the host can produce for this
  product.
- **scrypt parameters** are set from P11 — the target is about 300 ms on a mid-range phone. N = 2¹⁶,
  r = 8, p = 1: 169 ms on a Pixel 10 Pro XL (2¹⁷ took 328 ms), so roughly 300–500 ms on a mid-range
  phone. *Set 2026-09-14; to be checked on an iPhone and a mid-range Android.* The parameters are
  stored per vault, so they can change later without a migration.

## 7. Predictions

Everything runs on the phone.

- **Cycle lengths** come from period starts: the first flow day after at least 10 days without flow,
  or the user's explicit start. Lengths under 15 or over 90 days are kept but left out of
  predictions, and the user is told gently.
- **Next period** = the median of up to the last 6 cycles. The range is the interquartile range,
  widened to at least ±1 day, and wider still with fewer than 3 cycles.
- **Before two cycles exist,** the user's stated typical length is used (or 28) with the words *still
  learning your rhythm*.
- **Irregular cycles** (standard deviation over 7 days): a wider range and gentler wording — never
  an alarm.
- **Fertile window (opt-in):** ovulation ≈ next start − 14 days, ± 2. The window is ovulation − 5 to
  ovulation + 1. Always labelled *estimate*. **No contraception claims, and never "safe days"** —
  those would make almanac a regulated medical device.
- **Pregnancy mode** pauses predictions.

## 8. Backups

*Unblocked 2026-09-16 (P6b), having been blocked since 2026-09-14 (P6): the SDK's `cloudStorage.upload`
still fails, because it signs with the product account, which holds no authorization. But the host has
an upload path of its own — `getPreimageManager().submit()` — and it stores for us, paid out of a slot
account the host keeps the key for. The bytes come back through both the app and the gateway. So
Bulletin backups can be built; the copied backup below stays the fallback, and is still the only
backup that does not expire.*

**Format** — the same for Bulletin backups and the export file:

```
"ALM1" | version | key source (1: HKDF from the backup code) | BK wrapped under KB | XChaCha20-Poly1305(BK, padded snapshot)
```

- **The backup code** is 28 letters and digits in seven groups of four — `K7Q2 9XMA 3JDE W4PN RT6H
  B8CZ 51VF` — 128 random bits and a 12-bit check that catches a mistyped character. Crockford's
  alphabet: no I, L, O or U, and reading it ignores case, spaces and dashes. It needs no stretching,
  being random. *Changed 2026-09-14: it was to be 12 words from a 2048-word list — the same list
  and length as a wallet's recovery phrase, which could teach people that typing 12 words into an
  app is normal.* It is made the first time a backup is set up, shown, checked by typing it back, and
  kept in the vault so later backups use the same one and it can be shown again (after the PIN).
- **Each backup has its own key, BK,** so the vault's key never leaves the phone. *Corrected
  2026-09-14: the first format carried DK itself.*
- **The snapshot** is every record of the vault except `protection`: a restored almanac starts
  without a PIN or duress PIN, which are set per phone.

- **Padding buckets:** 16 KiB, 64 KiB, 256 KiB, 1 MiB — the smallest that fits. *Confirmed 2026-09-17
  (P6c): all four go up whole through the host's preimage path, each as one transaction under one
  content hash, charged at exactly its own size with no overhead. The largest is the slowest by far —
  16 KiB took 6.7 s, 1 MiB took 41 s — so a backup sized 1 MiB is a deliberate choice, not a free
  one.*
- **Schedule:** when the app opens and the last backup is at least 5 days old, plus *Back up now*.
  Never on every log, so neither timing nor size says how much was logged. The interval comes from
  P7.
- **Pointer:** a statement on topic `TB`, channel `H("almanac/backup")`, whose data is the CID and
  time encrypted under a key derived from KB — well under 512 bytes. The longest TTL P9 allows.
- **Restore:** enter the backup code → derive KB and TB → read the newest pointer on TB → fetch the
  CID → unwrap DK → decrypt. The backup code does not depend on the Polkadot account, so this works
  after an account reset. *P7, 2026-09-14 (Android): the fetch works through the app itself, but
  only for BLAKE2b-256 CIDs — the SDK's default, which almanac keeps for everything it uploads. The
  host did not find a SHA-256 upload that the gateway served.*
- **Fallback:** the same backup, copied as text — to paste into a note, an email to yourself, or a
  password manager — and restored with the same backup code, by pasting it or by choosing a file
  that holds it. *Corrected 2026-09-14 (P4, Android): no file can leave the app — a download, sharing
  a file, Web Share and print all do nothing — but copying text works, and so does reading a file the
  user picks.* A 16 KiB backup is about 22 KB of text: a line saying what it is, then `almanac1:`,
  the backup in base64url, and a full stop — which marks the end, since words pasted after it are
  made of the same letters. Line breaks and spaces a note or an email adds in between are ignored.
  If copying fails, the text is shown to copy by hand. Privacy shows when a backup was last copied,
  and says when something has been logged since.
- **Status line:** *Backed up 3 days ago.* If retention is about two weeks (P7): *Backups stay
  available while you open almanac at least once a week.*

## 9. Sharing

Once someone has seen your data, no technology can make them unsee it. So in almanac:

- **Before they open it:** stop sharing, and they can't.
- **After they open it:** stop sharing, and they get nothing new.
- **Every share ends** — 7 days by default, 90 at most. Renewable, never "forever".
- **When anything goes wrong,** a share stops working; it never shows more.

| Kind | For | How | Stop sharing |
|---|---|---|---|
| **Live share** | Family or a partner with almanac | Pair by scanning their QR code. It carries their almanac sharing key (X25519, derived from their `deriveEntropy`) — not their Polkadot username. Updates when you open almanac | Anytime; future updates use a new key |
| **Provider share** | A doctor, midwife or clinic, in their own provider app | At the visit: the patient scans the provider's code, checks the name and six digits, chooses what to share and shows it back as codes. Every opening needs the patient's *Allow* — for 15 minutes, an hour or the rest of the day | Anytime; the provider app deletes its copy, and does anyway at the end date |
| **Visit summary** | A clinic visit | A clean summary on the phone's screen, to show, or copied as text. *Corrected 2026-09-14 (P4): the app cannot print or save a file, so it is no longer a printable file* | Cannot be taken back once copied — and the app says so first |

**What you choose in every share:** categories, date range, end date.

| Category | Default in a new share |
|---|---|
| Periods and cycle lengths | on |
| Symptoms | on |
| Mood | off |
| Notes | off |
| Fertility window | off |
| Trying to conceive: ovulation tests, temperature, cervical fluid | off |
| Sex | off |
| Pregnancy | off |

*Changed 2026-09-15: sex is a category of its own, apart from trying to conceive. What was logged is
offered whenever the days chosen hold some, even with its mode off now; the fertile window and
pregnancy, which almanac works out, only while their modes are on.*

*Changed 2026-09-14: the timed link for a doctor on the web is replaced by the provider share — a
provider app of their own, pairing in person, and the patient's approval for every opening.*

### Provider shares

*Decided 2026-09-14.* For a doctor, midwife or clinic, who uses a provider app — a separate Product
that only views, then forgets.

**At the visit — two scans, no network:**

1. The provider app shows a code: a pairing key made for this one patient, a key for the first
   opening, and the provider's name as they typed it — and beside it, six digits worked out from
   the pairing key. Codes are digits and capital letters (Crockford's base32), which a QR code
   packs most tightly.
2. The patient taps *Share with a provider* and scans it. almanac shows the name and the six digits,
   to check against the provider's screen. A swapped code — a sticker over the real one — shows
   other digits.
3. The patient chooses categories, dates and an end date (the defaults above), sees exactly what
   the provider will see, and picks how long this first opening lasts: 15 minutes, an hour or the
   rest of the day.
4. almanac shows the share as a short loop of codes, and the provider app reads them. It opens for
   the time chosen, with a countdown, and then the provider app forgets what it showed.

**Later — the provider asks, the patient allows:**

5. The provider app sends a request through the statement store. almanac cannot hear it while it
   is closed, so the patient sees it the next time they open almanac: *Dr Okafor asks to see what
   you shared (asked 3 hours ago)* — *Allow for 15 minutes · an hour · the rest of the day*, or
   *Not now*.
6. On *Allow*, almanac answers through the statement store, and the share opens on the provider's
   side for that long.
7. *Stop sharing*, anytime, in Privacy: almanac forgets the share's key, so it can never allow
   another opening, and tells the provider app, which deletes its copy. It deletes it at the end
   date anyway.

**Keys:**

```
provider app   P    X25519 key pair, new for each pairing           (its public half is in the code)
               E0   X25519 key pair for the first opening           (in the code too; dropped when it ends)
almanac        S    X25519 key pair, new for each share             (its public half is in the share)
               KS   random 32 bytes per share; seals the selection  (XChaCha20-Poly1305)
pair key       X25519(S, P) ──HKDF──►  the request and answer topics, the keys that seal them,
                                       and the six digits of the second check
an opening     the provider app makes a key E for each request; the answer carries KS sealed to E
```

- **Two checks, not one.** The six digits on the provider's code are of their pairing key alone —
  all either side knows while that code is still the only thing exchanged — so they catch a code
  swapped for another, and nothing else. Once almanac has made the share and the provider app has
  read it, both hold both keys, and six more digits come from the pair key itself: the same on both
  screens unless something came between them, in either direction. The first is scanned at the
  start, the second compared at the end: almanac shows it beside the codes it is displaying
  (`sharing/ShareFlow.tsx`), and the provider app shows it once it has read them — **before anything
  is kept** (`provider/src/NewPatient.tsx`). A provider app whose digits differ keeps no patient and
  no opening; the patient is asked to share again. *Added 2026-09-16 to the formats (`pairDigits`)
  and to both screens.*
- **The provider gets the sealed selection at once, but not KS.** Only an approval carries it,
  sealed to that opening's key. The first approval comes with the share, for E0 — a key of its own
  rather than P, which the provider app keeps to ask again — so it opens nothing once that first
  opening ends. *Refined 2026-09-14, building the formats.*
- **Nothing from the vault leaves** — not the vault's key, not the backup code. A share's keys are
  its own, kept in the vault with the share. The decoy has no shares.
- **Approvals are sealed, not signed.** The pair key authenticates them (X25519 box), so the
  provider app knows they came from the patient's almanac, but it cannot prove that to anyone else.
  A signature could: it would be evidence that someone sought care, which matters where cycle data
  has legal consequences. *Open question: if providers need a consent record they can show, the
  patient could choose to add a signature.*
- **One opening, then forgotten.** The provider app keeps KS and the opened selection in memory
  only, and drops them when the time is up, when the patient stops sharing, or when the app locks or
  closes. A request's key E waits in its vault, behind its PIN, until the request is answered or the
  share ends, since the patient answers whenever they next open almanac. *Refined 2026-09-15,
  building the provider app: E was to stay in memory too, which would have lost every answer that
  came after the app closed.*

| Message | From → to | Carried by | Size |
|---|---|---|---|
| Pairing code | provider app → almanac | a code on screen | about 100 bytes |
| Share, with the first approval | almanac → provider app | a short loop of codes; WebRTC after P13; Bulletin after P6 | padded to 2, 4, 8 or 16 KiB |
| Request | provider app → almanac | the provider app's one requests statement | 93 bytes; five fit |
| Approval, or stop | almanac → provider app | almanac's one sharing statement, replaced each time | 157 bytes; three fit. *Changed 2026-09-16: 125 bytes and four, before an approval carried the CID of the blob it opens* |

- **The statement budget.** almanac keeps one sharing statement — approvals and stops for every
  provider, always padded to 512 bytes, and later the live-share outbox pointer — and one backup
  pointer: the two P9 allows. Its topics are those of the providers it is answering, so each
  provider app hears only its own. A provider app likewise keeps one requests statement for all its
  patients.
- **What an observer sees:** statements of one size, under topics nobody else can compute, and when
  each was posted. That timing could suggest that a patient answered a provider (THREAT-MODEL R9).

**The provider app — view only, then forget** (decided 2026-09-14; built 2026-09-15 in `provider/`,
a Product of its own at `almanacappprovider.dot`). Until a share's end date it keeps the sealed
selection, the pairing keys, a waiting request's key and a label the provider typed, all in a vault
like almanac's under its own device key — never KS or the opened selection. No patient list beyond
those labels, no export, no copy.

- It imports almanac's own code for the formats, the vault, the host, the codes and what a share
  shows (`@app/…`), so the two apps cannot disagree about a format, and the provider sees a share
  drawn by the same code as the patient's preview.
- One clinician, one device. A 6-digit PIN, locking a minute after the app leaves the screen, as
  almanac does. A forgotten PIN means erasing everything, and patients share again at their next
  visit. No decoy PIN and no backup: nothing it holds outlives a share.
- One look: Moonpaper, light or dark as the phone is.
- Setup takes the provider's name as patients will see it (40 bytes at most, and nothing almanac
  would refuse to show), then the PIN.
- *New patient* takes an optional note to know them by, then shows the code as large as the screen
  allows, with the name and the six digits. Then the camera reads almanac's codes, in any order,
  counting them as it goes.
- The share opens at once for the first opening, with a countdown. When the time is up, what it held
  is gone from the screen.
- *Ask to see it again* puts a request for that patient, with a new opening key, in the provider
  app's one requests statement, replacing any earlier ask of theirs. A statement has four topics, so
  it waits on four patients at most at once, and a fifth ask says so.
- While open, it listens on each kept patient's answer topic, and hears answers that came while it
  was closed. An approval opens the share only if it is for the request still waiting and its time
  is not up. A stop deletes the patient, with a notice.
- The tryout, outside the Polkadot app, keeps nothing: no PIN, and a share read at the visit is gone
  when the page closes. Asking again needs the Polkadot app.
- It keeps almanac's promise of no requests outside the app, under the same check and budget as
  almanac.

### Provider registration and licence

*Decided 2026-09-16. A provider app is not something anyone should be able to publish and point at
patients, so a registry says which clinics are real, and a licence pays for the app that serves them.*

**Approval comes first, and is separate from paying.** An **Approver** — the developer now, the role
written so a medical board or an accreditation body can hold it later — decides that a clinic is a
clinic. The evidence for that (a licence number, a jurisdiction) is submitted out of band and only its
**hash** is kept on chain: the registry says *approved*, never *here are their papers*.

**The licence sits on top of approval.** A **free tier of one seat** for an approved clinic, and a
paid tier per clinic per year, seats added pro rata. A lapsed licence **drops to the free tier** — it
never drops to nothing. What a lapse stops: taking **new** patients, and **asking** to reopen a share.
What it never stops: an opening the patient has already allowed. A licence must not be able to fail in
the middle of a consultation.

**almanac refuses to pair with a clinic the registry has not vouched for**, or whose attestation has
run out. That is the only enforcement a patient can feel — a contract cannot stop a modified app from
reading a share it already holds, so what a contract is really for is saying who may take new patients,
and being paid for it.

**The patient's phone asks nobody.** The check is an **attestation** — the registry's signature over
the clinic's identity key, a tier, an expiry and the clinic's name — carried inside the pairing code
and checked against a registry key built into the bundle (`app/src/share/attest.ts`). No chain call,
no network, nothing leaves the phone. Two reasons, and the second is the stronger: a clinic room may
have no signal, and asking a chain *"is this provider licensed?"* would tell whoever answered which
provider this patient is sitting with. A light client would not fix that — it fetches proofs of the
keys it asks about — and would not fit either: smoldot is some 6.5 MB against a 640 KiB code budget,
every byte of which is uploaded to Bulletin and renewed.

**What the code carries, and what it costs.** The pairing code is
`provider key | first opening key | attestation (110 bytes) | the clinic's signature (64) | name` —
281 bytes against 93 before. The clinic's signature is what stops a real attestation being lifted out
of one clinic's code and shown inside another's: it ties one vouched-for clinic to the one pair of keys
in front of this patient. The cost is the QR code, which goes from version 7 to 13, 45×45 modules to
69×69. *Decided 2026-09-16:* one still code, denser, rather than splitting it into a two-code loop —
the code held up at a visit stays one thing to scan. Measured, not guessed: nothing below version 12 is
reachable while the attestation travels in the code, and dropping error correction only reaches 11 by
making a screen-to-screen scan less forgiving. So if it ever needs to grow again it must be split
rather than squeezed, and `app/src/qr/encode.test.ts` holds 13 as a ceiling against creep.

**A clinic registers before it can show a code at all.** The provider app makes the clinic an identity
key on first launch and shows the public half; the registry issues an attestation *for that key and that
name* (`tools/issue-attestation.mjs`), and the clinic pastes it back. The app checks it against the same
registry key almanac uses — it can check one, never sign one — so a registration issued under the wrong
name, or for another device's key, is caught at setup instead of in front of a patient. An app holding
no attestation can render no pairing code, which is the behaviour the rule above describes from the
patient's side.

**Revocation is an expiry.** An attestation lasts weeks, not years. The provider app renews it while it
is online, **through the host's chain client** — no new outbound requests, no allowlist entry, no bundle
cost. A clinic that is revoked simply stops being renewed, and stops being able to pair when what it
holds runs out.

**Off the phone, trust nobody.** Issuing attestations, watching the registry and auditing it want a
verifying client rather than a public RPC, and that is exactly what `pine-rpc` is for: a smoldot light
client behind an `eth_*` endpoint on localhost, which the registry operator — or any clinic, or anyone
checking the developer's claims — can run.

**The signatures here are the only ones in almanac, and they are about the clinic.** Everything between
almanac and a provider app stays sealed rather than signed, so neither can prove to anyone else what
passed between them. The registry signs a statement about a clinic; the clinic signs its own pairing
code. The patient signs nothing, and an attestation is evidence that a clinic exists, never that it has
a patient.

**Bulletin rails** — designed, not yet built; unblocked 2026-09-16 by P6b, which found an upload path
that works (the host's, not the SDK's). The same sealed selection, padded and uploaded, so an updated
share can reach the provider away from the visit. Before the first upload almanac says, once: *To let
your provider see this away from the visit, almanac puts an encrypted copy on a public storage network
run by many computers. Nobody can read it without your OK, and the copy may stay there after the share
ends* (R7).

*Decided 2026-09-16, once the payload could be public:*

- **A fresh `KS` for every upload.** At the visit one key seals one share; on the rails each upload is
  a new blob under a new key, and the approval that opens it carries that key, masked to the opening
  as approvals already are. So *stop sharing* keeps its meaning exactly: the next key is never
  released, and they get nothing new. What they opened before, they keep — as they always could
  (R2) — but on public storage they keep the object itself, not a memory of it (R10).
- **Retention is the only hard deletion almanac has.** A stopped share becomes unreadable to
  everyone, the provider included, within about a fortnight, because nobody renews it. The Sharing
  screen may say so; nothing else almanac does can promise that.
- **The approval carries the CID**, which is why three openings now fit a statement where four did.
- **Nothing about trust changes.** `KS` never travels with the ciphertext, and never has: only an
  approval carries it, masked to one opening. That is what makes a public blob safe to publish at
  all, and it is the same choreography the visit already uses.
- **The pairing stays in person** (decided 2026-09-16). The two scans remain the only root of trust:
  no remote first contact, and no re-pairing a new device from an old pair key. A provider who
  changes device pairs again at the next visit. This is what lets almanac authenticate a provider
  without either side holding an identity, and it is why a stolen provider vault cannot become a new
  relationship (R11).

**WebRTC** — after P13: for a larger share at the visit, the two codes carry the connection details
instead, and the share goes over a direct connection on the same Wi-Fi, with no server. If the
phones cannot reach each other, the loop of codes.

**What almanac tells the patient before the first share:** *They can't open it without your OK.
When you stop sharing, they get nothing new and their app deletes its copy. Anything they saw, they
could have written down or photographed.* It heads the Sharing screen in Privacy.

**The screens** (built 2026-09-15):

- *Share with a provider* scans their code, or takes it pasted. A share's code, or anything else,
  is refused in words ("That isn't a provider's code"). The name and six digits come next, with *Yes,
  both are the same* or *No, something's different* — which goes back to scanning, saying why.
- The choices start at the defaults above, over six months, ending in a week, each category a switch
  of its own. What was logged is offered whenever the days chosen hold some — trying-to-conceive
  details and sex even with that mode off now; the fertile window and pregnancy only while their
  modes are on. A category switched on and then left behind by a change of dates is not shared. Days
  are three months, six, a year, everything, or any dates picked.
- The preview is drawn from the packed selection unpacked again, so it is exactly what the provider
  app will read. Below it, the first opening — 15 minutes, an hour or the rest of the day — with none
  picked in advance. The rest of the day ends at midnight, and no opening outlasts the share.
- The share is kept in the vault before its codes are shown, so it can be stopped from the moment the
  provider app might have it; *Stop, don't share this* stops it there and then.
- Sharing lists each share — who, what, which days, when it ends — and each opening allowed, with
  one still open shown as *Open on their screen now, until 3:40 PM*. *Stop sharing* asks first and says
  what it cannot do: an opening already allowed stays open until its time is up, since the provider
  app holds that opening's key. It says almanac tells the provider app to delete its copy, and that
  the app deletes it by the end date anyway.
- *Allow* (built 2026-09-15). While almanac is open it listens on the request topic of each share it
  can still allow; a subscription hands over the requests already waiting as it opens (P9). A waiting
  request shows on Today — *Dr Okafor asks to see what you shared. Asked 3 hours ago.* — with the
  three lengths, none picked in advance, and *Not now*. Several asks for one share wait as one. Either
  answer is kept with the share (the last 32 requests' keys), so a request still sitting in the
  provider app's statement is not asked about again; the provider app can always ask anew.
- The sharing statement holds an approval for each opening asked for that is still open, then a stop
  for each share stopped before its end date — the newest of each first, three at most. It is sealed
  afresh and sent whole on every change, living 90 days, with the statement allowance asked for once
  a session before the first. If three open approvals fill it, a stop waits until they end; that share
  cannot be opened meanwhile. A change that could not go out stays due, and goes the next time almanac
  opens. Stopping takes effect at once either way: the share's key is gone. *Changed 2026-09-16: four
  at most, until an approval had to carry a CID as well — 157 bytes into 511 leaves three. Three
  openings at once, across every provider, is the ceiling that buys Bulletin rails; if it ever binds,
  the CID moves to an index blob behind one pointer entry.*
- The listening and the statement load only when there are shares (7 KiB).

**How live shares work underneath:**

- Each share has its own random key `KS`. The shared snapshot is encrypted under `KS`, padded, and
  uploaded to Bulletin.
- The sharer keeps **one outbox statement** — topic `TO` (random, given to recipients when pairing),
  channel `H("almanac/outbox")` — pointing at the CID of an **index blob** on Bulletin. The index has
  one entry per active share, each encrypted so only that share's recipient can read it, holding the
  data CID.
- **Stop sharing** = upload a new index without that entry and replace the outbox statement on the
  same channel (last-write-wins). Live shares also rotate `KS`. *P9, 2026-09-14 (Android):
  replacement works — after A, then B, on one channel, a fresh subscription saw only B.*
- **The budget:** one sharing statement — the outbox pointer, with provider approvals (above) — plus
  a backup pointer is two small statements, however many shares exist. *Corrected 2026-09-14 (P9): that is the whole budget, not a part of it. A full
  account refuses a statement that expires sooner than the shortest one it holds. In the first run
  one account held only two small statements; later runs held more — perhaps each allowance grant
  adds room — but until that is settled, almanac plans for two. So both pointers use the longest
  lifetime (90 days is accepted), and each is refreshed well before it lapses.*
- **Keeping shares alive:** Bulletin retention (~2 weeks) and the statement TTL mean shares are
  refreshed when the sharer opens almanac. If they don't, shares stop working (fail closed). The app
  says: *Your shares stay up to date when you open almanac.*
- **Recipients' apps delete shared data** at expiry or when the outbox drops their entry. This is a
  courtesy, not a guarantee — a modified app could ignore it — and the sharing screen says so.

**Depends on the probe:** P9 (delivery between two phones), P12 and P14 (reading codes — measured on
Android; iOS to check), P13 (WebRTC inside the app), P6 (Bulletin uploads, for the rails). *Changed
2026-09-14: P10 no longer decides anything here, since providers use an app of their own rather
than a web viewer.*

## 10. Reminders

`getNotificationManager().push({ text, scheduledAt })`. On each open, cancel and reschedule the next
two reminders. **Discreet wording by default** — *Time to check in 🌸* — because lock screens are
public. Plain wording (*Your period may start tomorrow*) is an opt-in. *P3, 2026-09-13: a scheduled reminder
arrived with the app closed on Android; iOS is still to check.*

## 11. Import and export

- **Export:** the encrypted backup format above, plus a plain JSON and CSV export behind a clear
  warning that plain text is readable by anyone who gets it. The schema is documented. *Corrected
  2026-09-14 (P4): each is copied as text, since the app cannot save a file.*
- **Import** from a file works: the app can read a file the user picks (P4, Android).
- **Import** (Phase 7): Clue, Flo, Drip, Apple Health. Leaving years of history behind is the most
  common reason not to switch.
