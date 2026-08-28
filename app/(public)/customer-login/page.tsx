import { redirect } from "next/navigation";

export default function CustomerLoginPage() {
  redirect("/login?role=customer");
}
