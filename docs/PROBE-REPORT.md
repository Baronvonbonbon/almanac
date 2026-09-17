# almanac — probe report

The answers from the [Phase 0 probe](../probe/), check by check. The raw reports are in
[`probe-reports/`](probe-reports/), with account addresses replaced by labels. Where an answer
contradicts [`DESIGN.md`](DESIGN.md), the design carries a dated correction.

**Status: one Android phone so far.** iOS, a reinstall, and the checks that need two phones are
still to run — see [Still to run](#still-to-run).

## Devices

| Run | Device | App | Where | Report |
|---|---|---|---|---|
| 2026-09-13 – 14 | Google Pixel 10 Pro XL, Android 16 | Polkadot app 1.0.0 (40) | In the app | [`2026-09-14-pixel10proxl-inapp.json`](probe-reports/2026-09-14-pixel10proxl-inapp.json) |

Two probe builds: `2026-09-13T15:10:59Z` (from `5649181`) and `2026-09-14T11:38:52Z` (from `e74ee89`
plus the fixes to P6, P8 and P9a). `@parity/product-sdk` 0.27.0, `product-sdk-host` 0.19.1.

## Answers

✅ answered · 🟡 partly answered · ❌ blocked · ⬜ not run yet

| ID | Answer on Android | What it changes |
|---|---|---|
| **P1** 🟡 | Host storage survived an app restart and the publishing of a new build (three runs, two builds). One record holds 4 MiB, written and read back in 1.2–1.3 s. An update of the Polkadot app and a reinstall are not tested yet | Nothing: a month's record is 1 KiB |
| **P2** 🟡 | The device key's fingerprint was the same across restarts and across the new build. Reinstall and a second phone not tested yet | — |
| **P3** ✅ | A reminder scheduled two minutes out arrived with the Polkadot app closed — on both builds | Reminders can ship (Phase 6) |
| **P4** ✅ | **Nothing leaves the app as a file.** A download link, sharing a file, Web Share and print all did nothing, on both builds. Copying text to the clipboard works, and so does reading a file the user picks (a 4.5 MB PDF, a 1.5 MB PNG) | Export and the visit summary are copied as text: DESIGN §8, §9, §11. Importing from another app's export file works |
| **P5** ⬜ | — | — |
| **P6** ❌ | **Bulletin uploads fail.** The allowance request comes back `Allocated`, then every upload is rejected as `Invalid: Payment` — four times over two days. The SDK's cloud storage signs with product account #0. Read on-chain, from a desktop (Bulletin block 849565) and from the phone (the fixed P6): product accounts #0, #1 and #2, and the account that signs this product's statements, hold **no** Bulletin authorization; `pad`'s pool account, checked the same way as a control, does | The SDK's own upload path stays shut, and the upstream report stands — see [Upstream](#upstream). *Superseded 2026-09-16: backups and sharing are not blocked after all — the host has an upload path of its own (P6b)* |
| **P6b** ✅ | **The host stores for us.** With `PreimageSubmit` granted, `getPreimageManager().submit()` stored 256 bytes in 4.1 s — not the 64 s Polkadot Desktop took in August, so the codec error that broke this on Android ([#13](https://github.com/Polkadot-Community-Foundation/products-devnet-issues/issues/13)) is gone from this build — and the same bytes came back through the host. They really are on Bulletin: block 874487, and the devnet gateway serves the CID with a matching BLAKE2b-256 hash. **The payer is the product's slot account**, which no Product API names and which had never signed anything before: it holds 60 transactions and 24 MiB, and this upload spent 1 transaction and 256 bytes of it. Its allowance arrived by XCM from the People chain (para 1004) at Bulletin block 841137 — 10 transactions and 4 MiB a claim, six claims so far, each expiring 201600 blocks (~14 days) after it lands. The account holds no balance at all, so this is quota, never a fee | **Backups (Phase 4) and sharing (Phase 5) have an upload path** — the host's, not the SDK's. DESIGN §8 carries the correction. What one upload may carry was answered by **P6c** on 2026-09-17: every padding bucket up to 1 MiB. *Two notes from re-running this on 2026-09-17, under the probe's own name: it took 8.8 s rather than 4.1 s for the same 256 bytes, and its payer line read "an unsigned transaction, so no account paid" — which was the indexing bug P6c describes, not a change on the chain. The slot account named here was confirmed by reading Bulletin directly, and still holds exactly the 1 transaction and 256 bytes this upload spent.*|
| **P6c** ✅ | **All four padding buckets go up whole.** 16 KiB in 6.7 s, 64 KiB in 10.0 s, 256 KiB in 16.8 s and 1 MiB in 41.4 s, each read back byte-for-byte through the host. The chain was then read by hand, because the check misreported the payer (right-hand column): the paying account shows **5 transactions and 1,392,896 bytes used** — exactly 256 + 16 KiB + 64 KiB + 256 KiB + 1 MiB — so **one upload is one transaction, charged at exactly its own size**, with no overhead and nothing to reassemble. Each is a single stored transaction under one BLAKE2b-256 content hash, raw codec. `block_chunks` looks like a split count and is not one: it is a running total of the pallet's 256-byte proof chunks across the whole block, so our 1 MiB upload reads 4096 while a stranger's 659-byte upload later in the same block reads 4099. **The payer is the probe's own slot account now** — 8 MiB and 20 transactions from two claims that landed minutes before the run, one per check run — while almanac's slot account still reads 1 transaction and 256 bytes, untouched since 2026-09-16. That is the identity split of 2026-09-16 appearing in the measurements, exactly as `product.mjs` warns it would. 15 transactions and 6,995,712 bytes were left afterwards | **Phase 4's padding buckets are all viable** (DESIGN §8), and 1 MiB is a deliberate choice rather than a free one: 41 s on a phone someone is waiting at. **The check's own "no account paid" was a bug, not a finding** — `TransactionByContentHash` returns `[block, index-into-stored-transactions]`, and the probe used that index on `block.extrinsics`, which fetched the 8 KiB parachain inherent: a genuinely unsigned v5 bare extrinsic, faithfully reported. The real index is `TransactionInfo.extrinsic_index`, which was 2 in every block here. Fixed 2026-09-17 |
| **P7** 🟡 | **The app's own fetch finds the kind of CID almanac's uploads get; how long uploads last is still being measured.** Inside the app, the SDK fetches a CID through the host, handing over only the CID's 32-byte digest as a *preimage lookup* key, not which hash function made it. A 79-byte blob stored the way the SDK uploads (raw, BLAKE2b-256) came back through the app in 430 ms and through the gateway in 408 ms, both verified. An 18 KB chunk that `pad` stored under SHA-256 never came back through the app: the SDK gives up after 30 s by default, and it did on every run. The gateway served that chunk in 462 and 474 ms, verified. Bulletin indexes an upload under one hash only (the gateway has nothing under that chunk's BLAKE2b CID), so the host's lookup evidently finds BLAKE2b content only | almanac keeps the SDK's default, BLAKE2b-256, for everything it uploads, and reads backups and shares through the app: DESIGN §8. How often backups refresh waits for the retention numbers |
| **P8** 🟡 | **Inconclusive.** The app shows almanac only its own product account #0, so there was no main account to derive anything from. Uploads are signed by product account #0; statements by a different account, which is not product account #0, #1 or #2 | THREAT-MODEL R1 stays open |
| **P9** 🟡 | **Replacing a statement works:** A, then B, on one channel, and a fresh subscription saw only B. **A subscription delivers statements that already exist** — the previous run's 30- and 90-day statements came back. Statements living 90 days are accepted. A full account refuses a statement that expires sooner than the shortest one it holds (`AccountFull(submittedExpiry, minExpiry)`). How many one account holds is **not settled**: the first run behaved like two; the second run's refusal implies four; the third added one without pushing either earlier statement out. Each run asks for a statement allowance, so each grant may add room. Delivery to a second phone not run | Stopping a share by replacing the outbox statement works. Until capacity is settled, almanac plans for two statements per account: DESIGN §9 |
| **P10** 🟡 | **Inside the app, everything a web viewer would need is reachable:** the devnet IPFS gateway served an 18 KB Bulletin chunk in 462 ms, People-chain servers offering `statement_*` methods and Bulletin servers answer over WebSocket, and nothing was blocked by a content policy. (A test file on a local IPFS node, not on Bulletin, timed out there as it did from a desktop — the gateway serves Bulletin content, not the public IPFS network.) The phone-browser half is not run | — |
| **P11** ✅ | scrypt (r = 8): N = 2¹⁵ 101 ms, 2¹⁶ 169 ms, 2¹⁷ 328 ms (2¹⁴ took 118 ms, run first, while warming up). XChaCha20-Poly1305 over 1 MiB: 24 ms to encrypt, 8 to decrypt. BLAKE2b-256 over 1 MiB: 18 ms | The PIN's scrypt default moves to N = 2¹⁶ — about 170 ms here, and roughly 300–500 ms on a mid-range phone |
| **P12** ✅ | The host's theme was dark (`berlinNight`) while the phone itself was set to light. The camera opens, and QR detection is built in | almanac follows the host's theme, not the phone's: DESIGN §4. QR pairing works |

## Upstream

- **P6** — draft issue for
  [products-devnet-issues](https://github.com/Polkadot-Community-Foundation/products-devnet-issues):
  the allowance works, but `cloudStorage.upload` can never spend it. P6b shows where a
  `BulletinAllowance` lands — a slot account the host keeps the key for — while `createApp`'s cloud
  storage signs uploads with the product account, which holds no authorization, so every upload is
  refused as `Invalid: Payment`. Evidence for the report: the slot account paid for P6b's upload in
  Bulletin block 874487, out of a quota granted by XCM from the People chain. Related:
  [#8](https://github.com/Polkadot-Community-Foundation/products-devnet-issues/issues/8) (cloud
  storage on the devnet host; construction now succeeds) and
  [#11](https://github.com/Polkadot-Community-Foundation/products-devnet-issues/issues/11) (allowance
  outcomes vary between runs; `dappName` picks the signing account).
- **P7** — a note for the SDK, not blocking almanac: `cidToPreimageKey` accepts SHA-256 CIDs, but
  the host's lookup seems to find only BLAKE2b-256 content. So a SHA-256 CID, like the ones `pad`
  makes, waits out the 30 s timeout instead of failing at once.

## Still to run

The Phase 0 gate needs every check on at least one Android and one iOS phone.

- [ ] iOS — every check
- [ ] P1 and P2 after an update of the Polkadot app and after a reinstall; P2 on a second phone
- [ ] P5 — back up the phone, restore to another, open the probe
- [ ] P7 every few days with `bafk2bzacebowgi5ykjhnh26gioxl4c3nwr5yu5rcw67i6mf3ksn7uhfo3q5ys` (79
      bytes stored the way the SDK uploads, 2026-09-14 13:56 UTC) and
      `bafkreif5zpe5s4ja4kk67benbljh4u5bwynkqfd66prm3p3prkhtuxt2na` (an 18 KB piece of the first
      probe build, 2026-09-13 15:11 UTC, readable through the gateway only). This is the retention
      test until P6 works. Run it from a desktop with `npm run retention` — the gateway half; the
      through-the-app half waits for the probe to be published to `almanacprobe.dot`, which since
      2026-09-16 no longer waits on the app. The first check at 15 days or later falls on 2026-09-28
      for the older one
      and 2026-09-29 for the newer
- [ ] P6c again once the payer bug is fixed, to have the check itself report what the chain was read
      for by hand on 2026-09-17. What happens when the quota runs out mid-backup stays unmeasured by
      design: a spent claim blocks real work for about 14 days
- [ ] P9b and P9c on two phones
- [ ] P10 in a phone browser, at `almanacprobe.dev-dot.li` — once the probe is published to its own
      name (2026-09-16: it has one, so this no longer waits for the app to give the label back)
- [ ] P13 — WebRTC inside the app: the `WebRtc` permission, a reload, then two phones on one Wi-Fi
      with no STUN server. Added 2026-09-14, for provider shares
- [ ] P14 — reading a QR code on iOS: `BarcodeDetector`, or the size of a JavaScript reader

## Notes on running the probe

- **Getting a new build onto the phone:** close the product, then close the Polkadot app itself, and
  open the product again. Closing only the product kept showing the previous build. The footer shows
  which build is running.
- The first P9a left two test statements on this account, expiring around 2026-10-13 and 2026-12-12;
  the second, which ran before the new build loaded, replaced them with ones expiring around
  2026-10-14 and 2026-12-13. The fixed P9a leaves one more, expiring around 2026-12-13.
- The BLAKE2b test blob for P7 was stored from a desktop by one of `pad`'s shared pool accounts, in
  Bulletin block 850853. It is a line of text saying what it is. The P7 runs that used it, and the one
  before, were on two later probe builds from 2026-09-14 (the fixed P7), which are not in the report
  file.
- P8 and the fixed P6 name the accounts involved. Commit a report only after replacing addresses with
  labels, as the one above does.
