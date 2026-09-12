# almanac app

The app itself. So far, Phase 1 of [the plan](../docs/PLAN.md#phase-1--foundations-): the encrypted
store, the data model, predictions, and a start screen that checks the store works on a phone.

## Run it

```bash
npm install            # from the repo root — npm workspaces
npm run dev -w app     # a browser: tryout mode, since the host only exists inside the Polkadot app
npm run check -w app   # typecheck, tests, build, and the dist/ guard — what CI runs
```

## Publish it

From the repo root, with an owner for the name set up as the [probe's README](../probe/README.md#publish-it)
describes (a deploy key today, `pad login` once pairing works):

```bash
npm run deploy -w app
```

This runs the full check, runs the `dist/` guard again on the exact bundle about to go out, and asks
you to type the name back before `pad` publishes it to **`almanacapp.dot`**. That name serves the
probe too, one at a time — [export the probe's reports first](../probe/README.md#one-name-two-bundles).

## The on-device check

Open `almanacapp.dot` in the Polkadot app. The start screen opens the store through the real host
(creating it on the first launch), writes a record, reads it back, and says *Your private storage is
working on this phone.* Close the app completely, open it again, and check it says the same — that
is Phase 1's gate.
