export const helpArticles = [
  { id: "release-rejected", module: "Distribution", title: "Release rejected or changes requested", body: "Open My Releases, select the release, review every marked field, then resubmit it for review.", tags: ["release", "rejected", "metadata", "correction", "direnote"], route: "/dashboard/releases?panel=redressal", ticketCategory: "release_correction" },
  { id: "payment-failed", module: "Payments", title: "Payment failed or fulfillment is missing", body: "Keep the Razorpay order and payment IDs. Do not pay twice when a successful charge is already visible; contact support for reconciliation.", tags: ["payment", "razorpay", "failed", "charged"], route: "/contact?category=payment", ticketCategory: "payment" },
  { id: "payout-missing", module: "Payout", title: "Payout or earnings are not visible", body: "Royalty reports generally take around 1.5 months. Open Payout to see available, pending, and paid balances.", tags: ["payout", "earnings", "royalty", "balance"], route: "/payout", ticketCategory: "payout" },
  { id: "beat-license", module: "Beat Store", title: "Beat license is missing", body: "Open Purchases to check license processing. Contact support with the purchase ID if it remains missing.", tags: ["beat", "license", "purchase", "download"], route: "/dashboard?tab=purchases", ticketCategory: "beat_license" },
  { id: "google-login", module: "Account", title: "Google login issue", body: "Retry from the HYMN login page with the same Google account. If it continues, create an account-access ticket.", tags: ["google", "login", "auth", "account"], route: "/login", ticketCategory: "account_access" }
] as const;

export function searchHelpArticles(query: string) {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [...helpArticles];
  return helpArticles.map((article) => ({ article, score: terms.reduce((score, term) => score + (`${article.title} ${article.body} ${article.module} ${article.tags.join(" ")}`.toLowerCase().includes(term) ? 1 : 0), 0) })).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score).map(({ article }) => article);
}
