// Turn idea rows into a CSV. Each idea's answers are resolved to human labels
// using the config version stamped on that row, so exports stay accurate even
// after the form changes.

import type { Answers, Env, FormConfig, IdeaRow } from "../types";
import { STATUS_LABEL } from "../constants";
import { allFields, fieldById, loadConfigVersion, loadLiveConfig } from "./config";
import { answerText } from "../discord/embed";

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function isoDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().replace("T", " ").slice(0, 19);
}

export async function ideasToCsv(env: Env, ideas: IdeaRow[]): Promise<string> {
  const live = await loadLiveConfig(env);
  const fields = allFields(live);

  // Cache config by version so a bulk export loads each version once.
  const cache = new Map<number, FormConfig>([[live.version, live]]);
  const configFor = async (v: number): Promise<FormConfig> => {
    let c = cache.get(v);
    if (!c) {
      c = await loadConfigVersion(env, v);
      cache.set(v, c);
    }
    return c;
  };

  const header = ["Number", "Title", "Author", "Status", "Submitted", "Updated", ...fields.map((f) => f.embedLabel ?? f.label)];
  const lines = [header.map(csvCell).join(",")];

  for (const idea of ideas) {
    const cfg = await configFor(idea.schema_version);
    const answers = JSON.parse(idea.answers) as Answers;
    const meta = [
      idea.id,
      idea.title,
      idea.author_name,
      STATUS_LABEL[idea.status],
      isoDate(idea.created_at),
      isoDate(idea.updated_at),
    ];
    const values = fields.map((f) => {
      const value = answers[f.id];
      if (value === undefined) return "";
      // Resolve option values to labels via the field as it existed for this idea.
      const stampedField = fieldById(cfg, f.id) ?? f;
      const text = answerText(stampedField, value);
      return text === "—" ? "" : text;
    });
    lines.push([...meta, ...values].map(csvCell).join(","));
  }

  return lines.join("\r\n");
}
