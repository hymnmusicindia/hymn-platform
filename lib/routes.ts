import type { UserRole } from "@/lib/types";
export function qcReportReturnPath(value?:string){return value && /^\/dashboard\/releases\/[1-9]\d*\/qc-report$/.test(value)?value:undefined;}

export function destinationForRole(role: UserRole) {
  if (role === "admin") return "/dashboard";
  if (role === "producer") return "/producer/dashboard";
  return "/dashboard";
}

export function destinationAfterLogin(role: UserRole) {
  return role === "admin" ? "/admin" : "/";
}
