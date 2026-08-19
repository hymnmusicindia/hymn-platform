import { ContactForm } from "@/components/contact-form";


export default function ContactPage() {
  return (
    <main className="shell py-12 sm:py-16">
      <div className="mb-8 max-w-3xl sm:mb-10">
        <h1 className="text-3xl font-bold sm:text-4xl lg:text-5xl"
          style={{ color: "var(--text)" }}
        >Reach HYMN for distribution, services, and partnerships.</h1>
      </div>
      <div className="mb-8 rounded-xl p-5 sm:flex sm:items-center sm:justify-between sm:gap-6" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        <div>
          <p className="text-lg font-semibold" style={{ color: "var(--text)" }}>Reach us directly on WhatsApp</p>
          <p className="mt-1 text-sm" style={{ color: "var(--text-soft)" }}>Message HYMN on WhatsApp for quick support and partnership conversations.</p>
        </div>
        <a
          href="https://wa.me/918793643228"
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition sm:mt-0"
          style={{ background: "var(--text)", color: "var(--bg)" }}
        >
          Chat on WhatsApp
        </a>
      </div>
      <ContactForm />
    </main>
  );
}


// vercel trigger 2
