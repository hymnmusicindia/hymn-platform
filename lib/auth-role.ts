import type { UserRole } from "@/lib/types";

function configuredAdminEmails(value = process.env.ADMIN_GOOGLE_EMAILS ?? "") {
  return new Set(
    value
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Resolve the authoritative account role during Google sign-in.
 * Login-page selection is deliberately excluded: navigation intent must never
 * grant an account an administrative or producer capability.
 */
export function resolveGoogleAccountRole(email: string, existingRole?: string | null): UserRole {
  if (configuredAdminEmails().has(email.trim().toLowerCase())) return "admin";
  if (existingRole === "ADMIN" || existingRole === "admin") return "admin";
  if (existingRole === "PRODUCER" || existingRole === "producer") return "producer";
  return "customer";
}
