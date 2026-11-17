"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import styles from "./page-history-navigation.module.css";

type BrowserNavigation = EventTarget & { canGoBack: boolean; canGoForward: boolean };

export function PageHistoryNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const [available, setAvailable] = useState({ back: false, forward: false });
  useEffect(() => {
    const navigation = (window as Window & { navigation?: BrowserNavigation }).navigation;
    const update = () => setAvailable({ back: navigation?.canGoBack ?? window.history.length > 1, forward: navigation?.canGoForward ?? true });
    update();
    navigation?.addEventListener("currententrychange", update);
    window.addEventListener("popstate", update);
    window.addEventListener("pageshow", update);
    return () => {
      navigation?.removeEventListener("currententrychange", update);
      window.removeEventListener("popstate", update);
      window.removeEventListener("pageshow", update);
    };
  }, [pathname]);
  return <nav className={styles.navigation} aria-label="Page history">
    <button type="button" aria-label="Go back" title="Go back" disabled={!available.back} onClick={() => router.back()}><ArrowLeft size={16} aria-hidden="true"/></button>
    <button type="button" aria-label="Go forward" title="Go forward" disabled={!available.forward} onClick={() => router.forward()}><ArrowRight size={16} aria-hidden="true"/></button>
  </nav>;
}
