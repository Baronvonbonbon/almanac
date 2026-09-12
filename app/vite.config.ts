import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  // pad uploads a static directory and points a DotNS contenthash at it — no server, no origin — so
  // everything must resolve relatively.
  base: "./",
  build: { target: "es2022", outDir: "dist" },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
