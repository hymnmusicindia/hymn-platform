import { ContactForm } from "@/components/contact-form";

export default function ContactPage() {
  return (
    <main className="shell py-12 sm:py-16">
      <div className="mb-8 max-w-3xl sm:mb-10">
        <span className="eyebrow">Contact</span>
        <h1 className="text-3xl font-semibold text-white sm:text-4xl lg:text-5xl">Reach HYMN for distribution, services, and partnerships.</h1>
        <p className="mt-4 text-sm text-white/68 sm:text-base">
          Contact messages are stored in the database layer so inquiries can feed directly into internal follow-up workflows.
        </p>
      </div>
      <ContactForm />
    </main>
  );
}

