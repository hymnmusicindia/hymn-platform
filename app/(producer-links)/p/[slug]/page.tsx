import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProducerLinkData } from "@/lib/producer-link-data";
import { ProducerLinkPage } from "@/components/producer-link-page";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await getProducerLinkData(slug);
  if (!data) return { title: "Producer not found", robots: { index: false } };
  const title = `${data.name} — Beats & links`;
  const description = data.bio || `Listen to ${data.name}'s beats and connect with them.`;
  const image = data.banner.startsWith("data:") ? "/assets/hymnlogowhite.png" : data.banner;
  return { title, description, alternates: { canonical: `/p/${slug}` },
    openGraph: { title, description, url: `/p/${slug}`, images: [{ url: image, alt: data.name }] },
    twitter: { card: "summary_large_image", title, description, images: [image] }
  };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const [data, session] = await Promise.all([getProducerLinkData((await params).slug), getSession()]);
  if (!data) notFound();
  return <ProducerLinkPage key={data.slug} {...data} beats={data.beats.slice(0,6)} totalBeats={data.beats.length} initialViewer={session ? { name:session.name, email:session.email, avatarUrl:session.avatarUrl } : null}/>;
}
