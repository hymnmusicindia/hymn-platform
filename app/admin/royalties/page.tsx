import { redirect } from "next/navigation";
import { requireAdminPermission } from "@/lib/access";
import { RoyaltyManagement } from "@/components/royalty-management";

export default async function RoyaltyManagementPage() { const admin = await requireAdminPermission("royalties.import"); if ("error" in admin) redirect("/admin/login"); return <main className="mx-auto min-h-screen max-w-7xl px-5 pb-16 pt-28 sm:px-8 sm:pt-32"><div className="mb-8"><p className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: "var(--text-muted)" }}>Admin workspace · Finance</p><h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Royalty Management</h1><p className="mt-3 max-w-3xl text-sm leading-6 sm:text-base" style={{ color: "var(--text-muted)" }}>Import DireNote revenue reports, verify catalogue matches, apply royalty splits, and manage immutable financial records from one workspace.</p></div><RoyaltyManagement /></main>; }

// vercel trigger 14
