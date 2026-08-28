import { permanentRedirect } from "next/navigation";

export default function ProducerDashboardLegacyPage() {
  permanentRedirect("/producer/dashboard");
}

// vercel trigger 11
