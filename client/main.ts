// Activity client. Bundled with the Embedded App SDK into /app.js (same-origin,
// CSP-safe). Boots the Discord handshake, then hydrates paging, validation and
// submission over the server-rendered markup.

import { DiscordSDK, RPCCloseCodes } from "@discord/embedded-app-sdk";
import type { Field, FormConfig } from "../src/types";

type AnswerValue = string | string[];

const clientId = document.body.dataset.clientId ?? "";

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const sheet = $("sheet");
const gutter = $("gutter");
const alertBox = $("alert");
const alertTitle = $("alerttitle");
const alertLinks = $("alertlinks");
const btnNext = $("next") as HTMLButtonElement;
const btnBack = $("back") as HTMLButtonElement;
const btnCancel = $("cancel") as HTMLButtonElement;
const bootview = $("bootview");

let config: FormConfig;
let pageCount = 1;
let page = 1;
let sessionToken: string | null = null;
let submitting = false;
let editingIdea: number | null = null;

// --- config + rules --------------------------------------------------------

interface Rule {
  f: string;
  n: string;
  ok: () => boolean;
}
let rulesByPage: Record<number, Rule[]> = {};

function isFilled(field: Field): boolean {
  if (field.type === "text" || field.type === "textarea") {
    const el = document.getElementById(`f_${field.id}`) as HTMLInputElement | HTMLTextAreaElement | null;
    return !!el && el.value.trim() !== "";
  }
  return document.querySelectorAll(`input[name="${field.id}"]:checked`).length > 0;
}

function buildRules(cfg: FormConfig): void {
  rulesByPage = {};
  cfg.pages.forEach((p, i) => {
    const pageNum = i + 1;
    rulesByPage[pageNum] = p.fields
      .filter((f) => f.required)
      .map((f) => ({ f: f.id, n: f.errorName ?? f.label, ok: () => isFilled(f) }));
  });
}

function groupEl(fieldId: string): HTMLElement {
  return document.querySelector(`[data-field="${fieldId}"]`) as HTMLElement;
}

function missing(): Rule[] {
  return (rulesByPage[page] ?? []).filter((r) => !r.ok());
}

// --- validation bar (ported from the approved preview) ---------------------

function clearMarks(): void {
  document.querySelectorAll(".group.miss").forEach((g) => g.classList.remove("miss"));
  gutter.innerHTML = "";
  alertBox.classList.remove("on");
}

function jump(fieldId: string, quiet = false): void {
  const g = groupEl(fieldId);
  sheet.scrollTo({ top: Math.max(0, g.offsetTop - 16), behavior: "smooth" });
  g.classList.remove("flash");
  void g.offsetWidth;
  g.classList.add("flash");
  if (!quiet) {
    const el = g.querySelector("input:not([type=hidden]),textarea") as HTMLElement | null;
    if (el) (el as HTMLElement).focus({ preventScroll: true });
  }
}

function showMissing(list: Rule[]): void {
  clearMarks();
  if (!list.length) return;
  list.forEach((r) => groupEl(r.f).classList.add("miss"));
  alertTitle.textContent =
    list.length === 1 ? "One field still needs an answer." : `${list.length} fields still need an answer.`;
  alertLinks.innerHTML = "";
  list.forEach((r, i) => {
    if (i) {
      const s = document.createElement("span");
      s.className = "sep";
      s.textContent = "•";
      alertLinks.appendChild(s);
    }
    const a = document.createElement("a");
    a.textContent = r.n;
    a.tabIndex = 0;
    a.onclick = () => jump(r.f);
    a.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        jump(r.f);
      }
    };
    alertLinks.appendChild(a);
  });
  alertBox.classList.add("on");

  const h = gutter.clientHeight;
  const total = sheet.scrollHeight;
  list.forEach((r) => {
    const g = groupEl(r.f);
    const t = document.createElement("button");
    t.className = "tick";
    t.type = "button";
    t.title = `Go to: ${r.n}`;
    t.style.top = `${Math.max(2, Math.min(h - 14, (g.offsetTop / total) * h))}px`;
    t.onclick = () => jump(r.f);
    gutter.appendChild(t);
  });
  jump(list[0].f, true);
}

// Field-keyed server errors -> the same bar.
function showServerErrors(errors: Record<string, string>): void {
  const list: Rule[] = Object.keys(errors).map((f) => ({ f, n: labelFor(f), ok: () => false }));
  clearMarks();
  list.forEach((r) => groupEl(r.f)?.classList.add("miss"));
  const count = list.length;
  alertTitle.textContent = count === 1 ? "One field needs attention." : `${count} fields need attention.`;
  alertLinks.innerHTML = "";
  list.forEach((r, i) => {
    if (i) {
      const s = document.createElement("span");
      s.className = "sep";
      s.textContent = "•";
      alertLinks.appendChild(s);
    }
    const a = document.createElement("a");
    a.textContent = r.n;
    a.onclick = () => jump(r.f);
    alertLinks.appendChild(a);
  });
  alertBox.classList.add("on");
  if (list[0]) jump(list[0].f, true);
}

function labelFor(fieldId: string): string {
  const f = allFields().find((x) => x.id === fieldId);
  return f?.errorName ?? f?.label ?? fieldId;
}

function allFields(): Field[] {
  return config.pages.flatMap((p) => p.fields);
}

// --- paging ----------------------------------------------------------------

function setPage(n: number): void {
  page = n;
  clearMarks();
  for (let i = 1; i <= pageCount; i++) {
    const blk = document.getElementById(`page${i}`);
    if (blk) blk.classList.toggle("hidden", i !== n);
  }
  $("sentview").classList.add("hidden");
  btnBack.style.visibility = n > 1 ? "visible" : "hidden";
  btnNext.textContent = n === pageCount ? (editingIdea ? "Save changes" : "Submit idea") : "Continue";
  document.querySelectorAll(".tab").forEach((t) => {
    const i = Number((t as HTMLElement).dataset.tab);
    t.setAttribute("aria-current", i === n ? "true" : "false");
    t.classList.toggle("done", i < n);
  });
  sheet.scrollTop = 0;
}

// --- answers ---------------------------------------------------------------

function collectAnswers(): Record<string, AnswerValue> {
  const out: Record<string, AnswerValue> = {};
  for (const f of allFields()) {
    if (f.type === "text" || f.type === "textarea") {
      const el = document.getElementById(`f_${f.id}`) as HTMLInputElement | HTMLTextAreaElement | null;
      const v = el?.value.trim() ?? "";
      if (v) out[f.id] = v;
    } else if (f.type === "radio") {
      const c = document.querySelector(`input[name="${f.id}"]:checked`) as HTMLInputElement | null;
      if (c) out[f.id] = c.value;
    } else {
      const vals = Array.from(document.querySelectorAll(`input[name="${f.id}"]:checked`)).map(
        (c) => (c as HTMLInputElement).value,
      );
      if (vals.length) out[f.id] = vals;
    }
  }
  return out;
}

function optionLabel(field: Field, value: string): string {
  return field.options?.find((o) => o.value === value)?.label ?? value;
}

function renderSent(ideaId: number, answers: Record<string, AnswerValue>, threadUrl?: string): void {
  const titleField = config.embed.titleField;
  const bodyField = config.embed.bodyField;
  const h2 = document.querySelector("#sentview h2");
  if (h2) h2.textContent = editingIdea ? "Idea updated" : "Idea submitted";
  const sub = document.getElementById("sentsub");
  if (sub) {
    sub.textContent = editingIdea
      ? "Your changes are now live on the idea post."
      : "Posted to the ideas forum. Replies and votes will appear in the thread there.";
  }
  ($("s_title") as HTMLElement).textContent = String(answers[titleField] ?? "");
  ($("s_body") as HTMLElement).textContent = String(answers[bodyField] ?? "");
  ($("s_foot") as HTMLElement).textContent = `Idea ${ideaId} · open thread to discuss · react to vote`;

  const dl = $("s_dl");
  dl.innerHTML = "";
  for (const fid of config.embed.summaryFields) {
    const field = allFields().find((f) => f.id === fid);
    if (!field) continue;
    const raw = answers[fid];
    let text = "—";
    if (Array.isArray(raw)) text = raw.map((v) => optionLabel(field, v)).join(", ");
    else if (raw !== undefined) text = field.options ? optionLabel(field, String(raw)) : String(raw);
    const dt = document.createElement("dt");
    dt.textContent = field.embedLabel ?? field.label;
    const dd = document.createElement("dd");
    dd.textContent = text;
    dl.appendChild(dt);
    dl.appendChild(dd);
  }

  const open = $("s_open") as HTMLAnchorElement;
  // Auto-close so the Activity doesn't linger in the corner after submitting.
  const autoClose = window.setTimeout(() => closeActivity(), 9000);
  if (threadUrl) {
    open.href = threadUrl;
    open.classList.remove("hidden");
    open.onclick = (e) => {
      e.preventDefault();
      window.clearTimeout(autoClose);
      // Open the thread via the SDK (plain links are blocked inside the iframe),
      // then close the Activity.
      sdk.commands.openExternalLink({ url: threadUrl }).catch(() => {});
      closeActivity();
    };
  } else {
    open.classList.add("hidden");
  }

  for (let i = 1; i <= pageCount; i++) document.getElementById(`page${i}`)?.classList.add("hidden");
  clearMarks();
  $("sentview").classList.remove("hidden");
  btnBack.style.visibility = "hidden";
  btnNext.classList.add("hidden");
  btnCancel.classList.remove("hidden");
  btnCancel.textContent = "Close";
  document.querySelectorAll(".tab").forEach((t) => {
    t.setAttribute("aria-current", "false");
    t.classList.add("done");
  });
}

// --- submit ----------------------------------------------------------------

async function submit(): Promise<void> {
  if (submitting) return;
  submitting = true;
  btnNext.disabled = true;
  const answers = collectAnswers();
  try {
    let res = await postSubmit(answers);
    if (res.status === 401) {
      // Session lapsed; re-handshake once and retry silently (spec §12).
      await handshake();
      res = await postSubmit(answers);
    }
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.status === 422 && data.errors) {
      showServerErrors(data.errors as Record<string, string>);
      return;
    }
    if (res.ok || res.status === 202) {
      renderSent(Number(data.idea), answers, data.threadUrl as string | undefined);
      return;
    }
    alertTitle.textContent = "Something went wrong submitting. Please try again.";
    alertLinks.innerHTML = "";
    alertBox.classList.add("on");
  } finally {
    submitting = false;
    btnNext.disabled = false;
  }
}

function postSubmit(answers: Record<string, AnswerValue>): Promise<Response> {
  const payload = editingIdea ? { answers, edit: editingIdea } : { answers };
  return fetch("/api/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken ?? ""}` },
    body: JSON.stringify(payload),
  });
}

// --- identity handshake (spec §6) ------------------------------------------

const sdk = new DiscordSDK(clientId);

// Close the Activity and return the user to Discord.
function closeActivity(): void {
  try {
    sdk.close(RPCCloseCodes.CLOSE_NORMAL, "closed");
  } catch (e) {
    console.error("close failed", e);
  }
}

// If the user arrived via /idea-edit, pull the target idea's answers and pre-fill.
async function loadEditTarget(): Promise<void> {
  try {
    const res = await fetch("/api/edit-target", { headers: { Authorization: `Bearer ${sessionToken ?? ""}` } });
    if (!res.ok) return;
    const d = (await res.json()) as { editing?: boolean; idea?: number; answers?: Record<string, AnswerValue> };
    if (d && d.editing && d.idea) {
      editingIdea = d.idea;
      prefill(d.answers ?? {});
      markEditing();
    }
  } catch {
    // ignore — fall back to a normal (new) submission
  }
}

function prefill(answers: Record<string, AnswerValue>): void {
  for (const f of allFields()) {
    const v = answers[f.id];
    if (v === undefined || v === null) continue;
    if (f.type === "text" || f.type === "textarea") {
      const el = document.getElementById(`f_${f.id}`) as HTMLInputElement | HTMLTextAreaElement | null;
      if (el) {
        el.value = String(v);
        const c = document.getElementById(`c_${f.id}`);
        if (c) c.textContent = String(String(v).length);
      }
    } else {
      const vals = Array.isArray(v) ? v : [v];
      vals.forEach((val) => {
        const el = document.querySelector(`input[name="${f.id}"][value="${String(val)}"]`) as HTMLInputElement | null;
        if (el) el.checked = true;
      });
    }
  }
}

function markEditing(): void {
  const sub = document.querySelector(".brandrow .sub");
  if (sub) sub.textContent = `Editing Idea ${editingIdea}`;
  if (page === pageCount) btnNext.textContent = "Save changes";
}

async function handshake(): Promise<void> {
  await sdk.ready();
  const { code } = await sdk.commands.authorize({
    client_id: clientId,
    response_type: "code",
    state: "",
    prompt: "none",
    scope: ["identify"],
  });
  const res = await fetch("/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status}`);
  const data = (await res.json()) as { session: string; access_token: string };
  sessionToken = data.session;
  await sdk.commands.authenticate({ access_token: data.access_token });
}

// --- wiring ----------------------------------------------------------------

function wireCounters(): void {
  for (const f of allFields()) {
    if ((f.type === "text" || f.type === "textarea") && f.maxLength) {
      const el = document.getElementById(`f_${f.id}`) as HTMLInputElement | HTMLTextAreaElement | null;
      const out = document.getElementById(`c_${f.id}`);
      if (el && out) el.addEventListener("input", () => (out.textContent = String(el.value.length)));
    }
  }
}

function wireLiveClear(): void {
  const live = () => {
    if (!alertBox.classList.contains("on")) return;
    const m = missing();
    if (!m.length) clearMarks();
    else showMissing(m);
  };
  document.addEventListener("input", live);
  document.addEventListener("change", live);
}

btnNext.onclick = () => {
  const m = missing();
  if (m.length) {
    showMissing(m);
    return;
  }
  if (page < pageCount) setPage(page + 1);
  else void submit();
};
btnBack.onclick = () => {
  if (page > 1) setPage(page - 1);
};
// Cancel closes the whole Activity (returns to Discord), rather than just
// clearing fields — there's no other exit inside the iframe.
btnCancel.onclick = () => closeActivity();

async function init(): Promise<void> {
  const cfgRes = await fetch("/api/config");
  config = (await cfgRes.json()) as FormConfig;
  pageCount = config.pages.length;
  buildRules(config);
  wireCounters();
  wireLiveClear();
  setPage(1);

  try {
    bootview.classList.remove("hidden");
    await handshake();
    await loadEditTarget();
    bootview.classList.add("hidden");
  } catch (err) {
    console.error("handshake failed", err);
    bootview.textContent = "Couldn't connect to Discord. Close this and open it again from the Submit an idea button.";
    bootview.classList.remove("hidden");
  }
}

void init();
