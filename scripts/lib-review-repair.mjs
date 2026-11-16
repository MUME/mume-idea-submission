// Discord discovery for manual private-copy recovery. Fail closed on incomplete scans.
export async function findReviewCopies(request, guildId, forumId, ideaId, botId) {
  const active = await request("/guilds/" + guildId + "/threads/active");
  if (!Array.isArray(active.threads)) throw Error("Invalid active-thread response");
  const threads = new Map();
  const add = (rows) => {
    for (const thread of rows) if (thread.parent_id === forumId) threads.set(thread.id, thread);
  };
  add(active.threads);
  let before;
  const seen = new Set();
  for (;;) {
    const page = await request("/channels/" + forumId + "/threads/archived/public?limit=100" +
      (before ? "&before=" + encodeURIComponent(before) : ""));
    if (!Array.isArray(page.threads) || typeof page.has_more !== "boolean")
      throw Error("Invalid archived-thread response; refusing to create a duplicate");
    add(page.threads);
    if (!page.has_more) break;
    const next = page.threads.at(-1)?.thread_metadata?.archive_timestamp;
    if (!next || seen.has(next)) throw Error("Incomplete archived-thread scan");
    seen.add(next);
    before = next;
  }
  const matches = [];
  for (const thread of threads.values()) {
    // A forum starter's message id equals its thread id.
    const message = await request("/channels/" + thread.id + "/messages/" + thread.id);
    if (message.author?.id !== botId) continue;
    if (!message.embeds?.some((e) => e.footer?.text?.startsWith("Idea " + ideaId + " ·"))) continue;
    matches.push({ threadId: thread.id, messageId: message.id });
  }
  if (matches.length > 1) throw Error("Multiple private copies found for idea " + ideaId + "; inspect them manually");
  return matches[0] || null;
}

// No POST until discovery has completed successfully. Reuse a delivered but
// unattached starter after a failed database write instead of posting it again.
export async function repairReviewCopy({ find, create, attach }) {
  const existing = await find();
  const copy = existing || await create();
  await attach(copy);
  return { ...copy, reused: !!existing };
}
