// Server-render the Activity page from config (build spec §11). The markup exists
// before any script runs; the client (/app.js) hydrates identity, paging and
// validation. Dark theme only.

import type { Field, FormConfig, Page } from "../types";
import { FORM_CSS } from "./css";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function reqMark(field: Field): string {
  return field.required ? '<span class="req">*</span>' : "";
}

function guidance(field: Field): string {
  if (!field.guidance?.length) return "";
  const label = field.guidanceLabel ?? "What to include";
  const items = field.guidance.map((g) => `<li>${escapeHtml(g)}</li>`).join("");
  return `<details><summary>${escapeHtml(label)}</summary><ul>${items}</ul></details>`;
}

function textField(field: Field): string {
  const max = field.maxLength ? ` maxlength="${field.maxLength}"` : "";
  const ph = field.placeholder ? ` placeholder="${escapeHtml(field.placeholder)}"` : "";
  const counter = field.maxLength
    ? `<div class="count"><span id="c_${field.id}">0</span>/${field.maxLength}</div>`
    : "";
  return `<div class="group" data-field="${field.id}">
  <label class="label" for="f_${field.id}">${escapeHtml(field.label)}${reqMark(field)}</label>
  ${field.help ? `<p class="hint">${escapeHtml(field.help)}</p>` : ""}
  <input type="text" id="f_${field.id}"${max}${ph}>
  ${counter}
</div>`;
}

function textareaField(field: Field): string {
  const max = field.maxLength ? ` maxlength="${field.maxLength}"` : "";
  const ph = field.placeholder ? ` placeholder="${escapeHtml(field.placeholder)}"` : "";
  const counter = field.maxLength
    ? `<div class="count"><span id="c_${field.id}">0</span>/${field.maxLength}</div>`
    : "";
  return `<div class="group" data-field="${field.id}">
  <label class="label" for="f_${field.id}">${escapeHtml(field.label)}${reqMark(field)}</label>
  ${field.help ? `<p class="hint">${escapeHtml(field.help)}</p>` : ""}
  <textarea id="f_${field.id}"${max}${ph}></textarea>
  ${counter}
  ${guidance(field)}
</div>`;
}

function choiceField(field: Field): string {
  const inputType = field.type === "radio" ? "radio" : "checkbox";
  const marker = field.type === "radio" ? "dot" : "box";
  const options = (field.options ?? [])
    .map((o) => {
      const desc = o.description ? `<em>${escapeHtml(o.description)}</em>` : "";
      return `<label class="choice"><input type="${inputType}" name="${field.id}" value="${escapeHtml(o.value)}"><span class="${marker}"></span><span class="text">${escapeHtml(o.label)}${desc}</span></label>`;
    })
    .join("\n");
  const wrapped = field.layout === "cols" ? `<div class="cols">${options}</div>` : options;
  return `<fieldset class="group" data-field="${field.id}">
  <legend>${escapeHtml(field.label)}${reqMark(field)}</legend>
  ${field.help ? `<p class="hint">${escapeHtml(field.help)}</p>` : ""}
  ${wrapped}
</fieldset>`;
}

function renderField(field: Field): string {
  switch (field.type) {
    case "text":
      return textField(field);
    case "textarea":
      return textareaField(field);
    case "radio":
    case "checkbox":
      return choiceField(field);
  }
}

function renderPage(page: Page, index: number): string {
  const hidden = index === 0 ? "" : " hidden";
  const fields = page.fields.map(renderField).join("\n");
  return `<div id="page${index + 1}" class="pageblk${hidden}">\n${fields}\n</div>`;
}

function renderTabs(config: FormConfig): string {
  return config.pages
    .map(
      (p, i) =>
        `<button class="tab" type="button" data-tab="${i + 1}" aria-current="${i === 0 ? "true" : "false"}">${escapeHtml(p.title)}</button>`,
    )
    .join("\n");
}

function renderIntro(config: FormConfig): string {
  if (!config.intro?.length) return "";
  const items = config.intro.map((t) => `<li>${escapeHtml(t)}</li>`).join("");
  return `<div class="callout"><div class="ico">!</div><ul>${items}</ul></div>`;
}

export function renderActivityPage(config: FormConfig, clientId: string): string {
  const crest = escapeHtml((config.title || "M").trim().charAt(0).toUpperCase() || "M");
  const pages = config.pages.map((p, i) => renderPage(p, i)).join("\n");
  // The intro callout belongs at the top of page one.
  const pagesWithIntro = pages.replace(
    '<div id="page1" class="pageblk">\n',
    `<div id="page1" class="pageblk">\n${renderIntro(config)}\n`,
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(config.title)} — MUME</title>
<style>${FORM_CSS}</style>
</head>
<body data-client-id="${escapeHtml(clientId)}">
<div class="modal" role="dialog" aria-modal="true" aria-labelledby="mtitle">
  <div class="head">
    <div class="brandrow">
      <div class="crest">${crest}</div>
      <div>
        <h1 id="mtitle">${escapeHtml(config.title)}</h1>
        <div class="sub">${escapeHtml(config.subtitle)}</div>
      </div>
    </div>
    <div class="tabs">${renderTabs(config)}</div>
  </div>

  <div class="bodywrap">
    <div class="sheet" id="sheet">
      ${pagesWithIntro}

      <div id="sentview" class="sent hidden">
        <h2>Idea submitted</h2>
        <p id="sentsub">Posted to the ideas forum. Replies and votes will appear in the thread there.</p>
        <div class="embed">
          <h3 id="s_title"></h3>
          <dl id="s_dl"></dl>
          <p class="b" id="s_body"></p>
          <div class="fnote" id="s_foot"></div>
        </div>
        <a class="open hidden" id="s_open" target="_blank" rel="noopener">Open the discussion</a>
      </div>

      <div id="bootview" class="boot hidden">Connecting to Discord…</div>
    </div>
    <div class="gutter" id="gutter" aria-hidden="true"></div>
  </div>

  <div class="foot">
    <div class="alert" id="alert">
      <div class="ico">!</div>
      <div class="msg"><strong id="alerttitle"></strong><span id="alertlinks"></span></div>
    </div>
    <div class="actions">
      <button class="btn text" type="button" id="back" style="visibility:hidden">Back</button>
      <div class="spacer"></div>
      <button class="btn text" type="button" id="cancel">Cancel</button>
      <button class="btn primary" type="button" id="next">Continue</button>
    </div>
  </div>
</div>
<script src="/app.js"></script>
</body>
</html>`;
}
