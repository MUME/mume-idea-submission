import type { Env } from "../types";
import { beginLogin, currentAdmin } from "../admin/routes";

export async function handleReviewPage(
  env: Env,
  request: Request,
): Promise<Response> {
  if (!(await currentAdmin(env, request)))
    return beginLogin(
      env,
      new URL(request.url).pathname + new URL(request.url).search,
    );
  return new Response(
    '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Council review moved</title><body><h1>Review this idea in Discord</h1><p>Use Assess idea on its private review post. Scores are now fluid, with three Council members agreeing to the whole assessment before publication.</p></body></html>',
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}
export async function handleReviewApi(
  _env: Env,
  _request: Request,
): Promise<Response> {
  return Response.json(
    {
      error:
        "This review API has been retired. Use the Discord assessment controls.",
    },
    { status: 410 },
  );
}
