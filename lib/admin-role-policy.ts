export const isAdminAuthority = (role: string) => role === "owner" || role === "super_admin";
export const adminRoleGuidance: Record<string, { purpose: string; boundary: string }> = {
  owner: { purpose: "Founder oversight and protected administration", boundary: "All permissions; changes to other administrators require recent authentication." },
  super_admin: { purpose: "Trusted platform administrator", boundary: "Full authority. Assign sparingly; cannot change own role through the portal." },
  qc_reviewer: { purpose: "Metadata, artwork and release quality review", boundary: "Review work only; no payouts, role grants or provider credentials." },
  distribution_operator: { purpose: "Approved delivery, retries and status coordination", boundary: "Distribution permissions only; cannot override QC or grant access." },
  finance_operator: { purpose: "Royalty imports, reconciliation and ledger operations", boundary: "Financial permissions are distinct from payout approval and paid confirmation." },
  payout_approver: { purpose: "Review and authorise eligible payout requests", boundary: "Approval is not a bank transfer. Existing KYC, balance and payout gates remain." },
  support_agent: { purpose: "Client support and permitted account/service coordination", boundary: "No administrator grants, payout execution or production configuration." },
  rights_operator: { purpose: "Rights, takedown and ownership investigation", boundary: "Evidence-led review; no automatic contract execution or copyright transfer." },
  read_only_auditor: { purpose: "Authorised reporting and audit inspection", boundary: "Read-only permissions; no operational mutations." },
};
