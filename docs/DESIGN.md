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

**Onboarding — three screens at most.** When did your last period start? (a date, or *Not sure*).
How long is your cycle usually? (a number, or *Not sure*). What would you like almanac to help with?
(periods, fertility window, trying to conceive — only the first is on). No backup code on day one:
it is offered after the first week, or the first time backups or sharing are turned on, and a gentle
reminder stays in the Privacy screen until it is saved.

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
on) marked with a pattern as well as a colour.

**Modes.** Fertility window (off), trying to conceive (off), pregnancy (off — pauses predictions,
counts weeks, handles loss with care and without prompts).

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

The right-hand column is a CI check against `dist/`, with an allowlist for strings that are not
user-facing.

## 4. Look — soft, warm, minimal

Starting tokens. Every text pair is checked to WCAG AA in Phase 2 before it ships.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#FBF6F0` cream | `#1F1A17` | Page |
| `--surface` | `#FFFBF7` | `#29221E` | Cards, sheets |
| `--ink` | `#3B2F2A` | `#F3EAE2` | Text |
| `--ink-soft` | `#6E5E55` | `#BFAFA4` | Secondary text |
| `--accent` | `#A9533A` terracotta | `#E08C6D` | Buttons, links |
| `--period` | `#C96F5A` | `#D9826C` | Period days |
| `--blush` | `#F2D9CF` | `#4A3029` | Predicted days, soft fills |
| `--sage` | `#7A8B6C` | `#9DB08D` | Fertile-window estimate |
| `--line` | `#EADFD2` | `#3A312C` | Hairlines |

- **Type.** Fraunces (a soft serif) for the big numbers and headings; DM Sans for everything else.
  Both are OFL-licensed and **bundled as woff2** — no font CDN, since a CDN request reveals who is
  opening the app.
- **Shape.** 16–20 px radii, generous space, one accent, hairline dividers.
- **Meaning is never colour alone.** Flow shows as fill level and a label; predictions use an
  outline; the fertile window uses a pattern.
- **Motion.** 150–250 ms ease-out; the ring fills gently. `prefers-reduced-motion` is honoured.
- **Theme.** Follows the host theme subscription (P12), falling back to `prefers-color-scheme`.

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

**Storage layout** (host local storage, already namespaced per product):

| Key | Holds |
|---|---|
| `a/v1/slots` | Two wrapped-key records of identical shape, in random order |
| `a/v1/s0/settings`, `a/v1/s1/settings` | Encrypted settings per vault |
| `a/v1/s0/m/2026-09`, … | One encrypted, padded record per month per vault |

One record per month means logging a day rewrites one small record, not the whole history. Records
are padded to 1 KiB steps. The record size limit comes from P1.

## 6. Keys and vaults

```
deriveEntropy("almanac/v1/device") ──HKDF──►  KE   device key, never stored
PIN        ──scrypt──►  P′ ;   KP = HKDF(KE ‖ P′)    PIN key — needs the device AND the PIN
duress PIN ──scrypt──►  D′ ;   KD = HKDF(KE ‖ D′)
backup code (12 words, 132 bits) ──HKDF──►  KB (backup key),  TB (backup topic)

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
- **Erase everything** overwrites both slots and every record with random bytes.
- **Because KP includes KE,** someone who copies the raw storage off the phone cannot brute-force
  the PIN offline; they would also need the device key, which only the host can produce for this
  product.
- **scrypt parameters** are set from P11 — the target is about 300 ms on a mid-range phone.

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
  after an account reset.
- **Fallback:** the export file, restored with the same backup code.
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
| **Printable report** | A clinic visit | A clean summary, generated on the phone | Cannot be taken back — and the app says so before creating one |

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
  same channel (last-write-wins). Live shares also rotate `KS`.
- **Timed links:** the link carries `TO`, the entry's tag and half the entry key (in the URL
  fragment, which browsers never send to servers); the access code carries the other half.
- **The budget:** an outbox pointer plus a backup pointer is two small statements — inside the
  1024-byte-per-account limit, with room to spare, however many shares exist.
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
public. Plain wording (*Your period may start tomorrow*) is an opt-in. Depends on P3.

## 11. Import and export

- **Export:** the encrypted backup format above, plus a plain JSON and CSV export behind a clear
  warning that the plain file is readable by anyone who gets it. The schema is documented.
- **Import** (Phase 7): Clue, Flo, Drip, Apple Health. Leaving years of history behind is the most
  common reason not to switch.
