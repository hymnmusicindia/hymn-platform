import { redirect } from "next/navigation";

export default function ProducerLoginPage() {
  redirect("/login?role=producer");
}
