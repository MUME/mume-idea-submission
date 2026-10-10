// Server-side answer validation (build spec §8 step 2). Never trust the client.
//
// Returns a field-keyed error map. Empty map means valid. The client renders
// these in the bottom bar, but the server is the only authority.

import type { Answers, FormConfig } from "../types";
import { allFields } from "./config";

export interface ValidationResult {
  ok: boolean;
  errors: Record<string, string>;
  // Normalised answers: trimmed strings, arrays for checkboxes, unknown fields dropped.
  clean: Answers;
}

export function validateAnswers(config: FormConfig, raw: unknown): ValidationResult {
  const errors: Record<string, string> = {};
  const clean: Answers = {};
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  for (const field of allFields(config)) {
    const value = input[field.id];
    const label = field.errorName ?? field.label;

    if (field.type === "text" || field.type === "textarea") {
      const str = typeof value === "string" ? value.trim() : "";
      if (field.required && str === "") {
        errors[field.id] = `Please provide ${label}.`;
      } else if (field.maxLength && str.length > field.maxLength) {
        errors[field.id] = `${capitalise(label)} must be ${field.maxLength} characters or fewer.`;
      }
      if (str !== "") clean[field.id] = str;
      continue;
    }

    if (field.type === "radio") {
      const known = new Set((field.options ?? []).map((o) => o.value));
      const str = typeof value === "string" ? value : "";
      if (str === "") {
        if (field.required) errors[field.id] = `Please choose ${label}.`;
      } else if (!known.has(str)) {
        errors[field.id] = `${capitalise(label)} is not a valid choice.`;
      } else {
        clean[field.id] = str;
      }
      continue;
    }

    if (field.type === "checkbox") {
      const known = new Set((field.options ?? []).map((o) => o.value));
      const arr = Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
      const unknown = arr.find((v) => !known.has(v));
      if (unknown !== undefined) {
        errors[field.id] = `${capitalise(label)} contains an invalid choice.`;
      } else if (field.required && arr.length === 0) {
        errors[field.id] = `Please select ${label}.`;
      } else if (arr.length > 0) {
        // De-duplicate while preserving option order.
        clean[field.id] = (field.options ?? []).map((o) => o.value).filter((v) => arr.includes(v));
      }
      continue;
    }
  }

  return { ok: Object.keys(errors).length === 0, errors, clean };
}

function capitalise(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}
