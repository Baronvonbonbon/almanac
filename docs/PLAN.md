# almanac — plan

> The tracked plan. A phase closes when the commit that records its evidence lands — the probe
> report, the passing run, the device recording — not when someone says it is done.

| Phase | | Status |
|---|---|---|
| 0 | Device probe — measure the platform before building on it | 🟡 run on one Android phone ([report](PROBE-REPORT.md)); iOS and two-phone checks wait for the probe's next deploy; P7 continues from a desktop; Bulletin uploads blocked |
| 1 | Foundations — vault, data model, predictions | 🟡 built and tested; the on-device check waits on publishing |
| 2 | Core experience — design, logging, calendar, tryout mode | 🟡 built, and walked through in a browser in all three looks; publishing next |
| 3 | Protection — PIN, duress PIN, erase, export file, backup code | 🟡 built, and walked through in a browser; restore on a second phone to go |
| 4 | Encrypted Bulletin backups | ⬜ |
| 5 | Sharing — provider share and provider app, visit summary, live share | ⬜ designed ([DESIGN §9](DESIGN.md#provider-shares)) |
| 6 | Reminders, insights, health nudges | ⬜ |
| 7 | Production readiness | ⬜ |

## What almanac is

A period and cycle tracker that runs as a Product inside the Polkadot app. It is built around four
things, in this order: **rock-solid privacy, ease of use, no technical jargon, and a soft, warm look.**

The design is local-first. Polkadot delivers the app (a static bundle on Bulletin under a `.dot`
name) and carries encrypted backups and shares. **No cycle data — encrypted or not — is ever written
to a chain**, and nothing in the daily flow needs a signature. See [`DESIGN.md`](DESIGN.md) and
[`THREAT-MODEL.md`](THREAT-MODEL.md).

## Decisions

| Decision | Choice |
|---|---|
| Name | **almanac** |
| Labels | `almanacapp.dot` — prototype and probe, open to any account. `almanac.dot` — production, needs Full personhood. `almanacapp.dot` was registered on 2026-09-13 and is owned by the deploy key until it is transferred to the phone account; `almanac.dot` is not registered. Registration is permanent. *Corrected 2026-09-11:* the prototype was `almanac01.dot` until `pad` refused it. `pad` requires Personhood Lite for a base of 6–8 letters with two trailing digits; only a base of 9+ letters (with or without two digits) is open to a NoStatus signer. The chain's own v2 check had said "Available to all" — `tools/whois.mjs` now prints `pad`'s rule first |
| Environment | Products Devnet, which since the 2026-09-08 update runs on Paseo system chains: Asset Hub 1000, People 1004, Bulletin 1010 (`pad` 0.16.1 `environments.json`) |
| Build standard | Production quality from day one. Devnet is labelled as a preview in the app, because it resets |
| Contracts | **None** |
| Stack | React + Vite + TypeScript. `@parity/product-sdk` 0.27, `-host` 0.19.1, `-crypto` 0.1.1, `-local-storage` 0.3.9, `-statement-store` 0.6.9. npm, not pnpm — `pad` has a phantom dependency pnpm refuses (see `broadside/docs/DEPLOY.md`) |
| Crypto | XChaCha20-Poly1305 and HKDF-SHA256 from `@parity/product-sdk-crypto`; scrypt from `@noble/hashes` for PINs |
| Identity | `deriveEntropy` only. **`getUserId` is never called** — it is a global handle any Product can read. Enforced in CI |
| Optional modes | Fertility window, trying to conceive, pregnancy — all off by default |
| Protection | Optional PIN. Optional duress PIN that opens a decoy; "also erase the real data" is a separate, informed opt-in |
| Backups | Encrypted Bulletin backups + a backup code (28 letters and digits) + the same encrypted backup copied as text, since no file can leave the app (P4) |
| Sharing | Selective by category and date range. Every share expires — default 7 days, maximum 90. Revocable. Providers use a provider app of their own: pairing in person by QR code, and the patient's *Allow* for every opening ([DESIGN §9](DESIGN.md#provider-shares)) |
| Web gateway | Tryout mode: example months on request, nothing saved, a clear "use the Polkadot app" banner. Opened as a fallback when the host can't be used ([DESIGN §2](DESIGN.md#2-surfaces)) |
| Look | Soft, warm, minimal — in three looks, picked on the first screen and changeable in Settings: Hearth (the default), Moonpaper, Pebble ([DESIGN §4](DESIGN.md#4-look--soft-warm-minimal)) |
| License · language | GPL-3.0-or-later · English, with every string externalised from day one |

## Constraints already known

Measured in sibling repos or read from the installed SDK. Each one shaped the design; the probe
re-checks the ones marked with a check ID.

| Fact | Source | Consequence |
|---|---|---|
| Every host-routed signature needs a tap — `AutoSigning` is `NotAvailable` on Android and iOS | broadside Phase 1, device-measured | No chain writes in the daily flow |
| `createLocalKvStore` throws outside a host container | broadside Phase 3, `local-storage` 0.3.9 | An in-memory host for dev and tests; the web gateway can only be a tryout. *Changed 2026-09-14:* dev-dot.li now frames products in a host of its own, whose `deriveEntropy` fails with *Not connected*; almanac falls back to the tryout when a host never answers or can't derive its key before a vault exists |
| `deriveEntropy` is deterministic across a full app restart and scoped per product | broadside Phase 1, device-measured | The device key regenerates from nothing (**P2** checks reinstall and a second device) |
| `getUserId` returns a global username every Product can read | broadside Phase 1 | Never called |
| Bulletin reads are public by CID; retention measured at ~2 weeks, while Parity's docs say content persists | sonde, broadside, le1zuxt9l `DEPLOY.md`; docs.polkadotcommunity.foundation | Everything uploaded is encrypted and padded. Ciphertext is treated as possibly permanent, and backups as possibly expiring (**P7**) |
| A statement holds at most 512 bytes; **1024 bytes per user in total**; default TTL 30 s | `product-sdk-statement-store` 0.6.9 constants | At most two live statements per account: one sharing outbox and one backup pointer (**P9** checks the chain agrees) |
| Statements are signed by "the product's allowance-bearing account, which [the host] picks internally" | `product-sdk-host` 0.19.1, `createProofAuthorized` | No per-share signing account on that path |
| Product accounts derive from the **parent public key**: `deriveProductAccountPublicKey(parentPublicKey, productId, index)` | `product-sdk-keys` | Anyone who knows a user's root account can find their almanac accounts — THREAT-MODEL **R1** (**P8** checks which account really signs) |
| Scheduled notifications exist in the SDK: `push({ text, deeplink?, scheduledAt? })` | `product-sdk-host` 0.19.1 | Reminders are possible if they fire with the app closed (**P3**) |
| The 2026-09-08 devnet update required a reinstall; accounts did not carry over | Parity release notes, press coverage | Backups are not optional, and restore must not depend on the old account |
| `pad` registers any eligible name it is pointed at; republishing needs a phone signature in an interactive terminal | broadside `DEPLOY.md` | `tools/whois.mjs` for name checks; deploys run by hand |
| `pad login` cannot pair with the current Polkadot app ("Mode BIGINT is not implemented"); with no session `pad` signs with its default key, the public dev phrase, which would keep the name | Our deploy attempts, 2026-09-11; [pad#231](https://github.com/paritytech/polkadot-app-deploy/issues/231) (pairing), [pad#234](https://github.com/paritytech/polkadot-app-deploy/issues/234) (fallback, filed by us) | Publish with a local deploy key (`tools/deploy-key.mjs`), then `pad transfer` the name to the phone account once pairing works. `deploy` refuses to run with no owner |
| A deploy key is not authorized to store on devnet Bulletin, and devnet declares no authorizer to ask; `pad`'s CLI signs the upload with the owner key whenever one is set. Its shared upload pool (`//deploy/0…9` of the dev phrase) is authorized | Our first deploy, and a read-only `polkadot-app-bootstrap` status check, 2026-09-12 | `tools/deploy.mjs` calls `pad` as a library: the deploy key signs DotNS, a pool account signs the upload |
| `BulletinAllowance` comes back `Allocated`, yet no account a Product can sign with holds a Bulletin authorization; the SDK's cloud storage signs with product account #0, and uploads fail `Invalid: Payment` | P6 on Android and an on-chain read with a positive control, 2026-09-14 | Backups (Phase 4) and sharing (Phase 5) blocked as designed; reported upstream |
| Nothing leaves the app as a file — download, file share, Web Share and print do nothing; the clipboard and reading a picked file work | P4 on Android, 2026-09-13 | Backups, exports and the visit summary are copied as text (DESIGN §8, §9, §11) |

---

## Phase 0 — Device probe 🟡

**The riskiest assumptions, measured first.** Each answer below can change the design, so none is
assumed. The probe is published under the prototype label — so its answers are about the same
product identity the app will use (host local storage, product accounts and allowances are all keyed
by it).

**Produces**
- [x] `probe/` — a Product that runs each check, keeps a journal in host local storage across runs
      and app restarts, and exports a JSON report
- [x] `tools/whois.mjs` — read-only DotNS lookup
- [x] `almanacapp.dot` registered and the probe published, 2026-09-13 — owned by the deploy key until
      it is transferred to the phone account
- [ ] `docs/PROBE-REPORT.md` — the answers, with the raw JSON reports committed next to it. Started
      2026-09-14 with one Android phone
- [x] `tools/retention.mjs` (`npm run retention`) — P7 from a desktop, through the devnet IPFS
      gateway, each block checked against its CID's own hash

*Decided 2026-09-14: the app replaces the probe at `almanacapp.dot` for the first prototype deploy.
The probe goes back on in a later deploy of its own for the iOS, reinstall and two-phone checks, and
P10 in a phone browser. Host storage belongs to the name, not the bundle, so the probe's journal on
the phone survives the swap. P7 carries on from a desktop in the meantime; only its through-the-app
half waits.*

| ID | Question | How | Decides |
|---|---|---|---|
| P1 | Does host local storage survive a restart, an app update, a reinstall? How much fits? | Install marker + run history; capacity ladder 64 KiB → 4 MiB | Whether reinstall means data loss; record sizing |
| P2 | Is `deriveEntropy` the same after a reinstall, and on a second device with the same account? | An 8-byte fingerprint of the entropy, compared by hand across runs | Whether the device key regenerates, or every restore needs the backup code |
| P3 | Does a scheduled notification fire with the app closed? | `push` with `scheduledAt` two minutes out; confirm on next open | Reminders in v1, or later |
| P4 | Which export paths work inside the app? | Download link, Web Share with a file, share text, clipboard, print | Export file and visit summary |
| P5 | Is host storage included in iCloud / Google device backups? | Manual: back up, restore to another phone, open the probe, read P1's marker | THREAT-MODEL R6 |
| P6 | How large can a Bulletin upload be? | Allowance, then 1 KiB → 1 MiB ladder | Backup padding buckets |
| P7 | How long does Bulletin keep data? | Re-fetch every recorded CID over at least three weeks | Backup schedule and the status wording |
| P8 | Which account signs uploads and statements, and can it be derived from the root account? | Compare the selected account, product accounts 0–2, locally derived keys, and the proof signer | THREAT-MODEL R1 |
| P9 | Statement store: longest TTL, channel replacement, per-account quota, delivery to another phone | TTL ladder 1 h → 90 d; A-then-B on one channel; 400-byte statements until refused; listen on a shared code from a second phone | Revocation design and the backup pointer |
| P10 | What can the web gateway reach? | Fetch a CID through the devnet IPFS gateway; WebSocket to a People-chain RPC, look for `statement_*` methods | What the web tryout can reach. *Changed 2026-09-14:* it was to decide a web viewer for timed links, which the provider app replaces (DESIGN §9) |
| P11 | How fast are scrypt and XChaCha on a phone? | scrypt N = 2¹⁵ … 2¹⁷; XChaCha over 1 MiB | PIN KDF parameters |
| P12 | Host theme and camera | Theme subscription; `getUserMedia` + `BarcodeDetector` | Dark mode; QR pairing for live shares |
| P13 | Does WebRTC work inside the app? | Ask for the `WebRtc` permission, reload, then connect two phones on one Wi-Fi with no STUN server; note the prompt's wording | Whether a provider share can go over a direct connection, or only as codes |
| P14 | Can almanac read a QR code on iOS? | `BarcodeDetector`; if it is absent, the size of a JavaScript reader | Provider shares on iOS, and what they add to the bundle |

**Gate**
- [ ] Every check answered on at least one Android and one iOS device (P2 and P9-delivery need two)
- [ ] P7 has a fetch at 15 days or later
- [ ] `DESIGN.md` corrected wherever an answer contradicts it, each correction dated

---

## Phase 1 — Foundations 🟡

**Produces**
- [x] `app/` scaffold (React 19 + Vite 8 + TS). It shares the published identity with the probe through
      `product.mjs` at the repo root, and its start screen shows it
- [x] `src/platform/` — host local storage and entropy, plus an in-memory host for dev and tests.
      Notifications, cloud storage and statements join with the phases that use them (4–6). The SDK's
      `./testing` fake models storage but not entropy, so it tests the real-host adapter rather than
      replacing the in-memory host
- [x] `src/vault/` — key hierarchy, two-slot layout with mirrored records, duress decoy, erase
      ([DESIGN §6](DESIGN.md#6-keys-and-vaults)). scrypt N = 2¹⁶ from P11 (169 ms on a Pixel 10 Pro
      XL); the parameters are stored per vault, so they can change without a migration
- [x] `src/data/` — month records, settings, a data format version and a migration runner (no
      migrations yet: v1 is the first). Data from a newer almanac is refused, never rewritten
- [x] `src/cycle/` — period detection, predictions, fertile-window estimate
      ([DESIGN §7](DESIGN.md#7-predictions)), with property-based tests
- [x] `src/i18n/` — every string externalised
- [x] CI (`.github/workflows/ci.yml`, not yet run on GitHub): typecheck, tests, crypto test vectors
      (RFC 5869 and RFC 7914, plus pinned v1 derivations and a sealed v1 record), a `dist/` guard
      against external URLs, the banned words checked over `src/i18n/`, and a `src/` guard against
      `getUserId`. Neither text check can read `dist/`: the SDK there contains `getUserId`, and words
      like "transaction" — found 2026-09-11
- [x] A bundle budget of 512 KiB, enforced by the guard. The first build is 350 KiB in 3 files,
      against the probe's 8.9 MB in 46: the app imports `product-sdk-host` and `product-sdk-crypto`
      only, not `product-sdk`'s `createApp` and its chain metadata

**Gate**
- [ ] The vault round-trips on a device through the real host. The start screen does exactly this.
      One name holds one bundle, so the app goes to `almanacapp.dot` (`npm run deploy -w app`) once
      the probe's reports are exported
- [x] `dist/` fits the budget — 350 KiB of 512 KiB, no trimming needed
- [x] The prediction engine passes fixtures: regular, irregular, PCOS-like, postpartum gap, one
      cycle, no cycles
- [x] The `dist/` guard fails a build with a planted external URL — checked 2026-09-11

## Phase 2 — Core experience 🟡

Starts with a design canvas: two or three soft, warm, minimal explorations of onboarding, home, the
log sheet and the calendar. One is chosen before any screen is built. *Done 2026-09-14: three were
mocked up ([`design/looks.html`](design/looks.html)), and all three are kept as looks the user picks.*

*Decided 2026-09-14 — the first prototype:* this phase, plus from Phase 3 the PIN, the duress PIN
and the copied backup with its backup code, offered after three logged days. While P6 blocks Bulletin the copied backup is the only
backup, and the devnet has already reset once. The web tryout is included. *Changed 2026-09-14:*
the probe's remaining checks were to move to a hidden screen in the app, because one name serves one
bundle; instead the probe goes back on in a later deploy of its own (Phase 0).

**Produces**
- [x] Onboarding (four screens at most, the first choosing the look), home (cycle graphic + **Log
      today**), log sheet (three taps at most), calendar, insights (the history of past cycles),
      settings with the look, the mode toggles and the usual lengths
- [x] Web tryout mode, with the same look picker, and example months on request
- [x] Hearth, Moonpaper and Pebble, each light and dark, following the host theme; their fonts
      bundled, within a 400 KiB font budget separate from the code's — 242 KiB, and 449 KiB of code
      of 512

**First run on a phone** — after `npm run deploy -w app`, which replaces the probe
- [ ] Close the Polkadot app fully, then open almanac, so the new build loads; *Preview* shows in
      the top bar
- [ ] Onboarding in each look, with its fonts; the look follows the app's light or dark, not the
      phone's (P12)
- [ ] Log a few days, close the Polkadot app, reopen: they are still there — the Phase 1 gate
- [ ] Turn on a PIN: unlocking feels quick (scrypt N = 2¹⁶). Away under a minute stays open; over a
      minute locks. Five wrong PINs bring a 30-second wait
- [ ] The duress PIN opens the second almanac, with example months; the real PIN opens the real one,
      untouched
- [ ] *Copy backup* reaches the clipboard (P4) and pastes whole into Notes; restore by pasting it and
      from a picked file — on a second phone with a different account if one is to hand (the Phase 3
      gate)
- [ ] Erase everything returns to the first screen
- [ ] `almanacapp.dev-dot.li` in a phone browser shows the tryout, which keeps nothing after a reload
      (the Phase 2 gate)

**Gate**
- [ ] Published to `almanacapp.dot` and used daily for a week on a real device
- [ ] Three to five people outside the project log a day without help, and none of them meets a word
      from the banned list
- [ ] WCAG 2.2 AA contrast in all six palettes, a screen-reader pass, reduced motion honoured
- [ ] Tryout mode on `almanacapp.dev-dot.li` stores nothing — verified empty after a reload

## Phase 3 — Protection 🟡

**Produces**
- [x] Optional PIN with growing lockout delays; auto-lock a minute after the app goes to the
      background
- [x] Optional duress PIN → decoy vault, starting with example months unless declined; "also erase"
      as a separate opt-in
- [x] Erase everything
- [x] Backup code (28 letters and digits, not 12 words — DESIGN §8) and the encrypted backup copied
      as text (P4: no file can leave the app), with restore by pasting or from a picked file

**Gate**
- [ ] Restore from the copied backup + backup code on a second device with a **different** account.
      In a browser, a fresh tryout page — a new account and new storage — restores it (2026-09-14)
- [x] With no duress PIN set, the raw store has the same shape as with one — automated test
- [x] After erase, no record decrypts with any old key — automated test, including an erase cut
      short right after its first write, with and without a PIN (`vault.test.ts`, 2026-09-14)

## Phase 4 — Encrypted Bulletin backups ⬜

Depends on P6, P7, P8, P9.

**Produces**
- [ ] Scheduled, padded backups; the backup pointer statement; restore by backup code on a fresh
      install; "Backed up 3 days ago" status

**Gate**
- [ ] Reinstall → restore from the backup code alone, on a new account
- [ ] Backup timing and size do not depend on how much was logged

## Phase 5 — Sharing ⬜

Provider shares first ([DESIGN §9](DESIGN.md#provider-shares)), decided 2026-09-14: in person by
codes now; later openings through the statement store; WebRTC once P13 shows it works; Bulletin
rails built but switched off until P6. Depends on P9 (delivery between two phones), P12 and P14
(reading codes), P13 and P6.

**Produces**
- [ ] `share/` — the provider-share formats (pairing code, share, request, approval, stop), used by
      both almanac and the provider app, with test vectors
- [ ] almanac: *Share with a provider* — scan, check the name and six digits, choose categories,
      dates and end date, preview, show the codes; *Allow* for 15 minutes, an hour or the rest of the
      day; requests waiting when almanac opens; the shares listed in Privacy, each with *Stop sharing*
- [ ] `provider/` — the provider app, a Product of its own, under a name still to choose
      (registration is permanent): show a pairing code, read a share, view it with a countdown,
      forget it; ask to see it again; delete it at the end date or on *Stop sharing*
- [ ] The sharing statement: approvals and stops for every provider, at one fixed size
- [ ] Bulletin rails with the one-time notice, switched off until P6 works
- [ ] WebRTC at the visit, if P13 shows it works
- [ ] Then: the visit summary (copied as text), and live shares for family or a partner

**Gate**
- [ ] Two phones: a share made at the visit opens on the provider's phone for the time chosen, then
      is gone from it
- [ ] A later request reaches almanac; *Allow* opens it for the time chosen; after *Stop sharing*
      no request is answered, and the provider app deletes its copy
- [ ] Nothing opens without an approval, and an approval opens only its own share — automated test
- [ ] Sensitive categories are off in every new share — automated test

## Phase 6 — Reminders, insights, health nudges ⬜

**Produces**
- [ ] Discreet scheduled reminders (P3)
- [ ] Insights: cycle-length trend, symptom patterns
- [ ] Gentle nudges — cycles under 21 or over 35 days, very heavy flow, missed periods

**Gate**
- [ ] A clinician has reviewed every health-related string

## Phase 7 — Production readiness ⬜

**Produces**
- [ ] Importers: Clue, Flo, Drip, Apple Health
- [ ] Reproducible build, and a record of which commit each published CID was built from
- [ ] External security review of the vault, backups and sharing
- [ ] A renewal keeper for the app bundle on Bulletin
- [ ] `almanac.dot` (Full personhood) and a directory listing
- [ ] A plain-language privacy policy

**Gate**
- [ ] An independent rebuild of a tagged commit yields the published CID
- [ ] Every security-review finding resolved or documented
- [ ] The production label points at a reviewed build

---

## Open questions

Not decidable by measurement alone.

- **Decoy vault and backups.** Should the decoy also back up on the same schedule, so upload history
  cannot reveal which vault is in use? See THREAT-MODEL R3.
- **Quantum.** Shares use X25519 sealed boxes. If ciphertext outlives Bulletin's retention, a future
  quantum adversary could open it. `product-sdk-crypto` declares ML-KEM types but has not implemented
  them. Revisit before Phase 5 ships.
- **If the statement store cannot hold long-lived pointers** (P9), the backup pointer needs another
  home: a tiny pointer contract written through a relay (which gives up "no server"), or restore by
  file only.
