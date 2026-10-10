// Form config in KV (build spec §5).
//
// Live config at `form:config`. Every save also writes an immutable copy at
// `form:config:v<version>`; old versions are never deleted because stored ideas
// point at them. Always resolve an answer's label against the version stamped on
// the idea row, never against the live config.

import type { Env, Field, FormConfig } from "../types";
import { KV } from "../constants";

const FIELD_TYPES = new Set(["text", "textarea", "radio", "checkbox"]);

export async function loadLiveConfig(env: Env): Promise<FormConfig> {
  const raw = await env.CONFIG.get(KV.liveConfig);
  if (!raw) throw new Error("form config not seeded; run `npm run seed`");
  return JSON.parse(raw) as FormConfig;
}

export async function loadConfigVersion(env: Env, version: number): Promise<FormConfig> {
  const raw = await env.CONFIG.get(KV.configVersion(version));
  if (raw) return JSON.parse(raw) as FormConfig;
  // Fall back to live config if the versioned copy is somehow missing.
  const live = await loadLiveConfig(env);
  return live;
}

export function allFields(config: FormConfig): Field[] {
  return config.pages.flatMap((p) => p.fields);
}

export function fieldById(config: FormConfig, id: string): Field | undefined {
  return allFields(config).find((f) => f.id === id);
}

// Validate the *shape* of a config document before it is stored. Throws on the
// first problem with a human-readable message. This is not answer validation.
export function assertValidConfig(doc: unknown): asserts doc is FormConfig {
  const c = doc as FormConfig;
  if (!c || typeof c !== "object") throw new Error("config must be an object");
  if (typeof c.title !== "string") throw new Error("config.title must be a string");
  if (!Array.isArray(c.pages) || c.pages.length === 0) throw new Error("config.pages must be a non-empty array");

  const ids = new Set<string>();
  for (const page of c.pages) {
    if (!page.id || typeof page.id !== "string") throw new Error("each page needs an id");
    if (!Array.isArray(page.fields) || page.fields.length === 0) throw new Error(`page ${page.id} has no fields`);
    for (const f of page.fields) {
      if (!f.id || typeof f.id !== "string") throw new Error(`page ${page.id} has a field with no id`);
      if (ids.has(f.id)) throw new Error(`duplicate field id: ${f.id}`);
      ids.add(f.id);
      if (!FIELD_TYPES.has(f.type)) throw new Error(`field ${f.id} has invalid type: ${f.type}`);
      if ((f.type === "radio" || f.type === "checkbox")) {
        if (!Array.isArray(f.options) || f.options.length === 0) {
          throw new Error(`field ${f.id} (${f.type}) needs options`);
        }
        const values = new Set<string>();
        for (const o of f.options) {
          if (!o.value || typeof o.value !== "string") throw new Error(`field ${f.id} has an option with no value`);
          if (values.has(o.value)) throw new Error(`field ${f.id} has duplicate option value: ${o.value}`);
          values.add(o.value);
        }
      }
    }
  }

  if (!c.embed || typeof c.embed !== "object") throw new Error("config.embed is required");
  for (const key of ["titleField", "bodyField"] as const) {
    if (!ids.has(c.embed[key])) throw new Error(`embed.${key} points at unknown field: ${c.embed[key]}`);
  }
  if (!Array.isArray(c.embed.summaryFields)) throw new Error("embed.summaryFields must be an array");
  for (const id of c.embed.summaryFields) {
    if (!ids.has(id)) throw new Error(`embed.summaryFields references unknown field: ${id}`);
  }
}

// Save a new config. The caller's `version` is ignored; we bump the live one.
// Returns the stored config with its assigned version.
export async function saveConfig(env: Env, incoming: unknown): Promise<FormConfig> {
  assertValidConfig(incoming);
  let currentVersion = 0;
  const live = await env.CONFIG.get(KV.liveConfig);
  if (live) {
    try {
      currentVersion = (JSON.parse(live) as FormConfig).version ?? 0;
    } catch {
      currentVersion = 0;
    }
  }
  const next: FormConfig = { ...(incoming as FormConfig), version: currentVersion + 1 };
  const serialized = JSON.stringify(next);
  // Write the immutable version first, then flip the live pointer.
  await env.CONFIG.put(KV.configVersion(next.version), serialized);
  await env.CONFIG.put(KV.liveConfig, serialized);
  return next;
}
