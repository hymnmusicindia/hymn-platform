import { CheckoutExperience } from "@/components/checkout-experience";

export default async function CheckoutPage({ searchParams }: { searchParams?: Promise<{ product?: string }> }) {
  const params = (await searchParams) ?? {};

  return (
    <main className="pb-20">
      <CheckoutExperience product={params.product} />
    </main>
  );
}
