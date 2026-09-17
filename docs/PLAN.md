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
| Labels | One name per bundle, since 2026-09-16: `almanacapp.dot` — the app, registered 2026-09-13. `almanacprobe.dot` — the device probe, **not registered yet; its first deploy registers it** (`whois`, 2026-09-16: owner none, 10 PAS). `almanacappprovider.dot` — the provider app, decided 2026-09-15 and registered since (`whois`, 2026-09-16). `almanac.dot` — production, needs Full personhood, not registered. All three registered names are owned by the deploy key until transferred to the phone account. Registration is permanent. *Changed 2026-09-16:* the probe shared `almanacapp.dot` with the app, and a name serves one bundle at a time, so each deploy replaced the other — which kept P10 blocked whenever the app was live. The cost of the split is that the probe now measures its own product identity (see Phase 0). *Corrected 2026-09-11:* the prototype was `almanac01.dot` until `pad` refused it. `pad` requires Personhood Lite for a base of 6–8 letters with two trailing digits; only a base of 9+ letters (with or without two digits) is open to a NoStatus signer — which `almanacprobe` is. The chain's own v2 check had said "Available to all" — `tools/whois.mjs` now prints `pad`'s rule first |
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
| QR codes | `qr` 0.7.0 (Paul Miller, no dependencies), measured 2026-09-15 as the app builds it: writing codes 20 KiB, reading them 62 KiB — loaded only on a phone without a built-in reader (`BarcodeDetector`: present on Android, P12; iOS is P14). Against `uqr`, 19 KiB but writing only, and `jsQR`, 269 KiB. The code budget became 512 KiB loaded at start and 640 KiB in all |
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
| `BulletinAllowance` comes back `Allocated`, yet no account a Product can sign with holds a Bulletin authorization; the SDK's cloud storage signs with product account #0, and uploads fail `Invalid: Payment` | P6 on Android and an on-chain read with a positive control, 2026-09-14 | The SDK's upload path stays shut and is reported upstream. *Corrected 2026-09-16 (P6b): backups and sharing are not blocked — they upload through the host's own preimage call, paid by the product's slot account* |
| Nothing leaves the app as a file — download, file share, Web Share and print do nothing; the clipboard and reading a picked file work | P4 on Android, 2026-09-13 | Backups, exports and the visit summary are copied as text (DESIGN §8, §9, §11) |

---

## Phase 0 — Device probe 🟡

**The riskiest assumptions, measured first.** Each answer below can change the design, so none is
assumed. *Changed 2026-09-16: the probe has a name of its own, `almanacprobe.dot`.* It ran under the
app's label so its answers described the identity the app would use — but a name serves one bundle at
a time, so the app and the probe kept replacing each other, and P10 stayed blocked whenever the app
was live. The cost of the split is written down where it can bite: host local storage, product
accounts and Bulletin allowances are all keyed by the product id, so a finding about **specific
accounts or quotas** — P6b's slot account, P6 and P8's authorizations — describes `almanacprobe`, not
`almanacapp`. Platform behaviour still generalises; anything account-specific must be re-run under the
app's own label before it is a claim about the app.

**Produces**
- [x] `probe/` — a Product that runs each check, keeps a journal in host local storage across runs
      and app restarts, and exports a JSON report
- [x] `tools/whois.mjs` — read-only DotNS lookup
- [x] `almanacapp.dot` registered and the probe published, 2026-09-13 — owned by the deploy key until
      it is transferred to the phone account
- [ ] `almanacprobe.dot` registered and the probe published there (`npm run deploy -w probe`).
      `whois`, 2026-09-16: owner none, open to any account, 10 PAS — so its first deploy registers it,
      permanently
- [ ] `docs/PROBE-REPORT.md` — the answers, with the raw JSON reports committed next to it. Started
      2026-09-14 with one Android phone
- [x] `tools/retention.mjs` (`npm run retention`) — P7 from a desktop, through the devnet IPFS
      gateway, each block checked against its CID's own hash

*Superseded 2026-09-16: the probe has `almanacprobe.dot`, so nothing replaces anything — the app and
the probe can both be live, and the iOS, reinstall and two-phone checks and P10 no longer wait for a
turn at the label. One consequence to plan around: host storage belongs to the name, not the bundle,
so the probe published under the new name starts with an **empty journal**, and the results gathered
so far stay at `almanacapp.dot` only until the app replaces that bundle. Export them before that
deploy.*

*Decided 2026-09-14, now history: the app replaced the probe at `almanacapp.dot` for the first
prototype deploy, and P7 carried on from a desktop in the meantime.*

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
- [x] `app/` scaffold (React 19 + Vite 8 + TS). Its published identity comes from `product.mjs` at the
      repo root, and its start screen shows it. *Changed 2026-09-16: it no longer shares that identity
      with the probe, which has `almanacprobe.dot`*
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
      The app goes to `almanacapp.dot` (`npm run deploy -w app`), which still replaces the probe
      bundle published there on 2026-09-13 — so export its reports first, or publish the probe to
      `almanacprobe.dot` beforehand
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
      bundled, within a 400 KiB font budget separate from the code's — 242 KiB, and **487.6 KiB of
      code of 512** as of 2026-09-17, after Phase 4 and Phase 5's Bulletin rails. 24.4 KiB of headroom
      left, so the next thing that wants a library needs a reason: the Bulletin path deliberately
      carries a 32-byte content hash rather than a CID string so that multiformats never entered the
      bundle

**First run on a phone** — after `npm run deploy -w app`, which replaces the probe bundle still at
`almanacapp.dot` (the probe's own name is `almanacprobe.dot`)
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

**Unblocked 2026-09-17 by P6c**, which stored all four buckets — 16 KiB, 64 KiB, 256 KiB and 1 MiB —
whole, each as one transaction under one content hash, charged at exactly its own size. Still depends
on P7 (retention) and P9 (statement capacity), which decide how often a backup refreshes and whether
the pointer statement can live long enough to be worth writing.

**Built on assumptions, and they are written down.** [DESIGN §8's table **B1–B7**](DESIGN.md#what-bulletin-backups-assume--to-validate-before-a-production-launch)
lists every one, what it rests on, and what must be measured before this is offered to anyone who is
not testing it. Each is safe if wrong — the copied backup keeps working — but **B5 is the weakest**:
every Bulletin measurement so far belongs to the probe's product identity, not almanac's. None of
these are optional before a production launch.

**What this is, and what it is not.** A Bulletin backup is a convenience layer over the copied
backup, not the recovery path. Measured retention is about two weeks (P7), so it expires long before
the failure it exists for — a phone lost and replaced months later. The copied backup stays the only
backup that does not expire (DESIGN §8), and *restore from the backup code alone, on a new account*
stays the gate. Nothing here may make recovery depend on an account or a device (R8).

**Produces**
- [x] `platform/` — a `Blobs` port beside `statements`, absent in the tryout the same way (2026-09-17).
      It carries the **32-byte content hash, never a CID string**: the host's lookup takes the digest
      alone (P7) and almanac only ever reads through the host, which keeps a multiformats library out
      of a bundle with 38 KiB of room left
- [x] `app/src/backup/bulletin.ts` — upload a sealed backup through the host's own path,
      `getPreimageManager().submit()` (P6b). Never `cloudStorage.upload`: it signs with the product
      account, which holds no authorization, and is refused `Invalid: Payment` (P6). *Built 2026-09-17*
- [x] The pointer (`backup/pointer.ts`) — a statement on topic `TB` from `backupKeys().topic`, derived
      since Phase 3 and unused until now, on channel `H("almanac/v1/backup")`, holding the content hash
      and the time sealed under a key from `KB`. Last-write-wins, so the newest pointer is the backup.
      Built from the *same* `packSlots`/`topicsFor` as the sharing statement, so it is indistinguishable
      from one: 512 bytes, four topics, random filler. A statement that announced itself as a backup
      pointer would say that this account keeps backups, and how often
- [x] Padding to the smallest of 16 KiB, 64 KiB, 256 KiB and 1 MiB that fits — all four proved on
      2026-09-17 (P6c). A backup that outgrows 1 MiB is refused rather than half-stored, and 1 MiB is a
      deliberate choice rather than a free one: it took 41 s where 16 KiB took 6.7 s, on a phone the
      person is waiting at
- [x] Restore by the backup code alone: `KB` and `TB` → newest pointer on `TB` → fetch **through the
      app** (BLAKE2b-256 only, P7) → unwrap `BK` → decrypt. No account, no device key, nothing but the
      code. Tested across two hosts with separate storage and accounts, which P9b/P9c measured for real
      on the same day
- [x] A failed upload changes nothing: **the pointer is written last**, so a refusal — which is also
      what a spent quota looks like from inside the app (B3) — leaves the previous backup pointed at
      and restorable. Tested
- [x] The 5-day rule (`bulletinDue`), and only once the code has been **checked**: a backup nobody has
      written the code down for is a blob on a public network that will outlive its purpose (R7) while
      helping no one
- [x] **The screens** (2026-09-17). Backup: the one-time notice, *Back up now*, and *Kept online
      {date}* with what retention means for it. Restore: the backup code **alone**, nothing pasted,
      where backups were kept online. Shell: it runs on open when due, once a session — a 1 MiB upload
      took 41 s (P6c), so a second one over the first would spend quota for nothing — and a failure
      reaches the person as a toast instead of being swallowed, since a claim with nothing left in it
      looks exactly like that (B3). Agreeing to the notice is what sets `bulletinOk`, and **nothing
      uploads before it is set, the schedule included** (R7)

**Gate**
- [ ] Reinstall → restore from the backup code alone, on a new account
- [ ] Backup timing and size do not depend on how much was logged
- [ ] A backup that cannot be paid for fails without moving the pointer, so the previous backup still
      restores
- [ ] A pointer written by the decoy vault is indistinguishable from the real one's (open question
      below: whether the decoy backs up at all)

## Phase 5 — Sharing ⬜

Provider shares first ([DESIGN §9](DESIGN.md#provider-shares)), decided 2026-09-14: in person by
codes now; later openings through the statement store; WebRTC once P13 shows it works; Bulletin
rails built but switched off until P6. Depends on P9 (delivery between two phones), P12 and P14
(reading codes), P13 and P6.

**Produces**
- [x] `share/` — the provider-share formats (pairing code, share, request, approval, stop), used by
      both almanac and the provider app, with test vectors (2026-09-14). In `app/src/share/`, which
      the provider app imports as it is, as `@app/share`: decided 2026-09-15, instead of a workspace
      package of its own
- [x] almanac: *Share with a provider* — scan (or paste) their code, check the name and six digits,
      choose categories, dates and end date, preview, pick the first opening, show the codes; the
      shares listed in Privacy, each with its openings and *Stop sharing*. Loaded only when Sharing is
      opened. Walked through 2026-09-15 in headless Chromium with a fake camera playing a provider's
      code, and the codes shown were read back and opened with the provider's keys — exactly what the
      preview showed
- [x] almanac: *Allow* for 15 minutes, an hour or the rest of the day, or *Not now*, for requests
      waiting when almanac opens and arriving while it is open — on Today. Built 2026-09-15 on a
      statement port in the host (the SDK's statement store in the Polkadot app; one in memory for
      tests), and walked through over a stub SDK: a provider app's request, made from the share's own
      codes, answered from Today, and the approval opened the share on the provider's side
- [x] `provider/` — the provider app, a Product of its own at `almanacappprovider.dot`: show a
      pairing code, read a share, view it with a countdown, forget it; ask to see it again; delete it
      at the end date or on *Stop sharing*. Built 2026-09-15, and walked through, light and dark, over
      a stub SDK against almanac's own code. Its code was read off the screen and scanned; almanac's
      six codes were read by a fake camera in about 2 s. The share closed when the first opening
      ended; a request was answered with *Allow*; locking closed the opening; *Stop sharing* deleted
      the patient; and a forgotten PIN started it again. Not yet on a phone, and its name is not
      registered: its first deploy, `npm run deploy -w provider`, registers it, permanently
- [x] The sharing statement: approvals and stops for every provider, at one fixed size, sent again
      on every change and kept due until it goes (2026-09-15). On a phone, it waits only for the
      provider app to be published: delivery between two phones was measured on 2026-09-17 (P9b/P9c),
      phone B finding a statement phone A wrote, on a topic both worked out from a shared code
- [x] The second check, on both screens (2026-09-16): six digits from the pair key, which exists only
      once each side holds the other's key — so unlike the digits on the provider's code, they catch
      almanac's own codes being substituted on the way back. almanac shows them beside the codes it is
      displaying; the provider app shows them after reading and keeps nothing until they are confirmed
- [x] The provider app's settings say what the registry vouched for — free or licensed, and until when
      — so a clinic can see a lapse coming instead of meeting it at a visit (2026-09-16)
- [ ] Bulletin rails with the one-time notice. Unblocked 2026-09-16 (P6b): upload through the host's
      preimage call, not `cloudStorage.upload`. A fresh `KS` for each upload, the CID in the approval
      that opens it (three openings a statement, not four), and the pairing still in person only —
      [DESIGN §9](DESIGN.md#provider-shares), decided 2026-09-16. **Its measurement gate is
      discharged:** P6c (2026-09-17) put 16 KiB through 1 MiB up whole, byte for byte, and a share is
      2–16 KiB — where only 256 bytes had been measured before
  - [x] The rails themselves (2026-09-17). `sealPayload` — a blob shaped exactly as the provider app
        already keeps a share, so `openStored` opens it unchanged and the header sealed inside still
        ties it to its share; the upload on *Allow*, carrying the whole selection **as it stands**, so
        a later opening shows what was logged since the visit rather than the copy frozen there; the
        CID and that upload's own key kept on the opening; the provider fetching the blob its approval
        names. **Gated off by default:** nothing uploads until the patient has agreed
        (`readOnlineOk`), so the plumbing cannot run ahead of the notice — the gate backups have at
        [DESIGN §8](DESIGN.md#backups), R7. Tests pin the two guarantees §9 rests on: an opening's key
        is never the share's, and one opening's key opens that upload and no other
  - [x] The notice itself (2026-09-17), in Privacy → Sharing rather than interrupting an *Allow*: a
        provider is waiting at that moment, and backups set the precedent of keeping the notice inside
        the flow that owns the subject (§8's `online` step). It says what a copy online does, that
        stopping cannot take one back, and that each is locked separately so stopping always withholds
        the next. Agreeing remains the only thing that sets the gate, so nothing can have been
        uploaded before someone read it. Offered only where there is somewhere to put one, so the web
        tryout never shows it
- [ ] Provider registration and licence ([DESIGN §9](DESIGN.md#provider-registration-and-licence),
      decided 2026-09-16). An Approver role the developer holds and a board could take over; credential
      evidence kept as a hash; a free tier of one seat for an approved clinic and a paid tier per clinic
      per year, seats pro rata; a lapse drops to the free tier. A lapse stops new pairings and asking to
      reopen, never an opening already allowed
  - [x] `share/attest.ts` — the attestation the registry signs and almanac checks offline, and the
        clinic's signature over its own pairing code, with tests (2026-09-16)
  - [x] The registry public key in `product.mjs`, from `tools/registry-key.mjs` (2026-09-16)
  - [x] The pairing code carries the attestation and that signature; almanac refuses an unregistered or
        expired provider in words that say which it is. Its QR goes from version 7 to 13 — one still
        code, chosen over a two-code loop, with 13 held as a ceiling in `qr/encode.test.ts` (2026-09-16)
  - [x] The provider app makes its identity key at setup and takes the registration issued for it,
        checking it against the same registry key almanac uses; `tools/issue-attestation.mjs` is the
        registry issuing one (2026-09-16)
  - [ ] `ProviderRegistry` — approve, revoke, buy and extend a licence, read status. **Gated on
        [devnet #10](https://github.com/Polkadot-Community-Foundation/products-devnet-issues/issues/10):
        deploying a new contract name traps on an outdated CDM registry, open and untouched since
        2026-08-06.** Built and tested against a local node meanwhile
  - [ ] P15 — try `cdm deploy` of a new name on devnet, so #10 is measured rather than assumed
  - [ ] The provider app renews its attestation through the host's chain client; `pine-rpc` for
        issuing and auditing off the phone
- [ ] WebRTC at the visit, if P13 shows it works
- [ ] Then: the visit summary (copied as text), and live shares for family or a partner

**Gate**
- [ ] Two phones: a share made at the visit opens on the provider's phone for the time chosen, then
      is gone from it
- [ ] A later request reaches almanac; *Allow* opens it for the time chosen; after *Stop sharing*
      no request is answered, and the provider app deletes its copy
- [x] Nothing opens without an approval, and an approval opens only its own share — automated test
      (`app/src/share/share.test.ts`; the provider app's side in `provider/src/exchange.test.ts`)
- [x] Sensitive categories are off in every new share — automated test
      (`app/src/sharing/select.test.ts`: a new share holds periods and symptoms only)

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
  cannot reveal which vault is in use? See THREAT-MODEL R3. The blocker is no longer correctness —
  each backup code now has its own statement channel, so a decoy's pointer no longer replaces the
  real vault's (2026-09-17) — but capacity: doing this needs a third statement on one account, and
  P9 has not settled how many an account holds (DESIGN §8, B4).
- **The sharing statement has the same shape as the backup pointer had.** The outbox publishes on one
  fixed `SHARING_CHANNEL`, and the store replaces per account and channel — so a share created inside
  the decoy would replace the real vault's outbox statement and silently stop every live share. The
  backup pointer's fix does not transfer: a share's keys are per share, not per vault, so there is no
  per-vault secret to derive a channel from, and a channel salt kept in each vault spends another
  statement against unsettled capacity (DESIGN §8, B4). Nothing does this on its own — a decoy starts
  with no shares (sharing/records.ts) — but a decoy that is actually used could.
- **Quantum.** Shares use X25519 sealed boxes. If ciphertext outlives Bulletin's retention, a future
  quantum adversary could open it. `product-sdk-crypto` declares ML-KEM types but has not implemented
  them. Revisit before Phase 5 ships.
- **If the statement store cannot hold long-lived pointers** (P9), the backup pointer needs another
  home: a tiny pointer contract written through a relay (which gives up "no server"), or restore by
  file only.
