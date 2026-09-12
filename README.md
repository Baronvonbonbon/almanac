# almanac

A private period and cycle tracker for the Polkadot app.

Your cycle data lives on your phone, encrypted. There is no account to create, no server, no ads and
no tracking. The people who build almanac could not read your data if they wanted to, or if someone
asked them to.

> **Status: pre-alpha — Phase 0.** We are measuring the platform on real devices before building on
> it. See [`docs/PLAN.md`](docs/PLAN.md).

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
| [`probe/`](probe/) | Phase 0 device probe, published to `almanacapp.dot` |
| [`tools/whois.mjs`](tools/whois.mjs) | Read-only DotNS lookup. Never registers anything |

## License

GPL-3.0-or-later. See [`LICENSE`](LICENSE).
