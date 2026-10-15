import { getSession } from "@/lib/session";
import { JoinTeam } from "@/components/team/join";
export const metadata = { title: "Join Team OS", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function JoinPage() {
  return <JoinTeam authenticated={!!await getSession()} />;
}
