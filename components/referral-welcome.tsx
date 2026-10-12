"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { REFERRAL_WELCOME_EVENT, REFERRAL_WELCOME_KEY } from "@/lib/referral-welcome-client";
import "@/app/styles/referral-welcome.css";

type Welcome = { name: string; avatar: string | null };

export function ReferralWelcome() {
  const pathname = usePathname();
  const [welcome, setWelcome] = useState<Welcome | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    if (/^\/(login|signup|auth)(\/|$)/.test(pathname || "")) return;
    function show() {
      try {
        const raw = sessionStorage.getItem(REFERRAL_WELCOME_KEY);
        if (!raw) return;
        sessionStorage.removeItem(REFERRAL_WELCOME_KEY);
        const value = JSON.parse(raw);
        if (typeof value.name !== "string" || !value.name.trim() || typeof value.expiresAt !== "number" || value.expiresAt < Date.now()) return;
        setImageFailed(false);
        setWelcome({ name: value.name, avatar: typeof value.avatar === "string" && /^(https?:\/\/|\/[^/]|data:image\/)/i.test(value.avatar) ? value.avatar : null });
      } catch { /* Ignore expired or unavailable browser storage. */ }
    }
    function dismiss(event: KeyboardEvent) { if (event.key === "Escape") setWelcome(null); }
    show();
    window.addEventListener(REFERRAL_WELCOME_EVENT, show);
    window.addEventListener("keydown", dismiss);
    return () => { window.removeEventListener(REFERRAL_WELCOME_EVENT, show); window.removeEventListener("keydown", dismiss); };
  }, [pathname]);

  useEffect(() => {
    if (!welcome) return;
    const timer = setTimeout(() => setWelcome(null), 4200);
    return () => clearTimeout(timer);
  }, [welcome]);

  if (!welcome) return null;
  return <div className="referral-welcome" onClick={() => setWelcome(null)}>
    <div className="referral-welcome-content" role="status" aria-live="polite" aria-atomic="true">
      <span className="referral-welcome-avatar">{welcome.avatar && !imageFailed
        ? <Image src={welcome.avatar} alt="" width={88} height={88} unoptimized onError={() => setImageFailed(true)} />
        : welcome.name.trim().slice(0, 1).toUpperCase()}</span>
      <div><p>You joined through</p><strong>{welcome.name}</strong><span>Welcome to your HYMN circle.</span></div>
    </div>
  </div>;
}
