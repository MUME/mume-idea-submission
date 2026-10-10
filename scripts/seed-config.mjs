// Seed / update the form config via PUT /admin/config (build spec §5, §9).
// The Worker validates the document and assigns the version; the version in the
// JSON file is ignored.
//
//   npm run seed                      # PUTs to PUBLIC_BASE_URL
//   npm run seed -- http://localhost:8787   # or a specific base URL

import { readFileSync } from "node:fs";
import { loadEnv, require as requireEnv } from "./lib-env.mjs";

const env = loadEnv();
requireEnv(env, ["ADMIN_TOKEN"]);

const base = process.argv[2] || env.PUBLIC_BASE_URL;
if (!base) {
  console.error("No base URL. Pass one as an argument or set PUBLIC_BASE_URL.");
  process.exit(1);
}

const config = JSON.parse(readFileSync(new URL("../seed/form-config.v1.json", import.meta.url), "utf8"));

const res = await fetch(`${base.replace(/\/$/, "")}/admin/config`, {
  method: "PUT",
  headers: { Authorization: `Bearer ${env.ADMIN_TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify(config),
});
const text = await res.text();
if (!res.ok) {
  console.error(`✗ seed failed: ${res.status}\n${text}`);
  process.exit(1);
}
console.log(`✓ seeded config: ${text}`);
