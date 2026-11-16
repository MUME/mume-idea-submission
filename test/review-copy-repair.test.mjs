import { test } from "node:test";
import assert from "node:assert/strict";
import { findReviewCopies, repairReviewCopy } from "../scripts/lib-review-repair.mjs";

test("repair reuses a previously delivered copy instead of posting another", async () => {
  let created = 0, attached;
  const existing = { threadId: "123", messageId: "123" };
  const result = await repairReviewCopy({
    find: async () => existing,
    create: async () => { created++; throw Error("Must not create"); },
    attach: async (copy) => { attached = copy; },
  });
  assert.equal(created, 0);
  assert.deepEqual(attached, existing);
  assert.equal(result.reused, true);
});
test("repair only creates after successful discovery and preserves posts on attachment failure", async () => {
  let created = 0;
  await assert.rejects(repairReviewCopy({
    find: async () => { throw Error("Discovery failed"); },
    create: async () => { created++; },
    attach: async () => {},
  }), /Discovery failed/);
  assert.equal(created, 0);
  await assert.rejects(repairReviewCopy({
    find: async () => null,
    create: async () => { created++; return { threadId: "123", messageId: "123" }; },
    attach: async () => { throw Error("D1 unavailable"); },
  }), /D1 unavailable/);
  assert.equal(created, 1);
});
test("recovery scans archived pages and verifies forum, bot and idea identity", async () => {
  const routes = [];
  const request = async (route) => {
    routes.push(route);
    if (route.includes("/threads/active")) return { threads: [{ id: "10", parent_id: "other", name: "Idea 1 · Wrong forum" }] };
    if (route.includes("&before=")) return { has_more: false, threads: [{ id: "30", parent_id: "forum", name: "Renamed by Council" }] };
    if (route.includes("/threads/archived/")) return { has_more: true, threads: [{ id: "20", parent_id: "forum", name: "Idea 1 · User copy", thread_metadata: { archive_timestamp: "2026-01-01T00:00:00Z" } }] };
    if (route.includes("/channels/20/")) return { id: "20", author: { id: "person" }, embeds: [{ footer: { text: "Idea 1 · react to vote" } }] };
    if (route.includes("/channels/30/")) return { id: "30", author: { id: "bot" }, embeds: [{ footer: { text: "Idea 1 · react to vote" } }] };
    throw Error("Unexpected route " + route);
  };
  assert.deepEqual(await findReviewCopies(request, "guild", "forum", 1, "bot"), { threadId: "30", messageId: "30" });
  assert.ok(routes.some((r) => r.includes("&before=")));
});
test("incomplete scans fail closed and multiple real copies require manual inspection", async () => {
  await assert.rejects(findReviewCopies(async (route) => route.includes("/active")
    ? { threads: [] } : { threads: [], has_more: true }, "guild", "forum", 1, "bot"), /Incomplete/);
  const request = async (route) => {
    if (route.includes("/active")) return { threads: ["10", "20"].map((id) => ({ id, parent_id: "forum", name: "Idea 1 · Duplicate" })) };
    if (route.includes("/archived/")) return { threads: [], has_more: false };
    return { id: route.includes("/10/") ? "10" : "20", author: { id: "bot" }, embeds: [{ footer: { text: "Idea 1 · react to vote" } }] };
  };
  await assert.rejects(findReviewCopies(request, "guild", "forum", 1, "bot"), /Multiple private copies/);
});
