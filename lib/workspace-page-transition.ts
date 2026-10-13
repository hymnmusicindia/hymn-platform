const dashboards = new Set(["/dashboard", "/dashboard/customer", "/dashboard/admin", "/producer/dashboard", "/producer-dashboard", "/admin"]);
export function workspaceSwipeDirection(from: string, to: string): "right" | "left" | null {
  if (from === "/" && dashboards.has(to)) return "right";
  if (dashboards.has(from) && to === "/") return "left";
  return null;
}
