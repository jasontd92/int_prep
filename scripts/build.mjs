import { build } from "esbuild";

await build({
  entryPoints: ["web/main.ts"],
  bundle: true,
  outfile: "dist/bundle.js",
  format: "iife",
  target: "es2022",
  sourcemap: true,
  logLevel: "info",
});
