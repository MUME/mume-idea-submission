// GET /admin/export[?status=approved] — download ideas as CSV (Council/CMS auth
// is checked by the caller).

import type { Env, IdeaRow, Status } from "../types";
import { STATUSES } from "../constants";
import { ideasToCsv } from "../lib/csv";

export async function handleExport(env: Env, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  const status = STATUSES.includes(statusParam as Status) ? (statusParam as Status) : null;

  const stmt = status
    ? env.DB.prepare("SELECT * FROM ideas WHERE status = ? ORDER BY id ASC").bind(status)
    : env.DB.prepare("SELECT * FROM ideas ORDER BY id ASC");
  const result = await stmt.all<IdeaRow>();
  const csv = await ideasToCsv(env, result.results ?? []);

  const name = status ? `mume-ideas-${status}.csv` : "mume-ideas-all.csv";
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
