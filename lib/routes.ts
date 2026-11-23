import type { UserRole } from "@/lib/types";
export function qcReportReturnPath(value?:string){return value && /^\/dashboard\/releases\/[1-9]\d*\/qc-report$/.test(value)?value:undefined;}

export function reportReturnPath(value?: string) {
  if (typeof value !== 'string' || !value || value.length > 250 || !value.startsWith('/') || value.startsWith('//') || /[\\\s\u0000-\u001f\u007f]/.test(value)) return undefined;
  // Preserve task context without allowing external redirects, API routes or login loops.
  // Destination pages retain their own authorization checks.
  let url: URL;
  try { url = new URL(value, 'https://hymn.invalid'); } catch { return undefined; }
  if (url.origin !== 'https://hymn.invalid' || url.pathname.includes('%') || url.pathname !== value.split(/[?#]/)[0]) return undefined;
  const exactOnly = /^\/(?:team\/performance|partnerships\/activate)(?:\/|$)/.test(url.pathname) || url.pathname.endsWith('/qc-report');
  if (exactOnly && (url.search || url.hash)) return undefined;
  if (url.hash && !(url.pathname === '/beat-store' && url.hash === '#producer-suggestions')) return undefined;
  const taskParameters = new Set(['edit','draft','campaign','onboarding','subscriptions','recommended','utm_source','utm_medium','utm_campaign','utm_content','utm_term','tab','listing','product','plan','ref','referral_code','genre','mood','budgetMax','budgetMin','search','sort','license','beatId','view','audioAssetId','correctionField','resume','manage','stage','submitted','amend','beatPurchaseId']);
  if ([...url.searchParams.keys()].some(key => !taskParameters.has(key))) return undefined;
  const task = /^(?:\/(?:first-release|producer-onboarding|welcome|pricing|services|consultation|checkout|analytics|payout)|\/distribution\/start|\/dashboard(?:\/(?:releases(?:\/[1-9]\d*(?:\/qc-report)?)?|purchases(?:\/[1-9]\d*)?|studio|playlists))?|\/producer\/dashboard|\/beat-store(?:\/producers\/[a-z0-9-]+)?|\/studio(?:\/(?:start|apply|readiness|orders\/[a-zA-Z0-9_-]+|engineers\/[a-z0-9-]+))?)$/;
  const workspaceTask = /^(?:\/(?:library|audio-library|artist-journey|managed-services)|\/promotion\/youtube-oac|\/studio\/engineer(?:\/(?:profile|proof))?|\/producer\/deliveries(?:\/[1-9]\d*)?|\/producer\/beats\/[1-9]\d*\/sample-license)$/;
  return task.test(url.pathname) || workspaceTask.test(url.pathname) || /^\/team\/performance(?:\/[1-9]\d*)?$/.test(url.pathname) || /^\/partnerships\/activate\/[a-f0-9]{64}$/.test(url.pathname) ? value : undefined;
}

export function loginForTask(value: string) {
  // If optional campaign parameters are unsupported or too long, retain the
  // approved task itself rather than dropping the user at the homepage.
  const next = reportReturnPath(value) ?? reportReturnPath(value.split(/[?#]/)[0]);
  return next ? `/login?next=${encodeURIComponent(next)}` : '/login';
}

export function destinationForRole(role: UserRole) {
  if (role === "admin") return "/dashboard";
  if (role === "producer") return "/producer/dashboard";
  return "/dashboard";
}

export function destinationAfterLogin(role: UserRole) {
  return role === "admin" ? "/admin" : "/";
}
