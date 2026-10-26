import type { MetadataRoute } from "next";
import { getPublicAppUrl } from "@/lib/public-app-url";
import { prisma } from "@/lib/prisma";
import { policyDocuments } from "@/lib/policy-content";
import { ENGINEER_GENRES } from "@/lib/engineer-applications";
import { BLOG_ARTICLES, BLOG_CATEGORIES, slugifyCategory } from "@/lib/blog-content";

export const revalidate = 3600;

const routes = [
  ["", 1, "daily"],
  ["/beat-store", 0.95, "daily"],
  ["/studio", 0.9, "weekly"],
  ["/services", 0.85, "monthly"],
  ["/music-distribution", 0.9, "monthly"],
  ["/first-release", 0.8, "monthly"],
  ["/about", 0.75, "monthly"],
  ["/mission", 0.75, "monthly"],
  ["/partnership-program", 0.7, "monthly"],
  ["/faq", 0.7, "monthly"],
  ["/contact", 0.65, "monthly"],
  ["/policies", 0.5, "monthly"],
  ["/privacy-policy", 0.35, "yearly"],
  ["/terms-of-service", 0.35, "yearly"]
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = getPublicAppUrl();
  const [producers,engineers]=await Promise.all([
    prisma.producerProfile.findMany({where:{active:true,status:'active',user:{role:{in:['PRODUCER','ADMIN']},status:'ACTIVE'}},select:{slug:true,updatedAt:true},take:10000,orderBy:{id:'asc'}}),
    prisma.engineerProfile.findMany({where:{sellerState:'ACTIVE',listings:{some:{active:true,paused:false,serviceType:'MIXING_MASTERING'}}},select:{slug:true,updatedAt:true},take:10000,orderBy:{id:'asc'}})
  ]);
  return [
    ...routes.map(([path, priority, changeFrequency]) => ({ url: `${origin}${path}`, changeFrequency, priority })),
    { url: `${origin}/blog`, changeFrequency: "weekly" as const, priority: 0.75 },
    ...BLOG_CATEGORIES.map(category => ({ url: `${origin}/blog/category/${slugifyCategory(category)}`, changeFrequency: "weekly" as const, priority: 0.55 })),
    ...BLOG_ARTICLES.map(article => ({ url: `${origin}/blog/${article.slug}`, lastModified: new Date(`${article.updatedAt}T00:00:00.000Z`), changeFrequency: "monthly" as const, priority: article.featured ? 0.7 : 0.6 })),
    {url:`${origin}/studio/readiness`},
    {url:`${origin}/playlist-review-terms`},
    ...policyDocuments.filter(policy=>!['privacy','terms'].includes(policy.slug)).map(policy=>({url:`${origin}/policies/${encodeURIComponent(policy.slug)}`})),
    ...ENGINEER_GENRES.map(genre=>({url:`${origin}/studio/genres/${genre.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`})),
    ...producers.map(p=>({url:`${origin}/beat-store/producers/${encodeURIComponent(p.slug)}`,lastModified:p.updatedAt})),
    ...engineers.map(e=>({url:`${origin}/studio/engineers/${encodeURIComponent(e.slug)}`,lastModified:e.updatedAt}))
  ];
}
