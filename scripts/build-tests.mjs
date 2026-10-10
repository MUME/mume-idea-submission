// Bundle the test files (and the TS sources they import) so `node --test` can run
// them without a TS loader. Node builtins stay external.

import { build } from "esbuild";
import { readdirSync, mkdirSync } from "node:fs";

mkdirSync(new URL("../test/.build/", import.meta.url), { recursive: true });

const tests = readdirSync(new URL("../test/", import.meta.url))
  .filter((f) => f.endsWith(".test.mjs"))
  .map((f) => `test/${f}`);

await build({
  entryPoints: tests,
  bundle: true,
  format: "esm",
  platform: "node",
  target: ["node20"],
  outdir: "test/.build",
  outExtension: { ".js": ".mjs" },
  external: ["node:*"],
  logLevel: "warning",
});
