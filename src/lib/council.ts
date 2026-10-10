import type { Env } from "../types";

// Whether a member should be treated as White Council. The special COUNCIL_ROLE_ID
// value "everyone" opens the admin actions to all members — used on open test
// instances. Otherwise it's a normal role-membership check.
export function holdsCouncil(env: Env, roles: string[] | undefined): boolean {
  if (env.COUNCIL_ROLE_ID === "everyone") return true;
  return (roles ?? []).includes(env.COUNCIL_ROLE_ID);
}
