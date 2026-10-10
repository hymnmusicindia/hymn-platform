export const homeGoals = [
  { id: "release", group: "Distribution", title: "Release my music", description: "Get your next release ready for the world's music stores.", headline: "Your music. Ready for its next chapter.", action: "Start a release", href: "/distribution/start", related: [{ title: "Your release catalogue", copy: "Continue drafts and follow review updates.", href: "/dashboard/releases" }, { title: "Choose your release option", copy: "Compare subscriptions or release one single at a time.", href: "/distribution" }] },
  { id: "finish-release", group: "Distribution", title: "Continue my release", description: "Pick up your draft or respond to requested changes.", headline: "Let's get your release over the line.", action: "View my releases", href: "/dashboard/releases", related: [{ title: "Prepare your release", copy: "Keep your audio, artwork and credits together.", href: "/audio-library" }, { title: "Release questions, answered", copy: "Find help with metadata, artwork and delivery.", href: "/faq?category=Distribution" }] },
  { id: "buy-beat", group: "Beatstore", title: "Find my next beat", description: "Discover your sound and choose the right licence.", headline: "Your next song starts with a sound.", action: "Explore beats", href: "/beat-store", related: [{ title: "Your purchased beats", copy: "Access your files and licences in one place.", href: "/dashboard?tab=purchases" }, { title: "Finish the record", copy: "Explore mixing and mastering for your next song.", href: "/studio" }] },
  { id: "sell-beats", group: "Beatstore", title: "Sell my beats", description: "Build your producer storefront and beat catalogue.", headline: "Build a catalogue artists come back to.", action: "Open producer workspace", href: "/producer/dashboard", related: [{ title: "Explore the Beatstore", copy: "See how artists discover and license beats.", href: "/beat-store" }, { title: "Licensing essentials", copy: "Understand the options your customers choose.", href: "/faq" }] },
  { id: "studio", group: "Mixing / Mastering", title: "Mix or master my music", description: "Find the service your project needs to sound finished.", headline: "Give your record its finishing touch.", action: "Explore studio services", href: "/studio", related: [{ title: "Your studio projects", copy: "Follow orders, deliveries and project updates.", href: "/dashboard/studio" }, { title: "Your original masters", copy: "Keep your source audio organised and ready.", href: "/audio-library" }] }
] as const;

export function homeGoal(id?: string) {
  return homeGoals.find(goal => goal.id === id) ?? homeGoals[0];
}

export function onboardingTarget(target: string, goalId?: string) {
  if (!target.startsWith("/") || target.startsWith("//") || target.includes("\\")) return "/";
  const url = new URL(target, "https://hymn.local");
  if (goalId === "studio" && url.pathname === "/services") url.pathname = "/studio";
  // Existing generated plans used `draft`; the release editor accepts `resume`.
  if (url.pathname === "/distribution/start" && url.searchParams.has("draft")) {
    url.searchParams.set("resume", url.searchParams.get("draft")!);
    url.searchParams.delete("draft");
  }
  return url.pathname + url.search;
}

export type HomeGuide = { userId: number; goalId?: string; title: string; description: string; href: string; phase: "navigation" | "destination" };
export const guideKey = (userId: number) => `hymn:goal-guide:${userId}`;
export function beginHomeGuide(guide: Omit<HomeGuide, "phase">) {
  const detail: HomeGuide = { ...guide, href: onboardingTarget(guide.href, guide.goalId), phase: "navigation" };
  try { sessionStorage.setItem(guideKey(guide.userId), JSON.stringify(detail)); } catch { /* Guidance remains available without storage. */ }
  window.dispatchEvent(new CustomEvent("hymn-start-goal-guide", { detail }));
}

export type HomeBannerId = "platforms" | "releases" | "journey" | "beats" | "producers" | "studio";
export function homeFeedSections(goalId: string | undefined, visit: number): HomeBannerId[] {
  const sections: HomeBannerId[] = goalId === "buy-beat" ? ["beats","studio","releases"]
    : goalId === "sell-beats" ? ["producers","beats","studio"]
    : goalId === "studio" ? ["studio","releases","journey"]
    : ["platforms","releases","journey","studio"];
  const pinned = sections.includes("platforms") ? ["platforms" as const] : [];
  const rotating = sections.filter(id => id !== "platforms");
  const offset = Math.abs(visit) % rotating.length;
  return [...pinned, ...rotating.slice(offset), ...rotating.slice(0,offset)];
}
