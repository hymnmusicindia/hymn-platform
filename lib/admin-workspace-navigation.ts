import type { AdminPermissionKey } from "@/lib/access";
type Item={key:string;label:string;description:string;group:string;href?:string};
export const adminWorkspaceNavigation:Item[]=[
        { key: "overview", label: "Operations Dashboard", description: "Queues requiring attention", group: "Command Center" },
        { key: "notifications", label: "Notifications", description: "Operations feed", group: "Command Center" },
        { key: "analytics", label: "Operational Reporting", description: "Persisted platform activity", group: "Command Center" },
        {key:"manual-catalogue",label:"Manual catalogue",description:"Assigned and imported release records",group:"Distribution Operations",href:"/admin/releases/manual"},
        { key: "releases", label: "Releases", description: "Catalogue, QC review and failed deliveries", group: "Distribution Operations" },
        { key: "delivery", label: "Distributor Delivery", description: "Distribution and store status", group: "Distribution Operations" },
        { key: "updates", label: "Changes & takedowns", description: "Metadata and delivery changes", group: "Distribution Operations", href: "/admin/release-change-requests" },
        { key: "fraud", label: "Fraud Detection", description: "Risk monitoring and investigations", group: "Distribution Operations", href: "/admin/fraud" },
        { key: "referrals-admin", label: "Referrals", description: "Attribution, credits and abuse review", group: "Money Operations", href: "/admin/referrals" },
        { key: "growth", label: "Growth", description: "Campaigns, inquiries and repeat releases", group: "Money Operations", href: "/admin/growth" },
        { key: "revenue", label: "HYMN Revenue", description: "Collections, commissions and payment records", group: "Command Center" },
        { key: "royalties", label: "Payouts", description: "Withdrawal controls", group: "Money Operations" },
        { key: "earnings-entry", label: "Royalty Management", description: "Import reports and manage ledgers", group: "Money Operations", href: "/admin/royalties" },
        { key: "reconciliation", label: "Reconciliation", description: "Resolve unmatched statement rows", group: "Money Operations", href: "/admin/royalties/reconciliation" },
        { key: "kyc", label: "KYC", description: "Payout-profile review", group: "Money Operations", href: "/admin/payout-profiles" },
        { key: "managed-services", label: "Managed Services", description: "CRBT, OAC and Content ID", group: "Growth / Content", href: "/admin/managed-services" },
        { key: "artists", label: "Artists", description: "Profiles and creators", group: "Growth / Content" },
        { key: "promotions", label: "Promotions", description: "Campaign operations and redemptions", group: "Growth / Content", href:"/admin/campaigns" },
        { key: "playlist-reviews", label: "Playlist reviews", description: "Curator approval and paid-feedback operations", group: "Growth / Content", href: "/admin/playlist-reviews" },
        { key: "timed-playlists", label: "Timed Playlists", description: "Playlist scheduling", group: "Growth / Content" },
        { key: "content", label: "Content Settings", description: "Site and producer content", group: "Growth / Content" },
        { key: "newsletter", label: "Newsletter", description: "Audience and email campaigns", group: "Growth / Content", href: "/admin/newsletter" },
        { key: "producers", label: "Producers", description: "Applications and catalog", group: "Marketplace" },
        { key: "operations", label: "Producers / Beats / Orders", description: "Storefronts, inventory and orders", group: "Marketplace" },
        { key: "reviews", label: "Reviews", description: "Moderate customer feedback", group: "Marketplace" },
        { key: "contracts", label: "Contracts", description: "Agreements and splits", group: "Support / Legal" },
        { key: "support", label: "Support Tickets", description: "Inbound help", group: "Support / Legal" },
        {key:"studio-admin",label:"Engineer approvals",description:"Pending Mix / Master applications and Studio delivery",group:"Marketplace",href:"/admin/studio"},
        {key:"contributors-admin",label:"Contributor identities",description:"Canonical creator records",group:"Platform",href:"/admin/contributors"},
        {key:"campaign-redemptions",label:"Promotion redemptions",description:"Recorded discounts and campaign use",group:"Growth / Content",href:"/admin/promotions"},
        {key:"leads-admin",label:"Enquiries",description:"Customer and partnership enquiries",group:"Growth / Content",href:"/admin/leads"},
        {key:"audit-admin",label:"Audit log",description:"Recorded platform actions",group:"Platform",href:"/admin/audit-logs"},
        {key:"email-admin",label:"Email delivery",description:"Transactional delivery and failures",group:"Platform",href:"/admin/email-logs"},
        {key:"webhooks-admin",label:"Webhook events",description:"Provider event handling",group:"Platform",href:"/admin/webhook-events"},
        { key: "users", label: "Users", description: "Accounts, catalogue and activity", group: "Platform" },
        { key: "team", label: "Team", description: "Staff operations", group: "Platform" },
        { key: "activity", label: "Activity and Logs", description: "Active admins and session history", group: "Platform" },
        { key: "integrations", label: "Integrations & health", description: "Provider configuration and readiness", group: "Platform", href: "/admin/integrations/direnote" },
        { key: "settings", label: "Settings", description: "Platform config", group: "Platform" }
      ];
const required:Record<string,AdminPermissionKey[]>={
 "manual-catalogue":["system.manage"],"studio-admin":["services.manage"],"contributors-admin":["users.read"],"campaign-redemptions":["users.read"],"leads-admin":["users.manage"],"audit-admin":["audit.read"],"email-admin":["system.manage"],"webhooks-admin":["system.manage"],
  notifications:["system.manage"],users:["users.read"],artists:["users.read"],producers:["users.read","services.manage"],team:["system.manage"],activity:["audit.read"],analytics:["audit.read"],
  releases:["releases.read","releases.review","distribution.retry"],"distribution-queue":["releases.review"],"delivery-failed":["distribution.retry"],delivery:["releases.read"],updates:["updates.review","takedowns.review"],takedowns:["takedowns.review"],fraud:["fraud.read"],
  payments:["payouts.review","royalties.reconcile"],revenue:["payouts.review","royalties.reconcile"],royalties:["payouts.review"],"earnings-entry":["royalties.import"],reconciliation:["royalties.reconcile"],kyc:["kyc.review"],
  settings:["system.manage"],integrations:["system.manage"],health:["system.manage"],content:["system.manage"],newsletter:["system.manage"],
  "managed-services":["services.manage"],"playlist-reviews":["services.manage"],operations:["services.manage","users.read"],reviews:["services.manage"],support:["services.manage"],promotions:["system.manage"],"timed-playlists":["services.manage"],contracts:["services.manage"],growth:["audit.read"],"referrals-admin":["fraud.read","wallets.adjust"]
};
export function adminModuleAllowed(key:string,permissions:readonly string[]){return key === "overview" ? permissions.length > 0 : Boolean(required[key]?.some(permission=>permissions.includes(permission)));}
export function adminNavigation(permissions:readonly string[]){return adminWorkspaceNavigation.filter(item=>item.key !== "producers" && adminModuleAllowed(item.key,permissions));}
