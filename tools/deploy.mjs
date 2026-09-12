// Publish app/ or probe/ to the product's .dot name with pad.
//
// Usage, from the repo root:  npm run deploy -w app   or   npm run deploy -w probe
// Each workspace checks or builds first, then runs this from its own directory.
//
// Interactive on purpose. Once the name is owned, re-linking it needs a phone signature and pad reads
// the confirmation from this terminal: a closed stdin aborts, and `yes |` answers before the phone
// has anything to sign (broadside/docs/DEPLOY.md).
//
// And the first publish REGISTERS the name, permanently — DotNS entries cannot be deleted, renamed
// or reassigned. So this asks for the label to be typed back before doing anything.

import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { CLOUD_ENV, DOT_NAME } from "../product.mjs";
import { KEY_FILE, accountOf, readKey } from "./deploy-key.mjs";

const PAD = "@polkadot-community-foundation/polkadot-app-deploy@0.16.1";
const repo = resolve(import.meta.dirname, "..");

// Per workspace: what dist/ is built from (besides ../product.mjs, which both read), a check that must
// pass on the built dist/ whatever way this was started, and what to say before publishing.
const TARGETS = {
  probe: { sources: ["src", "index.html", "product.mjs"] },
  app: {
    sources: ["src", "index.html"],
    // The promise of no external requests and the bundle budget, enforced at the last step too.
    verify: ["node", ["scripts/guard-dist.mjs"]],
    note: "If the probe is published there now, export its reports first.",
  },
};

const root = process.cwd();
const name = basename(root);
const target = dirname(root) === repo ? TARGETS[name] : undefined;
if (!target) {
  console.error("refusing: run `npm run deploy -w app` or `npm run deploy -w probe` from the repo root");
  process.exit(1);
}

function newest(path) {
  const s = statSync(path);
  if (!s.isDirectory()) return s.mtimeMs;
  return Math.max(0, ...readdirSync(path).map((f) => newest(join(path, f))));
}

let built;
try {
  built = statSync(join(root, "dist/index.html")).mtimeMs;
} catch {
  console.error(`refusing: no ${name}/dist — build it first`);
  process.exit(1);
}
const sources = Math.max(...[...target.sources.map((s) => join(root, s)), join(repo, "product.mjs")].map(newest));
if (sources > built) {
  console.error(`refusing: ${name}/dist is older than its sources — rebuild first`);
  process.exit(1);
}

if (target.verify) {
  const [cmd, args] = target.verify;
  if (spawnSync(cmd, args, { cwd: root, stdio: "inherit" }).status !== 0) {
    console.error(`refusing: ${name}/dist failed its check`);
    process.exit(1);
  }
}

if (!process.stdin.isTTY) {
  console.error("refusing: run this in an interactive terminal — pad may need to wait for your phone");
  process.exit(1);
}

// Who will own the name. An explicit MNEMONIC wins; otherwise the local deploy key (deploy-key.mjs),
// if one exists; otherwise pad's login session. pad reads MNEMONIC from the environment and then
// ignores the session entirely.
const key = process.env.MNEMONIC ?? readKey();
const env = key ? { ...process.env, MNEMONIC: key } : process.env;

if (key) {
  const { ss58, h160 } = accountOf(key);
  console.log(`\nOwner: ${process.env.MNEMONIC ? "MNEMONIC" : `deploy key (${KEY_FILE})`} — ${ss58} / ${h160}`);
} else {
  // Without a key, everything rides on the login session, and two states of it are traps (2026-09-11):
  //  - unreadable: pad believes it is signing through the phone but never reaches it — no prompt, a
  //    silent transaction watcher, a re-sign, and a timeout about thirteen minutes later;
  //  - absent: pad falls back to its default key, the public dev phrase, which would register the
  //    name and keep it — a permanent label anyone can take over.
  const who = spawnSync("npx", ["--yes", PAD, "whoami", "--env", CLOUD_ENV], { cwd: root, encoding: "utf8" });
  const whoText = `${who.stdout ?? ""}${who.stderr ?? ""}`.trim();
  console.log(`\n${whoText}`);
  if (/could not be read|expired/i.test(whoText)) {
    console.error("\nrefusing: pad's login session is not usable. From the repo root: `npm run pad:logout`, then `npm run pad:login`.");
    process.exit(1);
  }
  if (/not logged in/i.test(whoText)) {
    console.error(
      "\nrefusing: not signed in and no deploy key, so pad would register the name to its public dev key." +
        "\nFrom the repo root: sign in (`npm run pad:login`) or create a deploy key (`npm run deploy-key`).",
    );
    process.exit(1);
  }
}

const git = (...args) => spawnSync("git", args, { cwd: repo, encoding: "utf8" }).stdout?.trim() ?? "";
const commit = git("rev-parse", "--short", "HEAD") || "an unknown commit";
const dirty = git("status", "--porcelain") !== "";

console.log(`\nThis publishes ${name}/dist — ${commit}${dirty ? ", plus uncommitted changes" : ""} — to ${DOT_NAME} on ${CLOUD_ENV}.`);
// app/ and probe/ share the name, and a name serves one bundle at a time. What each keeps on the phone
// survives the swap: host storage belongs to the name, not the bundle, and their keys do not overlap.
console.log(`${DOT_NAME} serves one bundle at a time, so this replaces whichever of the app or the probe is there now.`);
if (target.note) console.log(target.note);
console.log(`If ${DOT_NAME} is not yours yet, pad will REGISTER it — permanently.\n`);
const rl = createInterface({ input: process.stdin, output: process.stdout });
const typed = (await rl.question(`Type ${DOT_NAME} to continue: `)).trim();
rl.close();
if (typed !== DOT_NAME) {
  console.error("aborted");
  process.exit(1);
}

// npx, not pnpm dlx: pad imports @polkadot-api/json-rpc-provider without declaring it, which npm's
// flat node_modules satisfies and pnpm's strict layout refuses.
const r = spawnSync("npx", ["--yes", PAD, "./dist", DOT_NAME, "--env", CLOUD_ENV, "--js-merkle"], {
  cwd: root,
  env,
  stdio: "inherit",
});
process.exit(r.status ?? 1);
