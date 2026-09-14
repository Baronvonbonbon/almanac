# almanac probe

Phase 0 of [the plan](../docs/PLAN.md#phase-0--device-probe-): a small Product that measures the
Polkadot app platform on a real phone, so almanac is built on answers rather than assumptions.

Each card asks one question in plain words, says what the answer decides, and records the result in
a journal kept in host local storage — so results carry across restarts and, if P1 says so,
reinstalls. Things only a person can observe (did a reminder arrive? did a file appear?) get two
buttons to record the answer.

## Run it

```bash
npm install            # from the repo root — npm workspaces
npm run dev -w probe   # a browser: only the checks that do not need the host can run
npm run build -w probe
```

## Publish it

`deploy` needs an owner for the name, and refuses to run without one — otherwise `pad` falls back to
its default key, the public dev phrase, which would register the name and keep it.

### With a deploy key (works today)

`pad login` cannot pair with the current Polkadot app: the phone says *"Mode BIGINT is not
implemented"* (2026-09-11), and
[paritytech/polkadot-app-deploy#231](https://github.com/paritytech/polkadot-app-deploy/issues/231)
reports the same on iOS 0.9.2. The workaround that issue confirms is a separate key:

From the repo root:

```bash
npm run deploy-key            # creates ~/.config/almanac/deploy-key once; prints only its address
# fund that address with test PAS on Paseo Asset Hub (faucet.polkadot.io) — about 10 PAS to register
npm run deploy -w probe       # uses the deploy key automatically
```

The deploy tooling lives in [`tools/`](../tools/) and is shared with the app, which publishes to the
same name — see [One name, two bundles](#one-name-two-bundles).

The deploy key signs only the name. The files are uploaded by one of `pad`'s shared upload accounts,
because devnet does not authorize a deploy key to store on Bulletin (2026-09-12). Those accounts can
upload and nothing else: they never own the name or change what it points to.

The key's words are never printed; the file is readable only by you and lives outside the repo. Back
it up — **it owns the name** until you hand it to your phone account, once login works again:

```bash
MNEMONIC="$(cat ~/.config/almanac/deploy-key)" npx @polkadot-community-foundation/polkadot-app-deploy@0.16.1 \
  transfer almanacapp.dot --to <your phone account's H160> --env devnet
```

### With `pad login` (once pairing is fixed)

Always with `--env devnet`, which these scripts pin (`pad`'s own default is `paseo-next-v2`):

```bash
npm run pad:login             # scan the QR code with the Polkadot app
npm run pad:whoami            # should name your account
npm run deploy -w probe
```

When signed in, `pad` registers with its own worker and then hands the name to your account, so a
first publish needs no taps. If the output says `Using session signer` instead of `Worker: …`, it is
signing with your phone, and each step needs your approval.

**If the phone never asks you to sign** and the run ends in `transaction watcher silent` and
`commit timed out`, the login session is unreadable — `pad:whoami` says so. Run `pad:logout`, then
`pad:login`. `deploy` checks for this before starting.

This builds, then publishes `dist/` to **`almanacapp.dot`** with `pad`. It must run in an interactive
terminal, and asks you to type the label back first — **the first publish registers the name, and
that is permanent.** Later publishes need a signature on your phone.

### One name, two bundles

The app and the probe share `almanacapp.dot` on purpose: host storage, product accounts and
allowances all belong to the name, so the probe measures exactly what the app will get. A name
serves one bundle at a time, so publishing one replaces the other. What each keeps on the phone
survives the swap — the probe's journal and the app's vault use different storage keys — and
republishing brings a bundle back. Export the probe's reports before publishing the app anyway.

## Run it on a phone

1. Open `almanacapp.dot` in the Polkadot app. **Use a test account** — the report includes account
   addresses.
2. Work down the cards. Several are meant to be run more than once: P1 and P2 across restarts and
   reinstalls, P7 every few days for three weeks, P9b/P9c on two phones.
3. **Export the report before reinstalling** (Copy or Share at the bottom).
4. Open `almanacapp.dev-dot.li` in a phone browser and run P10 there as well.

Reports go in `docs/probe-reports/`, and the answers in `docs/PROBE-REPORT.md`.

## What it spends

P6 and P9 use the product's test-storage allowance. Every upload is random bytes encrypted under a
key that is thrown away — nothing readable leaves the phone. P9a leaves one small statement that
lives about 90 days. It outlives whatever an earlier run left, so it pushes that out rather than
piling up — a full account only takes a statement that outlives the shortest one it holds. The first
version of P9a left two (30 and 90 days), which expire around 2026-10-13 and 2026-12-12.
