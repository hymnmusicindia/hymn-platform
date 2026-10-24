import "server-only";
import { requireAdminPermission } from "./access";
import { teamActor } from "./team/access";
import { can } from "./team/policy";

/** Support access never grants the wider administrator session or its permissions. */
export async function requireSupportAccess() {
  const admin = await requireAdminPermission("services.manage");
  if (!("error" in admin)) return admin;
  try {
    const actor = await teamActor();
    if (can(actor, "support.reply") || can(actor, "crm.outreach.manage")) return { sub: actor.userId };
  } catch { /* Deny unavailable, inactive or absent memberships. */ }
  return admin;
}
