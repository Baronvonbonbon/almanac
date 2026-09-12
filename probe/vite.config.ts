import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf8"));

/** The installed versions, not the semver ranges — a report must name what ran. */
function installedVersions(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of Object.keys(pkg.dependencies ?? {})) {
    for (const dir of [resolve(__dirname, "node_modules", name), resolve(__dirname, "../node_modules", name)]) {
      try {
        out[name] = JSON.parse(readFileSync(resolve(dir, "package.json"), "utf8")).version;
        break;
      } catch {
        out[name] = `${pkg.dependencies[name]} (not installed)`;
      }
    }
  }
  return out;
}

export default defineConfig({
  // pad uploads a static directory and points a DotNS contenthash at it — there is no server and no
  // origin, so everything must resolve relatively.
  base: "./",
  build: { target: "es2022", outDir: "dist" },
  define: {
    __PROBE_VERSION__: JSON.stringify(pkg.version),
    __SDK_VERSIONS__: JSON.stringify(installedVersions()),
    // Two builds of the same version are different bundles; a report must say which one ran.
    __BUILD_ID__: JSON.stringify(new Date().toISOString()),
  },
  server: { host: true },
});
