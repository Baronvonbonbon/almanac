import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// almanac's own code — the share formats, the vault, the host, the codes, the shared screens — is
// imported as it is from app/src, under "@app", so the two apps can never disagree about a format.
const app = fileURLToPath(new URL("../app/src", import.meta.url));

export default defineConfig({
  plugins: [react()],
  // pad uploads a static directory and points a DotNS contenthash at it: everything resolves relatively.
  base: "./",
  resolve: { alias: [{ find: /^@app\//, replacement: `${app}/` }], dedupe: ["react", "react-dom"] },
  server: { fs: { allow: [fileURLToPath(new URL("..", import.meta.url))] } },
  build: { target: "es2022", outDir: "dist" },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
