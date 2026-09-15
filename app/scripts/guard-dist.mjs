// Fails when dist/ references an external URL or outgrows the budget.
//
// almanac makes no request it does not mean to: fonts are bundled, nothing is fetched from a CDN, and
// there is no analytics. And every byte of the bundle is uploaded to Bulletin and renewed, so size is
// a cost, not a detail.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// app/dist, or the dist/ named — the provider app's (provider/package.json), which keeps the same promise.
const DIST = process.argv[2] ? resolve(process.argv[2]) : resolve(import.meta.dirname, "../dist");

// Code and fonts have separate budgets (docs/DESIGN.md §4). The code index.html loads runs on every
// open, so it has a budget of its own; code loaded only when a screen needs it — the QR reader, on a
// phone that cannot read codes itself — counts toward the whole. Each font file is fetched only by a
// phone showing the look that uses it. The first Phase 1 build was 355 KiB of code, and the three
// looks' fonts are about 242 KiB. Raising any of these is deliberate — never accidental. The whole was
// raised from 512 KiB on 2026-09-15, for the QR reader (62 KiB), measured before it was added.
const START_BUDGET = 512 * 1024;
const CODE_BUDGET = 640 * 1024;
const FONT_BUDGET = 400 * 1024;
const isFont = (file) => /\.(woff2?|ttf|otf)$/.test(file);

// Strings that look like URLs but are never requested.
const ALLOWED = [
  /^http:\/\/www\.w3\.org\//, // XML namespaces in DOM code
  /^https:\/\/react\.dev\/errors\//, // React's production error messages
  /^https:\/\/rolldown\.rs\//, // a documentation link in a bundler error message
  // The host SDK's table of Bulletin endpoints. It is evaluated when the module loads, so the bundler
  // keeps it, but almanac never connects to them: the host does the talking. Listed exactly, so a new
  // endpoint still fails the build.
  /^wss:\/\/paseo-bulletin-next-rpc\.polkadot\.io$/,
  /^wss:\/\/previewnet\.substrate\.dev\/bulletin$/,
  /^wss:\/\/bulletin-paseo\.tservices\.es:8443$/,
];

function files(dir) {
  return readdirSync(dir).flatMap((f) => {
    const path = join(dir, f);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

let all;
try {
  all = files(DIST);
} catch {
  console.error("guard: no dist/ — build first");
  process.exit(1);
}

// What index.html loads: itself, and every script and stylesheet it names — the entry and the modules
// Vite preloads for it. Anything else is loaded later, if at all.
const INDEX = join(DIST, "index.html");
const atStart = new Set([INDEX]);
for (const [, path] of readFileSync(INDEX, "utf8").matchAll(/(?:src|href)="(?:\.\/)?([^"]+\.(?:m?js|css))"/g)) atStart.add(join(DIST, path));

const found = new Map();
const size = { code: 0, fonts: 0, start: 0 };
const fontFiles = all.filter(isFont).length;
for (const file of all) {
  size[isFont(file) ? "fonts" : "code"] += statSync(file).size;
  if (atStart.has(file)) size.start += statSync(file).size;
  if (!/\.(js|mjs|html|css)$/.test(file)) continue;
  for (const [url] of readFileSync(file, "utf8").matchAll(/\b(?:https?|wss?):\/\/[^\s"'`)<>\\]+/g)) {
    if (!ALLOWED.some((re) => re.test(url))) found.set(url, relative(DIST, file));
  }
}

let failed = false;
if (found.size) {
  failed = true;
  console.error("guard: external URLs in dist/:");
  for (const [url, file] of found) console.error(`  ${url}  (${file})`);
}
const kib = (bytes) => (bytes / 1024).toFixed(1);
console.log(
  `guard: dist/ is ${kib(size.code)} KiB of code in ${all.length - fontFiles} files (${kib(size.start)} KiB loaded at start), ${kib(size.fonts)} KiB of fonts in ${fontFiles}`,
);
for (const [kind, budget, what] of [
  ["start", START_BUDGET, "code loaded at start"],
  ["code", CODE_BUDGET, "code"],
  ["fonts", FONT_BUDGET, "fonts"],
]) {
  if (size[kind] > budget) {
    failed = true;
    console.error(`guard: ${what} over the ${budget / 1024} KiB budget`);
  }
}
process.exit(failed ? 1 : 0);
