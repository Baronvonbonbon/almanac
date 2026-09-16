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

*Corrected 2026-09-16 (P6b): that was the upload path that does not work. The one that does — the
host's `getPreimageManager().submit()` — is signed by neither: it is paid by a **slot account**, which
the host derives per user and product and keeps the key for. On this phone that account had signed
nothing before almanac's first upload and holds no balance at all, and its allowance was claimed on
the People chain with an **anonymous** ring-VRF membership proof, so the grant itself names no person.
Whether the slot account can be derived from the main account's public key — as product accounts can —
is unknown and is now the open half of R1: if it cannot, an observer loses the ability to tell that
this phone uses almanac and when it backs up. P8 tested the wrong account and needs re-running
against this one. Three accounts are now in play, and only the first is known to be derivable:
product account #0 (the SDK's failed uploads), the statement signer, and the slot account.*

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

**R10 — A blob on Bulletin outlives the permission to read it.** A share's payload on public storage
is world-readable and cannot be withdrawn, so a provider who unmasked `KS` at any opening can fetch
and read it again with no app at all — not a modified app, just the network. *Stop sharing* cannot
reach it. Mitigations (DESIGN §9, decided 2026-09-16): a fresh `KS` for every upload, so stopping
withholds the next key and nothing new can be opened; and retention, which makes what they already
hold unreadable to everyone within about a fortnight. That is the only hard deletion almanac has, and
it is a backstop, not a promise — the copy is public until it lapses. This is R2 sharpened: what they
keep is the object, not only what they saw.

**R11 — A stolen provider app can ask in the clinic's name.** Its vault holds the pairing secret —
never `KS`, never an opened selection — so a thief reads nothing already shared. But the pairing key
*is* the provider as far as almanac can tell, so a thief can post requests as that clinic, and a
patient who taps *Allow* hands them a live opening. almanac cannot tell a stolen device from the real
one, and should not pretend to: the patient's defences are the share's end date, *Stop sharing*, and
noticing that they are not at a visit. The provider app's own defences are its PIN, its device key,
and holding no share it can open on its own.

**R12 — Fetching a share says who is looking.** Whoever serves a CID learns that this device wants
that blob, and an observer of the chain can already see the blob. Through a public gateway that pairs
a clinic's address with a patient's share. So the provider app fetches through the host's preimage
lookup, on the Polkadot app's own network path, and never a public gateway — which P6b and P7 show
works for the BLAKE2b CIDs almanac uploads.

**R13 — A clinic's identity key is worth more than its device.** Registration gives a provider app a
long-lived key the registry has vouched for, and everything else it holds is per patient and short
lived. Whoever takes that key can make pairing codes that almanac believes, as that clinic, anywhere
— this is R11 made worse, because before registration a thief could only ask patients the clinic
already had. Mitigations: the key lives in the provider app's vault under its device key, behind the
PIN; an attestation lasts weeks, so a revoked or stolen identity stops working without anyone having
to reach the thief's device; and the registry will not renew one that has been revoked. almanac cannot
tell a stolen identity from its owner, and does not pretend to — the six digits bind the channel, not
the clinic.

**R14 — The registry says which clinics use almanac.** Approvals, licence payments and renewals are on
a public chain, so it is visible that a clinic is registered, roughly what it pays and when it renews.
No patient appears anywhere in it: patients verify offline, so the chain never learns that anyone
visited anyone. This is a disclosure about providers, and they should be told of it before they
register, not after.

**R15 — A registry is a gatekeeper on care.** almanac refusing to pair with an unregistered clinic is
what makes registration mean anything, and it is also a way for almanac to stop a patient sharing with
their own doctor: a clinic offline past its attestation's expiry, a registry that loses its signing
key, an Approver who is slow, or a developer who decides who counts as a clinician. The design keeps
that power small — approval is separate from paying, a lapse drops to a free tier rather than to
nothing, and an opening already allowed can never be cut off — but it does not remove it. Whoever
holds the Approver role holds this, which is the argument for it not staying with the developer.

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
