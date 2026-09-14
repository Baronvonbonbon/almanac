# almanac — threat model

Cycle data can reveal pregnancy, pregnancy loss, sexual activity and fertility treatment. In some
places that information has legal consequences. This document says who almanac protects you from,
how, and — just as plainly — what it cannot do.

## What we protect

1. **Cycle data** — dates, flow, symptoms, mood, notes, fertility and pregnancy entries.
2. **The fact that you use almanac**, and when you use it.
3. **Who you share with.**

## Who we protect you from

| Adversary | What they can reach | How almanac holds up |
|---|---|---|
| **Chain observers** | Everything on-chain and on Bulletin, forever | No cycle data on any chain. Bulletin blobs are encrypted and padded; backups run on a schedule, not on every log |
| **almanac's developers** | Nothing — no server, no analytics, no telemetry | There is nothing to hand over. Open source; builds reproducible (Phase 7) |
| **Other Products** in the Polkadot app | Their own storage; `getUserId` | Host storage is separated per product. almanac never calls `getUserId`, and its keys come from product-scoped `deriveEntropy` |
| **Network and gateway** | Requests leaving the phone | No external requests from the app: fonts bundled; CI fails any external URL in `dist/`; a content security policy once P10 shows which origin the gateway frames the app in |
| **Someone who picks up your phone** | The unlocked phone | Optional PIN, auto-lock, discreet notifications, a neutral name, erase everything |
| **Someone forcing you to unlock** | You | Optional duress PIN that opens a decoy vault. The store has two vaults from the first launch, mirrored record for record, so a copy of it does not reveal whether a decoy exists (but see R3) |
| **Legal demands on anyone but you** | Whatever exists off your phone | Only ciphertext exists off the phone, and only you hold the keys |
| **A share recipient, or a provider** | What you shared with them | Only the categories and dates you chose; every share ends. A provider opens it only while you allow, and the provider app forgets it afterwards; approvals are sealed, not signed, so they prove nothing to anyone else (DESIGN §9). Stopping a share cuts off anything not yet opened and all future updates |
| **Supply chain** | Dependencies, the build, the published bundle | Few dependencies, pinned with a lockfile; reproducible builds; each published CID recorded against its commit |

## Named risks

What the design cannot fully prevent. Each stays listed until it is closed.

**R1 — Your almanac accounts can be linked to your main account.** Product accounts are derived from
the parent **public** key (`deriveProductAccountPublicKey(parentPublicKey, productId, index)`), so
anyone who knows your main Polkadot account can compute your almanac accounts. If those accounts
sign backups and share updates, an observer can learn *that you use almanac and when you back up* —
never what is inside. Mitigations: scheduled, fixed-size uploads; a name that does not say "period
tracker". P8 measures which account actually signs. If it is a product account, this risk is real
and stays in the app's privacy explainer. *P8, 2026-09-13 (Android): uploads are signed by product
account #0, so the risk is real for uploads, if they ever work (P6). Statements are signed by a
different account, which is not product account #0, #1 or #2. Whether that one can be derived from
the main account is still open: the app showed almanac no main account to test against.*

**R2 — Recipients can keep what they see.** Screenshots, photos, copies. Stopping a share cannot
reach into someone else's phone. The sharing screen says this before every share. A modified provider
app could also keep what it was allowed to open, or the key that opened it; the provider app almanac
publishes forgets both.

**R3 — A careful coercer might tell the decoy from the real vault by behaviour,** not by storage —
for example, upload history on Bulletin that does not match the decoy's contents. Open question: the
decoy should probably back up on the same schedule. See [PLAN open questions](PLAN.md#open-questions).
Storage can give it away too, to someone who copies it at two different times: between the copies,
only the slot in use changes. If they later watch the duress PIN open a slot that never changed,
they can tell it is the decoy. One copy alone shows nothing (DESIGN §5).
Appearance can give it away as well. The look the user picked therefore belongs to the phone, not to
a vault: both vaults open in the same look (DESIGN §4, decided 2026-09-14). Other settings, such as
the modes, are per vault, so the decoy starts with a copy of the real one's settings and, if the
user agrees, example months (decided 2026-09-14).
Actions can give it away too, in the other direction: **inside the decoy, turning off the PIN or
setting up a duress PIN overwrites the real vault**, as it would in a real vault that had a decoy. The
decoy cannot refuse without revealing itself. The duress screen says so before it is set up.

**R4 — Short PINs are guessable.** A 6-digit PIN has a million possibilities. Inside the app,
guesses are slowed by growing delays: five tries, then 30 seconds, a minute, 5 minutes, 15 minutes,
and an hour each after that — about 24 guesses a day once the waits reach an hour. The count lives in
the host's storage, so someone who can rewrite that storage, or sets the phone's clock forward, can
skip a wait; they still face the next point. Outside it, the PIN key also needs the device key, which only
the host can produce for this product — so copying the raw storage off the phone is not enough.

**R5 — We trust the host.** The Polkadot app provides almanac's storage and entropy. A compromised
host could read both. almanac cannot defend against the app it runs inside, nor against malware on
the phone.

**R6 — Device backups may copy host storage.** iCloud or Google backups might include the Polkadot
app's storage. Records are encrypted either way; the device key still binds them to the host. P5
measures it.

**R7 — Ciphertext may outlive its purpose.** Parity's docs say Bulletin content persists; measured
retention is about two weeks. We assume the worst: anything uploaded may be public forever. Records
use 256-bit symmetric keys, which hold up. Shares use X25519 sealed boxes, which a future quantum
computer could open. See PLAN open questions.

**R8 — Devnet resets.** A reset can wipe accounts and host storage. The backup code does not depend
on the account, and the app labels devnet as a preview.

**R9 — Timing on the statement store.** A provider's request and almanac's answer are statements of
one size, under topics only the two of them can compute. But both are posted where anyone can
watch, signed by accounts that R1 may tie to their owners, and an answer follows a request. Someone
watching both could guess that a patient answered a provider. almanac answers only when the patient
opens it, which blurs the timing, but does not hide it.

## Not in scope

- Malware or a compromised operating system on the phone
- Screenshots and screen recording
- A compromised Polkadot app (R5)

## Guards in CI

- No external URLs in `dist/` — an explicit allowlist, each entry explained in
  `app/scripts/guard-dist.mjs` — and a size budget
- No call to `getUserId` in almanac's own source. The SDK bundles the function itself — found in the
  probe's `dist/` on 2026-09-11 — so this check reads `src/`, not `dist/`
- No word from the banned list in user-facing strings ([DESIGN §3](DESIGN.md#words))
- Crypto test vectors for every wrap, unwrap, backup and share format
- What a copy of the store shows: one filled as a real user would — a look, every mode, a sensitive
  month, a backup code, a PIN and a decoy — holds nothing logged, named, chosen or typed in any key
  or value, and only the format record is readable as it is; the copied backup shows only its
  heading (`app/src/vault/at-rest.test.ts`)
