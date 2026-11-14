import { PublicEntryHero, PublicEntryProof } from '@/components/public-entry-experience';
import { publicPageMetadata } from "@/lib/seo";
import { PartnershipLeadForm } from "@/components/partnership-lead-form";
import { ChevronDown } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = publicPageMetadata("Music Partnership Program", "Partner with HYMN Music on producer catalogs, release distribution and artist campaigns.", "/partnership-program");

export default function PartnershipProgramPage() {
  const sections = [
    ["Catalog partnerships", "Bring your beat catalogue or producer roster to HYMN and discuss the support your team needs."],
    ["Distribution partnerships", "Plan releases across your roster with shared preparation, clear responsibilities and delivery updates."],
    ["Campaign partnerships", "Explore creative campaigns and release rollouts that fit your artists and audience."]
  ] as const;

  return (
    <main className="shell py-12 sm:py-16">
      <PublicEntryHero partnership eyebrow="HYMN MUSIC / PARTNERSHIPS" title="Build the next chapter. Together." description="Bring your artists, catalogue or community to HYMN. Let?s discuss a partnership around music, clear responsibilities and shared growth."/>
      <PublicEntryProof offer={false}/>
      <div className="mt-8 grid gap-4 md:grid-cols-3 md:gap-6">
        {sections.map(([title, body]) => (
          <details key={`${title}-mobile`} className="ios-collapse rounded-[1.2rem] p-4 md:hidden">
            <summary className="flex list-none items-center justify-between gap-3 text-base font-semibold text-white">
              {title}
              <ChevronDown className="ios-collapse-icon h-4 w-4 shrink-0 text-white/70" />
            </summary>
            <div className="ios-collapse-content">
              <div className="ios-collapse-inner">
                <p className="mt-3 text-sm text-white/65">{body}</p>
              </div>
            </div>
          </details>
        ))}
        {sections.map(([title, body]) => (
          <article key={`${title}-desktop`} className="hidden rounded-[2rem] border border-border bg-white/5 p-6 md:block">
            <h2 className="text-2xl font-semibold text-white">{title}</h2>
            <p className="mt-4 text-white/65">{body}</p>
          </article>
        ))}
      </div>

      <div id="partnership-enquiry" className="mt-8 scroll-mt-24 sm:mt-10"><h2 className="mb-6 text-2xl font-semibold">Tell us what you?re building.</h2>
        <PartnershipLeadForm />
      </div>
    </main>
  );
}


