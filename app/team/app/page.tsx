import Link from "next/link";
import { Smartphone } from "lucide-react";
import { getTeamAppRelease } from "@/lib/team-app-release";
import { TeamAppLinks } from "@/components/team/app-download-links";
import { ThemeToggle } from "@/components/theme-toggle";
import styles from "@/components/team/app-download.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Download HYMN Team App", robots: { index: false, follow: false } };

export default async function TeamAppPage() {
  const release = await getTeamAppRelease();
  return <main className={styles.page}>
    <header className={styles.header}><strong>HYMN TEAM</strong><Link href="/team">Open Team OS</Link><ThemeToggle /></header>
    <section className={styles.card}>
      <Smartphone size={38} aria-hidden="true" />
      <h1>HYMN Team app</h1>
      <p>Your work, calls, schedule, team chat and notifications on Android.</p>
      {release ? <><div className={styles.version}><strong>Version {release.version}</strong><span>{(release.size / 1048576).toFixed(1)} MB · Android 8.0 or later</span></div><TeamAppLinks /></> : <p role="status">The Android download is temporarily unavailable. Please try again shortly.</p>}
      <h2>Install on your Android phone</h2>
      <ol><li>Tap <strong>Download Android app</strong> and open the downloaded APK.</li><li>If Android asks, allow this browser to install apps, then tap <strong>Install</strong>.</li><li>Open HYMN Team and sign in with your invited team account.</li></ol>
      <h2>Stay up to date</h2>
      <p>This page and the download link always provide the latest published APK. Open this page again to check its version and install an update over your existing app.</p>
      <p>On iPhone or iPad, open <Link href="/team">Team OS</Link> in Safari and choose Share → Add to Home Screen. On desktop, copy the app link and send it to your phone.</p>
    </section>
  </main>;
}
