// Bundle the Activity client (with the Embedded App SDK) into a single same-origin
// file the Worker serves at /app.js. Same-origin script keeps it inside the
// Activity CSP.

import { build } from "esbuild";

await build({
  entryPoints: ["client/main.ts"],
  bundle: true,
  format: "iife",
  target: ["es2020"],
  minify: true,
  legalComments: "none",
  outfile: "src/generated/app.client.js",
  logLevel: "info",
});

console.log("built src/generated/app.client.js");
