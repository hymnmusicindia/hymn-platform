import { z } from "zod";

export const emailButtonUrl = z.string().trim().url().max(2000).refine(value => /^https?:\/\//i.test(value), "Use a full HTTP or HTTPS link.");
export const manualEmailBlock = z.discriminatedUnion("type", [
  z.object({ type: z.literal("paragraph"), text: z.string().trim().min(1).max(10000) }),
  z.object({ type: z.literal("notice"), text: z.string().trim().min(1).max(5000) }),
  z.object({ type: z.literal("button"), label: z.string().trim().min(1).max(80), url: emailButtonUrl })
]);
export const manualEmailSchema = z.object({
  requestId: z.string().uuid(),
  to: z.string().trim().email().max(320),
  subject: z.string().trim().min(1).max(180),
  title: z.string().trim().min(1).max(200),
  greeting: z.string().trim().max(200),
  blocks: z.array(manualEmailBlock).min(1).max(30)
});
export const savedManualEmailSchema = manualEmailSchema.extend({
  to: z.string().max(320), subject: z.string().max(180), title: z.string().max(200),
  blocks: z.array(z.discriminatedUnion("type", [
    z.object({ type: z.literal("paragraph"), text: z.string().max(10000) }),
    z.object({ type: z.literal("notice"), text: z.string().max(5000) }),
    z.object({ type: z.literal("button"), label: z.string().max(80), url: z.string().max(2000) })
  ])).max(30)
});
export type ManualEmailBlock = z.infer<typeof manualEmailBlock>;
export type ManualEmailDraft = z.infer<typeof manualEmailSchema>;
