import "server-only";
import { manualEmailSchema, type ManualEmailDraft } from "@/lib/manual-email";
import { emailLayout, emailText } from "@/lib/email/email-templates";
import { getPublicAppUrl } from "@/lib/public-app-url";

export function renderManualEmail(input: ManualEmailDraft) {
  const draft = manualEmailSchema.parse(input);
  const model = { title: draft.title, greeting: draft.greeting, body: "", ctaLabel: "", ctaUrl: getPublicAppUrl() + "/dashboard", blocks: draft.blocks };
  return { subject: draft.subject, html: emailLayout(model), text: emailText(model) };
}
