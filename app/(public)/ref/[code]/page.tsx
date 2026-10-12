import { redirect } from "next/navigation";

export default async function ReferralLandingPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  redirect(`/join?ref=${encodeURIComponent(code)}`);
}

// vercel trigger 2
