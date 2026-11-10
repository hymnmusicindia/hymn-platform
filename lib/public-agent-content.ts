import { publicBusiness, publicServices } from "./public-business";
import { distributionPlanCards } from "./distribution-plans";
import { getTrackPricingQuote, UGC_ADDON_PRICE } from "./distribution-pricing";
import { CONTENT_ID_REQUEST_FEE } from "./content-id-access";
import { DISTRIBUTION_POLICY_SUMMARY } from "./policy-content";

export const publicPricingNotes = `One-time distribution is priced per track, with bulk discounts. UGC platforms cost INR ${UGC_ADDON_PRICE} extra on one-time purchases when selected. YouTube Content ID access requests cost INR ${CONTENT_ID_REQUEST_FEE} when applicable and require eligibility and approval. Optional add-ons and extra Yearly+ artist slots may increase the total. Eligible first releases can receive the base-track discount; review the eligibility rules. Checkout confirms the final payable amount and terms before payment.`;
export const publicFaqs = [
  { question: "What does HYMN Music offer?", answer: publicBusiness.description },
  { question: "How much does music distribution cost?", answer: `One-time distribution starts at INR ${getTrackPricingQuote(1).finalPrice} for one track. Subscription prices are listed on the public pricing page. Optional add-ons cost extra.` },
  { question: "Does HYMN take an additional royalty commission?", answer: DISTRIBUTION_POLICY_SUMMARY },
];

export function distributionPricing(trackCount = 1) {
  return { currency: "INR", oneTime: getTrackPricingQuote(trackCount), plans: distributionPlanCards.map(plan => ({ key: plan.key, name: plan.title, price: plan.price, cadence: plan.cadence, artistLimit: plan.artistLimit })), notes: publicPricingNotes, royaltyTerms: DISTRIBUTION_POLICY_SUMMARY };
}

export function publicOffers(origin: string) {
  return distributionPlanCards.map(plan => ({ "@type": "Offer", "@id": `${origin}/pricing#${plan.key}`, name: plan.title, price: plan.price, priceCurrency: "INR", url: `${origin}/pricing#${plan.key}`, description: `${plan.cadence}. ${plan.featureList.join(". ")}. ${publicPricingNotes}`, seller: { "@id": `${origin}/#organization` }, itemOffered: { "@id": `${origin}/#service-distribution` } }));
}

export function homeStructuredData(origin: string) {
  return { "@context": "https://schema.org", "@graph": [
    { "@type": "WebPage", "@id": `${origin}/#page`, url: `${origin}/`, name: "HYMN Music — Music Distribution, Beats & Artist Services", isPartOf: { "@id": `${origin}/#website` }, about: { "@id": `${origin}/#organization` } },
    ...publicServices.map(service => ({ "@type": "Service", "@id": `${origin}/#service-${service.key}`, name: service.name, description: service.description, serviceType: service.name, url: `${origin}${service.path}`, provider: { "@id": `${origin}/#organization` }, ...(service.key === "distribution" ? { offers: publicOffers(origin) } : {}) })),
    { "@type": "FAQPage", "@id": `${origin}/#questions`, mainEntity: publicFaqs.map(faq => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: faq.answer } })) },
  ] };
}

export function homeMarkdown(origin: string) {
  return `# HYMN Music\n\n> ${publicBusiness.description}\n\n## Services\n\n${publicServices.map(service => `- [${service.name}](${origin}${service.path}): ${service.description}`).join("\n")}\n\n## Distribution pricing\n\n${distributionPlanCards.map(plan => `- ${plan.title}: INR ${plan.price} / ${plan.cadence}. ${plan.artistLimit} artist profiles.`).join("\n")}\n\n${publicPricingNotes}\n\n${DISTRIBUTION_POLICY_SUMMARY}\n\n[Full pricing and fees](${origin}/pricing) · [First-release eligibility](${origin}/first-release)\n\n## Contact\n\n- Email: [${publicBusiness.email}](mailto:${publicBusiness.email})\n- Phone: [${publicBusiness.telephone}](tel:${publicBusiness.telephone})\n- [Contact HYMN](${origin}/contact)\n- Official profiles: ${publicBusiness.sameAs.join(", ")}\n\n## Frequently asked questions\n\n${publicFaqs.map(faq => `### ${faq.question}\n\n${faq.answer}`).join("\n\n")}\n\n## More information\n\n- [About HYMN](${origin}/about)\n- [Music guides](${origin}/blog)\n- [Help and FAQs](${origin}/faq)\n- [Policies](${origin}/policies)\n- [Agent index](${origin}/llms.txt)\n- [MCP server card](${origin}/.well-known/mcp/server-card.json)\n\nAccount, checkout, uploads and consultation booking require signing in. Public agent tools only read public business, service and pricing information; they cannot place orders or book meetings.\n`;
}

export function llmsText(origin: string) {
  return `# HYMN Music\n\n> ${publicBusiness.description}\n\n## Public information\n\n- [Homepage in Markdown](${origin}/index.md): Public services, pricing summary, contact and FAQs. Also available at / with Accept: text/markdown.\n- [Pricing](${origin}/pricing): Public distribution plan prices in INR and optional-fee notes.\n- [Music distribution](${origin}/music-distribution): Release workflow and royalty terms.\n- [Beat store](${origin}/beat-store): Beat licences; prices and rights vary by listing.\n- [Studio](${origin}/studio): Engineer services and listing-specific prices.\n- [Artist services](${origin}/services)\n- [First release](${origin}/first-release): Discount eligibility and conditions.\n- [Contact](${origin}/contact): ${publicBusiness.email}; ${publicBusiness.telephone}.\n- [About](${origin}/about)\n- [FAQ](${origin}/faq)\n- [Blog](${origin}/blog)\n- [Policies](${origin}/policies)\n- [Sitemap](${origin}/sitemap.xml)\n\n## Agent tools\n\n- [MCP server card](${origin}/.well-known/mcp/server-card.json): Streamable HTTP at ${origin}/mcp, public read-only tools, no authentication.\n- [MCP documentation](${origin}/agents): Capabilities, protocol and examples.\n\nPublic tools expose business details, services and distribution pricing. No private account, Team OS, Admin OS, customer, payment, calendar or upload data is exposed. Sign-in and explicit user actions are required for transactions.\n\n## Content use\n\nSee [robots.txt](${origin}/robots.txt): search=yes, ai-train=no. These preferences do not grant rights to train on or redistribute artists' recordings, artwork or licensed beats.\n`;
}
