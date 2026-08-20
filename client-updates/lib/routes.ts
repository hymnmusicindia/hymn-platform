import type { UserRole } from "@/lib/types";

export function destinationForRole(role: UserRole) {
  if (role === "admin") return "/admin";
  if (role === "producer") return "/producer/dashboard";
  return "/dashboard";
}
