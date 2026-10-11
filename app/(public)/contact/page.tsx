import Link from "next/link";
import { ContactForm } from "@/components/contact-form";
import { ArrowUpRight, LifeBuoy, MessageCircle, BookOpen, AudioLines } from "lucide-react";
import { getSession } from "@/lib/session";
import type { Metadata } from "next";
import "@/app/styles/contact-center.css";

export const metadata: Metadata = { title: "Contact", description: "Talk to HYMN Music about distribution, studio services, release support and partnerships.", alternates: { canonical: "/contact" } };

export default async function ContactPage() {
  const session = await getSession();
  return <main className="contact-center"><div className="contact-inner">
    <header className="contact-hero"><p className="contact-kicker"><AudioLines size={15} /> CONTACT HYMN</p>
      <h1>Good music starts<br />with a <span>conversation.</span></h1>
      <p>Have a release in mind, a question, or a bigger idea? Let&apos;s find your next move.</p>
    </header>
    <div className="contact-layout"><aside className="contact-channels" aria-label="Ways to reach HYMN">
      <p className="contact-kicker">THE RIGHT PLACE TO START</p>
      <Link href="/dashboard?tab=support" className="contact-channel"><LifeBuoy size={21} strokeWidth={1.5}/><span><strong>Help with your account or release</strong><small>Create a support request and follow its progress.</small></span><ArrowUpRight size={17}/></Link>
      <Link href="/faq" className="contact-channel"><BookOpen size={21} strokeWidth={1.5}/><span><strong>A quick answer</strong><small>Explore distribution, royalties, licensing and more.</small></span><ArrowUpRight size={17}/></Link>
      <a href="https://wa.me/918793643228" target="_blank" rel="noopener noreferrer" className="contact-channel"><MessageCircle size={21} strokeWidth={1.5}/><span><strong>Start a WhatsApp conversation</strong><small>Speak with HYMN about your music or next project.</small></span><ArrowUpRight size={17}/></a>
      <div className="contact-aside-note"><span>MADE FOR YOUR NEXT CHAPTER</span><p>Independent artists.<br />Ambitious producers.<br /><em>One shared love for music.</em></p></div>
    </aside>
    <section className="contact-compose" aria-labelledby="contact-form-heading"><div className="contact-compose-heading"><p className="contact-kicker">LET&apos;S TALK</p><h2 id="contact-form-heading">Tell us what you have in mind.</h2><p>A few details will help us point you in the right direction.</p></div><ContactForm initialName={session?.name} initialEmail={session?.email}/></section>
    </div>
  </div></main>;
}
