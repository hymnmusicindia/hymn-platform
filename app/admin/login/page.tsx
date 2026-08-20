import { AdminLoginForm } from "@/components/admin-login-form";

export default function AdminLoginPage() {
  return (
    <main className="auth-standalone-page relative min-h-screen overflow-hidden py-6 sm:py-12">
      <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(circle at 18% 20%, rgba(89,223,224,0.10), transparent 30%), radial-gradient(circle at 84% 14%, rgba(125,183,255,0.08), transparent 28%), linear-gradient(180deg, var(--bg), var(--bg-soft))" }} />
      <div className="shell relative">
        <AdminLoginForm />
      </div>
    </main>
  );
}

// vercel trigger 2

// vercel trigger 12
