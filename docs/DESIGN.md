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
| **Web gateway** (`almanac.dev-dot.li`) | Tryout mode: sample data, nothing saved. The host API does not exist here (`createLocalKvStore` throws), so this is a constraint, not a choice |
| **Web viewer** (same gateway, opened from a timed link) | Read-only view of one share, if P10 shows the gateway can reach Bulletin and the statement store |

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
from the look.

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
counts weeks, handles loss with care and without prompts).

**Settings.** The look, which changes live so it can be seen before leaving the screen; the modes;
reminders.

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
  would be 357 KiB). Fonts have their own 400 KiB budget, apart from the code's 512 KiB, and a phone
  loads only the fonts of the look in use.
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
backup code (12 words, 132 bits) ──HKDF──►  KB (backup key),  TB (backup topic)
KE ──HKDF──►  KN    seals the list of record names and the chosen look; also derives each record's storage id

DK  random 32 bytes per vault; encrypts that vault's records (XChaCha20-Poly1305)
    stored wrapped under:  KE (no PIN)  or  KP (PIN on)
    and inside every backup, wrapped under KB
```

- **Two vaults from the first launch**, always. Slot order is random. With no duress PIN set, the
  second slot holds random bytes of exactly the same shape as a real wrapped key and a real vault.
  So the store never reveals whether a decoy exists.
- **Unlocking** tries the entered PIN against both slots; whichever unwraps is the vault that opens.
  Which slot is "real" is recorded nowhere.
- **Wrong guesses** share one counter across both slots, with growing delays. No automatic wipe.
- **Duress PIN** needs a PIN to be set. By default it opens the decoy vault, which should look
  lived-in. **"Also erase the real data"** is a separate opt-in: it overwrites the real slot with
  random bytes, which cannot be undone. In some places destroying data under pressure carries legal
  risk, and the setting says so in plain words.
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

*Blocked as of 2026-09-14 (P6): the Bulletin allowance comes back `Allocated`, but no account a
Product can sign with is authorized to upload, so every upload is refused. Reported upstream
([PROBE-REPORT](PROBE-REPORT.md#upstream)). Until it is fixed, the copied backup below is the only
backup.*

**Format** — the same for Bulletin backups and the export file:

```
"ALM1" | version | scrypt/HKDF params | DK wrapped under KB | XChaCha20-Poly1305(DK, padded snapshot)
```

- **Padding buckets:** 16 KiB, 64 KiB, 256 KiB, 1 MiB — the smallest that fits. Final sizes come from
  P6.
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
  user picks.* A 16 KiB backup is about 22 KB of text.
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
| **Timed link** | A doctor or midwife, on the web | A link plus an access code given separately — in person or by phone. The link alone opens nothing | Works until they open it |
| **Visit summary** | A clinic visit | A clean summary on the phone's screen, to show, or copied as text. *Corrected 2026-09-14 (P4): the app cannot print or save a file, so it is no longer a printable file* | Cannot be taken back once copied — and the app says so first |

**What you choose in every share:** categories, date range, end date.

| Category | Default in a new share |
|---|---|
| Periods and cycle lengths | on |
| Symptoms | on |
| Mood | off |
| Notes | off |
| Fertility window | off |
| Trying to conceive, intimacy | off |
| Pregnancy | off |

**How it works underneath:**

- Each share has its own random key `KS`. The shared snapshot is encrypted under `KS`, padded, and
  uploaded to Bulletin.
- The sharer keeps **one outbox statement** — topic `TO` (random, given to recipients when pairing),
  channel `H("almanac/outbox")` — pointing at the CID of an **index blob** on Bulletin. The index has
  one entry per active share, each encrypted so only that share's recipient can read it, holding the
  data CID.
- **Stop sharing** = upload a new index without that entry and replace the outbox statement on the
  same channel (last-write-wins). Live shares also rotate `KS`. *P9, 2026-09-14 (Android):
  replacement works — after A, then B, on one channel, a fresh subscription saw only B.*
- **Timed links:** the link carries `TO`, the entry's tag and half the entry key (in the URL
  fragment, which browsers never send to servers); the access code carries the other half.
- **The budget:** an outbox pointer plus a backup pointer is two small statements, however many
  shares exist. *Corrected 2026-09-14 (P9): that is the whole budget, not a part of it. A full
  account refuses a statement that expires sooner than the shortest one it holds. In the first run
  one account held only two small statements; later runs held more — perhaps each allowance grant
  adds room — but until that is settled, almanac plans for two. So both pointers use the longest
  lifetime (90 days is accepted), and each is refreshed well before it lapses.*
- **Keeping shares alive:** Bulletin retention (~2 weeks) and the statement TTL mean shares are
  refreshed when the sharer opens almanac. If they don't, shares stop working (fail closed). The app
  says: *Your shares stay up to date when you open almanac.*
- **Recipients' apps delete shared data** at expiry or when the outbox drops their entry. This is a
  courtesy, not a guarantee — a modified app could ignore it — and the sharing screen says so.

**Depends on the probe:** P9 (TTL, channel replacement, delivery), P10 (whether a web viewer can
exist — if not, timed links carry a small encrypted snapshot in the link itself, and become
expire-only), P12 (camera for QR pairing; otherwise pairing by a short code).

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
