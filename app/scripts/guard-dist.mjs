// Fails when dist/ references an external URL or outgrows the budget.
//
// almanac makes no request it does not mean to: fonts are bundled, nothing is fetched from a CDN, and
// there is no analytics. And every byte of the bundle is uploaded to Bulletin and renewed, so size is
// a cost, not a detail.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const DIST = resolve(import.meta.dirname, "../dist");

// Code and fonts have separate budgets (docs/DESIGN.md §4). Code runs on every open; each font file is
// fetched only by a phone showing the look that uses it. The first Phase 1 build was 355 KiB of code,
// and the three looks' fonts are about 242 KiB. Raising either is deliberate — never accidental.
const CODE_BUDGET = 512 * 1024;
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

const found = new Map();
const size = { code: 0, fonts: 0 };
const fontFiles = all.filter(isFont).length;
for (const file of all) {
  size[isFont(file) ? "fonts" : "code"] += statSync(file).size;
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
  `guard: dist/ is ${kib(size.code)} KiB of code in ${all.length - fontFiles} files, ${kib(size.fonts)} KiB of fonts in ${fontFiles}`,
);
for (const [kind, budget] of [["code", CODE_BUDGET], ["fonts", FONT_BUDGET]]) {
  if (size[kind] > budget) {
    failed = true;
    console.error(`guard: ${kind} over the ${budget / 1024} KiB budget`);
  }
}
process.exit(failed ? 1 : 0);
