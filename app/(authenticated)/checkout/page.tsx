import { CheckoutExperience } from "@/components/checkout-experience";
import { redirect } from "next/navigation";

export default async function CheckoutPage({ searchParams }: { searchParams?: Promise<{ product?: string; extraArtists?: string }> }) {
  const params = (await searchParams) ?? {};
  if (params.product !== "beatstore" && !["subscription-half_yearly", "subscription-yearly", "subscription-yearly_plus"].includes(params.product ?? "")) redirect("/distribution/start");

  return (
    <main className="pb-20">
      <CheckoutExperience product={params.product} extraArtistSlots={params.extraArtists === undefined ? 0 : Number(params.extraArtists)} />
    </main>
  );
}
