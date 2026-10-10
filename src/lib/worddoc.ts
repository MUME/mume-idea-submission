// Render an idea as an RTF document — a native Word format that opens as a normal
// editable doc, with formatting and a clickable link back to the idea thread.
// Generated as a plain string, so it works in the Worker (no heavy library).

import type { FormConfig, IdeaRow } from "../types";
import { STATUS_LABEL } from "../constants";
import { fieldById } from "./config";
import { answerText } from "../discord/embed";

// Escape text for RTF, including Unicode (accents, emoji) via \uN? escapes.
function esc(s: string): string {
  let out = "";
  for (const ch of s ?? "") {
    const cp = ch.codePointAt(0) ?? 0;
    if (ch === "\\") out += "\\\\";
    else if (ch === "{") out += "\\{";
    else if (ch === "}") out += "\\}";
    else if (ch === "\n") out += "\\par\n";
    else if (ch === "\r") continue;
    else if (ch === "\t") out += "\\tab ";
    else if (cp < 128) out += ch;
    else if (cp <= 0xffff) out += `\\u${cp > 32767 ? cp - 65536 : cp}?`;
    else {
      const c = cp - 0x10000;
      const hi = 0xd800 + (c >> 10);
      const lo = 0xdc00 + (c & 0x3ff);
      out += `\\u${hi > 32767 ? hi - 65536 : hi}?\\u${lo > 32767 ? lo - 65536 : lo}?`;
    }
  }
  return out;
}

function isoDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().replace("T", " ").slice(0, 16);
}

export function ideaToWordDoc(idea: IdeaRow, config: FormConfig, threadUrl: string | null): string {
  const answers = JSON.parse(idea.answers) as Record<string, string | string[]>;
  const parts: string[] = [];

  parts.push(`{\\b\\fs34 ${esc(`Idea ${idea.id} \u00b7 ${idea.title}`)}}\\par`);
  parts.push(
    `{\\fs20\\cf3 ${esc(
      `Status: ${STATUS_LABEL[idea.status]}   \u00b7   Submitted by ${idea.author_name}   \u00b7   ${isoDate(idea.created_at)}`,
    )}}\\par\\par`,
  );

  const section = (heading: string, body: string) => {
    if (!body || body === "\u2014") return;
    parts.push(`{\\b\\fs26 ${esc(heading)}}\\par`);
    parts.push(`{\\fs22 ${esc(body)}}\\par\\par`);
  };
  const inline = (label: string, body: string) => {
    if (!body || body === "\u2014") return;
    parts.push(`{\\b ${esc(label)}: }{\\fs22 ${esc(body)}}\\par`);
  };

  const bodyField = fieldById(config, config.embed.bodyField);
  if (bodyField) section("Description", answerText(bodyField, answers[bodyField.id]));

  for (const fid of config.embed.summaryFields) {
    const f = fieldById(config, fid);
    if (f) inline(f.embedLabel ?? f.label, answerText(f, answers[fid]));
  }
  parts.push(`\\par`);

  for (const fid of config.embed.detailFields ?? []) {
    const f = fieldById(config, fid);
    if (f) section(f.embedLabel ?? f.label, answerText(f, answers[fid]));
  }

  if (threadUrl) {
    parts.push(
      `\\par{\\field{\\*\\fldinst{HYPERLINK "${threadUrl}"}}{\\fldrslt{\\ul\\cf1\\fs24 \u2192 Open the original idea thread in Discord}}}\\par`,
    );
  }

  return (
    `{\\rtf1\\ansi\\ansicpg1252\\deff0` +
    `{\\fonttbl{\\f0 Calibri;}}` +
    `{\\colortbl;\\red21\\green101\\blue192;\\red88\\green101\\blue242;\\red109\\green111\\blue120;}` +
    `\\f0\\fs22\n` +
    parts.join("\n") +
    `}`
  );
}
