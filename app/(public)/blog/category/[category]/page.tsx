import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BLOG_ARTICLES, BLOG_CATEGORIES, slugifyCategory } from "@/lib/blog-content";
import { BlogBrowser } from "@/components/blog-browser";
import { publicPageMetadata } from "@/lib/seo";

export function generateStaticParams(){return BLOG_CATEGORIES.map(category=>({category:slugifyCategory(category)}));}
export async function generateMetadata({params}:{params:Promise<{category:string}>}):Promise<Metadata>{const {category}=await params;const name=BLOG_CATEGORIES.find(c=>slugifyCategory(c)===category);return name?publicPageMetadata(`${name} Guides`,`Practical HYMN Music articles about ${name.toLowerCase()} for independent artists and music teams.`, `/blog/category/${category}`):{};}
export default async function CategoryPage({params}:{params:Promise<{category:string}>}){const {category}=await params;const name=BLOG_CATEGORIES.find(c=>slugifyCategory(c)===category);if(!name)notFound();const articles=BLOG_ARTICLES.filter(a=>a.category===name);return <main className="shell py-12 sm:py-16"><nav aria-label="Breadcrumb" className="text-sm text-[var(--text-muted)]"><Link href="/">HYMN Music</Link><span aria-hidden="true"> / </span><Link href="/blog">Blog</Link><span aria-hidden="true"> / </span><span>{name}</span></nav><header className="mt-8 max-w-3xl"><p className="hymn-kicker">BLOG TOPIC</p><h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-6xl">{name}</h1><p className="mt-4 text-base leading-7 text-[var(--text-muted)]">{articles.length} practical articles for your next decision.</p></header><BlogBrowser initialCategory={name}/></main>}
