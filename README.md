# almanac

A private period and cycle tracker for the Polkadot app.

Your cycle data lives on your phone, encrypted. There is no account to create, no server, no ads and
no tracking. The people who build almanac could not read your data if they wanted to, or if someone
asked them to.

> **Status: pre-alpha, on the Products Devnet.** Built and tested: logging, the calendar and
> predictions, PIN and duress PIN, the backup code, encrypted backups to Bulletin, and sharing with a
> provider through a provider app of its own. The app is published to `almanacapp.dot` and has run on
> Android, where a Bulletin backup restored on the same phone; the rest is still to be checked on a
> phone one step at a time, and iOS not at all. See [`docs/PLAN.md`](docs/PLAN.md) for what is
> measured and what is not.

## Promises

- **Your data never leaves your phone unencrypted.** Backups and shares are encrypted on your phone,
  with keys only you hold.
- **Nothing about your cycle is ever written to a blockchain.**
- **No ads, no analytics, no tracking — ever.**
- **No sign-in and no wallet prompts** in everyday use.
- **Open source**, so anyone can check these promises.

## Where things are

| | |
|---|---|
| [`docs/PLAN.md`](docs/PLAN.md) | Phases, gates, decisions, and what has been measured |
| [`docs/DESIGN.md`](docs/DESIGN.md) | Experience, data, keys, backups, sharing |
| [`docs/THREAT-MODEL.md`](docs/THREAT-MODEL.md) | Who almanac protects you from — and what it cannot |
| [`app/`](app/) | The app, published to `almanacapp.dot` |
| [`provider/`](provider/) | The provider app, for a clinic to receive shares — `almanacappprovider.dot` |
| [`probe/`](probe/) | Phase 0 device probe, published to `almanacprobe.dot` |
| [`product.mjs`](product.mjs) | The published identities — app, provider app and probe — and the registry's public key |
| [`tools/`](tools/) | `whois.mjs`, a read-only DotNS lookup; `deploy.mjs` and `deploy-key.mjs`, which publish the app, the provider app or the probe; `retention.mjs`, which checks how long Bulletin keeps data |

## License

GPL-3.0-or-later. See [`LICENSE`](LICENSE).
